import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerInput } from './metadataRefreshTypes'
import { MetadataRefreshWorkerHost } from './metadataRefreshWorkerHost'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFileFingerprint } from '../libraryScan/libraryScanFileFingerprint'
import { getLyricsSidecarFingerprintSync } from './resolveLyricsForFile'

const workers = vi.hoisted(() => [] as EventEmitter[])
const credits = vi.hoisted(() => [] as SharedArrayBuffer[])
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      constructor(_file: string, options: { workerData: { messageCredits: SharedArrayBuffer } }) {
        super()
        workers.push(this)
        credits.push(options.workerData.messageCredits)
      }
      terminate = vi.fn(async () => {
        this.emit('exit', 1)
        return 1
      })
    },
  }
})
vi.mock('./readStableMetadata', () => ({ assertMetadataFingerprint: vi.fn(async () => undefined) }))
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

let host: MetadataRefreshWorkerHost | undefined
beforeEach(() => {
  workers.length = 0
  credits.length = 0
})
afterEach(async () => {
  await host?.shutdown()
  host = undefined
})
function fixture(count: number, admission?: DatabaseWriteAdmission) {
  const tracks = Array.from({ length: count }, (_, index) => ({
    trackId: index + 1,
    filePath: `isolated-${index + 1}.flac`,
  }))
  const repo = {
    getJobById: vi.fn(() => ({ scope: 'tracks' })),
    getTrackFilePath: vi.fn((id: number) => `isolated-${id}.flac`),
    updateTrackMetadata: vi.fn(),
    addFailure: vi.fn(),
    markTrackMissing: vi.fn(),
    updateJobProgress: vi.fn(),
    completeJob: vi.fn(),
  }
  const events = { refreshProgress: vi.fn(), libraryChanged: vi.fn() }
  host = new MetadataRefreshWorkerHost(
    repo as unknown as MetadataRefreshRepository,
    events,
    vi.fn(),
    admission,
  )
  host.start({ jobId: 1, tracks, artworkCacheDir: 'isolated' } as MetadataRefreshWorkerInput)
  const worker = workers[0]
  const result = (id: number) =>
    worker.emit('message', {
      type: 'result',
      payload: { jobId: 1, trackId: id, sourceFilePath: `isolated-${id}.flac` },
    })
  const failure = (id: number) =>
    worker.emit('message', {
      type: 'failure',
      payload: { jobId: 1, trackId: id, filePath: `isolated-${id}.flac`, reason: 'parse error' },
    })
  const progress = () =>
    worker.emit('message', {
      type: 'progress',
      payload: { jobId: 1, processed: count + 50, failed: 0 },
    })
  return { worker, repo, events, result, failure, progress }
}

describe('metadata refresh progress coalescing', () => {
  it('persists interruption if the worker exits during a terminate call that later rejects', async () => {
    const f = fixture(2)
    f.result(1)
    await vi.waitFor(() => expect(f.repo.updateTrackMetadata).toHaveBeenCalledOnce())
    let reject!: (error: Error) => void
    const worker = f.worker as EventEmitter & { terminate: ReturnType<typeof vi.fn> }
    worker.terminate.mockImplementationOnce(
      () =>
        new Promise<number>((_resolve, fail) => {
          reject = fail
        }),
    )
    const stopped = host!.shutdown('Background recovery yielded')
    f.result(2)
    worker.emit('message', { type: 'complete', sequence: 1 })
    worker.emit('exit', 0)
    await delay(10)
    reject(new Error('termination failed'))
    await stopped
    expect(f.repo.updateTrackMetadata).toHaveBeenCalledOnce()
    expect(f.repo.completeJob).toHaveBeenCalledExactlyOnceWith(1, 'Background recovery yielded')
    expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 0)
    expect(host!.jobId).toBeNull()
  })
  it('returns producer credit after the failure has actually passed write admission', async () => {
    const admission = new DatabaseWriteAdmission()
    const f = fixture(1, admission)
    const lease = await admission.acquireExclusive()
    const count = new Int32Array(credits[0])
    Atomics.sub(count, 0, 1)
    f.worker.emit('message', {
      type: 'failure',
      sequence: 1,
      payload: { jobId: 1, trackId: 1, filePath: 'isolated-1.flac', reason: 'parse error' },
    })
    await delay(10)
    expect(f.repo.addFailure).not.toHaveBeenCalled()
    expect(Atomics.load(count, 0)).toBe(31)
    lease.release()
    await vi.waitFor(() => expect(f.repo.addFailure).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(Atomics.load(count, 0)).toBe(32))
  })
  it('does not commit old lyrics if the sidecar changes while admission is held', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'auralis-refresh-admission-'))
    try {
      const path = join(dir, 'track.flac')
      const lyric = join(dir, 'track.lrc')
      writeFileSync(path, 'audio')
      writeFileSync(lyric, '[00:01]old')
      const snapshot = getLyricsSidecarFingerprintSync(path)
      const admission = new DatabaseWriteAdmission()
      const repo = {
        getJobById: vi.fn(() => ({ scope: 'tracks' })),
        getTrackFilePath: vi.fn(() => path),
        updateTrackMetadata: vi.fn(),
        addFailure: vi.fn(),
        updateJobProgress: vi.fn(),
        completeJob: vi.fn(),
      }
      const events = { refreshProgress: vi.fn(), libraryChanged: vi.fn() }
      host = new MetadataRefreshWorkerHost(
        repo as unknown as MetadataRefreshRepository,
        events,
        vi.fn(),
        admission,
      )
      host.start({ jobId: 1, tracks: [{ trackId: 1, filePath: path }], artworkCacheDir: dir })
      const exclusive = await admission.acquireExclusive()
      workers[0].emit('message', {
        type: 'result',
        payload: {
          jobId: 1,
          trackId: 1,
          sourceFilePath: path,
          fileFingerprint: scanFileFingerprint(statSync(path)),
          lyricsSidecarFingerprint: snapshot,
        },
      })
      await delay(20)
      writeFileSync(lyric, '[00:01]new different lyrics')
      exclusive.release()
      workers[0].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalledOnce())
      expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
      expect(repo.addFailure).toHaveBeenCalledOnce()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('counts an old source failure after its track path changes while waiting', async () => {
    const admission = new DatabaseWriteAdmission()
    const f = fixture(1, admission)
    const exclusive = await admission.acquireExclusive()
    f.worker.emit('message', {
      type: 'failure',
      payload: {
        jobId: 1,
        trackId: 1,
        filePath: 'isolated-1.flac',
        reason: 'ENOENT',
      },
    })
    await delay(20)
    f.repo.getTrackFilePath.mockReturnValue('replacement.flac')
    exclusive.release()
    f.worker.emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(f.repo.completeJob).toHaveBeenCalledOnce())
    expect(f.repo.addFailure).toHaveBeenCalledWith(1, 1, 'isolated-1.flac', 'ENOENT')
    expect(f.repo.markTrackMissing).not.toHaveBeenCalled()
    expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, 0, 1)
  })

  it.each(['timeout', 'full'] as const)(
    'recovers a %s terminal after admission becomes available',
    async (mode) => {
      const admission = new DatabaseWriteAdmission(
        mode === 'full' ? 1 : 1024,
        mode === 'full' ? 1000 : 15,
      )
      const f = fixture(1, admission)
      const exclusive = await admission.acquireExclusive()
      const filler = mode === 'full' ? admission.runWrite(() => undefined) : undefined
      f.failure(1)
      await delay(50)
      expect(host!.jobId).toBe(1)
      expect(f.repo.completeJob).not.toHaveBeenCalled()
      exclusive.release()
      await filler
      await vi.waitFor(() => expect(host!.jobId).toBeNull())
      expect(f.repo.completeJob).toHaveBeenCalledOnce()
      expect(f.events.refreshProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      )
    },
  )

  it('retains the terminal write for shutdown retry when admission times out', async () => {
    const admission = new DatabaseWriteAdmission(1024, 15)
    const f = fixture(1, admission)
    const exclusive = await admission.acquireExclusive()
    await expect(host!.shutdown()).rejects.toMatchObject({ reason: 'timeout' })
    expect(host!.jobId).toBe(1)
    expect(f.repo.completeJob).not.toHaveBeenCalled()
    exclusive.release()
    await host!.shutdown()
    expect(f.repo.completeJob).toHaveBeenCalledOnce()
    expect(host!.jobId).toBeNull()
  })
  it.each([1000, 10000])(
    'coalesces %i isolated results and progress messages',
    async (count) => {
      const f = fixture(count)
      for (let id = 1; id <= count; id++) {
        f.result(id)
        f.progress()
      }
      await vi.waitFor(() => expect(f.repo.updateTrackMetadata).toHaveBeenCalledTimes(count), {
        timeout: 15000,
      })
      await vi.waitFor(() => expect(f.events.refreshProgress).toHaveBeenCalled(), { timeout: 5000 })
      const writes = f.repo.updateJobProgress.mock.calls.length
      const notices = f.events.refreshProgress.mock.calls.length
      expect(writes).toBeLessThan(10)
      expect(notices).toBe(writes)
      expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, count, 0)
      f.progress()
      await delay(250)
      expect(f.repo.updateJobProgress).toHaveBeenCalledTimes(writes)
      expect(f.events.refreshProgress).toHaveBeenCalledTimes(notices)
      f.worker.emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(f.repo.completeJob).toHaveBeenCalledOnce())
      expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, count, 0)
      expect(f.events.refreshProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'completed', processedTracks: count, failedTracks: 0 }),
      )
      expect(f.events.libraryChanged).toHaveBeenCalledOnce()
      console.log(
        `isolated ${count}: intermediate writes=${writes}, notifications=${notices}; terminal writes=1, notifications=1`,
      )
    },
    20000,
  )

  it('publishes new committed and failed counts at intervals while skipping duplicate values', async () => {
    const f = fixture(3)
    f.result(1)
    f.failure(2)
    f.progress()
    await vi.waitFor(() =>
      expect(f.events.refreshProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', processedTracks: 2, failedTracks: 1 }),
      ),
    )
    expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 1)
    const notices = f.events.refreshProgress.mock.calls.length
    f.progress()
    await delay(250)
    expect(f.events.refreshProgress).toHaveBeenCalledTimes(notices)
    f.result(3)
    f.progress()
    await vi.waitFor(() =>
      expect(f.events.refreshProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', processedTracks: 3, failedTracks: 1 }),
      ),
    )
    expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, 2, 1)
    f.worker.emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(f.repo.completeJob).toHaveBeenCalledOnce())
  })

  it.each(['complete', 'fatal', 'shutdown', 'yield'] as const)(
    'flushes committed and failed counts before %s and never emits late running',
    async (terminal) => {
      const f = fixture(3)
      f.result(1)
      f.failure(2)
      f.progress()
      await vi.waitFor(() => expect(f.repo.addFailure).toHaveBeenCalledOnce())
      if (terminal === 'shutdown' || terminal === 'yield')
        await host!.shutdown(
          terminal === 'yield' ? 'Background recovery yielded' : 'Application shutdown',
        )
      else if (terminal === 'fatal')
        f.worker.emit('message', { type: 'fatal', payload: { jobId: 1, reason: 'worker failed' } })
      else f.worker.emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(f.repo.completeJob).toHaveBeenCalledOnce())
      expect(f.repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 1)
      expect(f.events.refreshProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: terminal === 'complete' ? 'completed' : 'failed',
          processedTracks: 2,
          failedTracks: 1,
        }),
      )
      expect(f.events.libraryChanged).toHaveBeenCalledWith(
        expect.objectContaining({ trackIds: [1] }),
      )
      const notices = f.events.refreshProgress.mock.calls.length
      await delay(250)
      expect(f.events.refreshProgress).toHaveBeenCalledTimes(notices)
    },
  )
})
