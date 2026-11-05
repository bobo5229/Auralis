import type { EventEmitter } from 'node:events'
import { stat } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetadataRefreshEvents } from '@main/ipc/metadataRefreshEvents'
import { MetadataRefreshService } from './metadataRefreshService'
import type { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerResult } from './metadataRefreshTypes'
import { assertMetadataFingerprint } from './readStableMetadata'
import * as lyricsSidecars from './resolveLyricsForFile'

const workers = vi.hoisted(() => [] as EventEmitter[])
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, stat: vi.fn() }
})
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      terminate = vi.fn(async () => {
        this.emit('exit', 1)
        return 1
      })
      constructor() {
        super()
        workers.push(this)
      }
    },
  }
})
vi.mock('./readStableMetadata', () => ({
  assertMetadataFingerprint: vi.fn(async () => undefined),
}))
vi.mock('../../logging/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const payload = {
  jobId: 1,
  trackId: 1,
  sourceFilePath: 'isolated.flac',
  fileSize: 20,
  fileMtimeMs: 200,
} as MetadataRefreshWorkerResult
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function setup() {
  let job = 0
  const repo = {
    markInterruptedJobs: vi.fn(),
    getActiveJob: vi.fn(() => true),
    getTracksByIds: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    getTracksWithMissingLyrics: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    pruneLegacyLyricsJobs: vi.fn(),
    getLegacyTtmlTracks: vi.fn<MetadataRefreshRepository['getLegacyTtmlTracks']>(() => []),
    updateLegacyTtmlLyrics: vi.fn(() => true),
    createJob: vi.fn(() => ++job),
    getTrackFilePath: vi.fn<MetadataRefreshRepository['getTrackFilePath']>(() => 'isolated.flac'),
    getLegacyTtmlFilePath: vi.fn(() => 'isolated.flac'),
    updateTrackMetadata: vi.fn(),
    updateTrackLyrics: vi.fn(),
    addFailure: vi.fn(),
    updateJobProgress: vi.fn(),
    completeJob: vi.fn(),
    getJobById: vi.fn(() => ({ scope: 'tracks' })),
    markTrackMissing: vi.fn(),
  }
  const send = vi.fn()
  const service = new MetadataRefreshService(
    repo as unknown as MetadataRefreshRepository,
    'cache',
    createMetadataRefreshEvents(send),
  )
  return { repo, service, send }
}
beforeEach(() => {
  workers.length = 0
  vi.clearAllMocks()
  vi.mocked(assertMetadataFingerprint).mockReset().mockResolvedValue()
  vi.mocked(stat)
    .mockReset()
    .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
})

describe('metadata result acceptance', () => {
  it('drains an in-flight fingerprint check before finishing shutdown', async () => {
    const { service, repo } = setup()
    const gate = deferred<void>()
    vi.mocked(assertMetadataFingerprint).mockReturnValueOnce(gate.promise)
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    await vi.waitFor(() => expect(assertMetadataFingerprint).toHaveBeenCalledOnce())
    let stopped = false
    const shutdown = service.shutdown().then(() => {
      stopped = true
    })
    expect(() => service.refreshTrack(1)).toThrow('shutting down')
    await Promise.resolve()
    expect(stopped).toBe(false)
    gate.resolve()
    await shutdown
    expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
    expect(repo.completeJob).toHaveBeenCalledWith(1, expect.stringContaining('shutdown'))
    repo.completeJob.mockClear()
    workers[0].emit('message', { type: 'complete' })
    await Promise.resolve()
    expect(repo.completeJob).not.toHaveBeenCalled()
  })

  it('publishes missing tracks immediately even if the worker later fails', async () => {
    const { service, repo, send } = setup()
    service.refreshTrack(1)
    workers[0].emit('message', {
      type: 'failure',
      payload: { jobId: 1, trackId: 1, filePath: 'isolated.flac', reason: 'ENOENT' },
    })
    await vi.waitFor(() => expect(repo.markTrackMissing).toHaveBeenCalledWith(1))
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-missing',
      trackIds: [1],
      filePaths: [],
    })
    workers[0].emit('error', new Error('worker failed'))
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
    expect(send.mock.calls.filter(([channel]) => channel === 'library:changed')).toHaveLength(1)
  })

  it.each(['present', 'EACCES', 'EBUSY', 'ENOTDIR'])(
    'confirms a worker missing-file error against current filesystem state: %s',
    async (state) => {
      const { service, repo, send } = setup()
      if (state === 'present')
        vi.mocked(stat).mockResolvedValue({} as Awaited<ReturnType<typeof stat>>)
      else vi.mocked(stat).mockRejectedValue(Object.assign(new Error(state), { code: state }))
      service.refreshTrack(1)
      workers[0].emit('message', {
        type: 'failure',
        payload: { jobId: 1, trackId: 1, filePath: 'isolated.flac', reason: 'ENOENT' },
      })
      workers[0].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      expect(repo.markTrackMissing).toHaveBeenCalledTimes(state === 'ENOTDIR' ? 1 : 0)
      expect(repo.addFailure).toHaveBeenCalledTimes(state === 'ENOTDIR' ? 0 : 1)
      expect(
        send.mock.calls.filter(
          ([channel, event]) => channel === 'library:changed' && event.reason === 'track-missing',
        ),
      ).toHaveLength(state === 'ENOTDIR' ? 1 : 0)
    },
  )

  it.each(['path', 'shutdown'] as const)(
    'rechecks identity and lifecycle after awaiting missing confirmation: %s',
    async (boundary) => {
      const { service, repo, send } = setup()
      const gate = deferred<void>()
      vi.mocked(stat).mockImplementationOnce(async () => {
        await gate.promise
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      service.refreshTrack(1)
      workers[0].emit('message', {
        type: 'failure',
        payload: { jobId: 1, trackId: 1, filePath: 'isolated.flac', reason: 'ENOENT' },
      })
      await vi.waitFor(() => expect(stat).toHaveBeenCalledOnce())
      let shutdown: Promise<void> | undefined
      if (boundary === 'path') repo.getTrackFilePath.mockReturnValue('moved.flac')
      if (boundary === 'shutdown') shutdown = service.shutdown()
      gate.resolve()
      if (shutdown) await shutdown
      else {
        workers[0].emit('message', { type: 'complete' })
        await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      }
      expect(repo.markTrackMissing).not.toHaveBeenCalled()
      expect(
        send.mock.calls.filter(
          ([channel, event]) => channel === 'library:changed' && event.reason === 'track-missing',
        ),
      ).toHaveLength(0)
    },
  )

  it.each(['path', 'job', 'write-failure'] as const)(
    'does not publish missing state after a %s mismatch or failure',
    async (failure) => {
      const { service, repo, send } = setup()
      service.refreshTrack(1)
      if (failure === 'path') repo.getTrackFilePath.mockReturnValue('moved.flac')
      if (failure === 'write-failure')
        repo.markTrackMissing.mockImplementation(() => {
          throw new Error('SQL failure')
        })
      workers[0].emit('message', {
        type: 'failure',
        payload: {
          jobId: failure === 'job' ? 2 : 1,
          trackId: 1,
          filePath: 'isolated.flac',
          reason: 'ENOENT',
        },
      })
      workers[0].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      expect(send.mock.calls.some(([channel]) => channel === 'library:changed')).toBe(false)
    },
  )

  it('serializes complete/exit behind stat and commit', async () => {
    const { service, repo, send } = setup()
    const gate = deferred<void>()
    vi.mocked(assertMetadataFingerprint).mockReturnValueOnce(gate.promise)
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    workers[0].emit('message', { type: 'complete' })
    workers[0].emit('exit', 0)
    await vi.waitFor(() => expect(assertMetadataFingerprint).toHaveBeenCalledOnce())
    expect(repo.completeJob).not.toHaveBeenCalled()
    expect(service.hasActiveJob()).toBe(true)
    gate.resolve()
    await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalledWith(1))
    expect(repo.updateTrackMetadata).toHaveBeenCalledOnce()
    expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 0)
    expect(send).toHaveBeenCalledWith('library:changed', expect.objectContaining({ trackIds: [1] }))
  })
  it.each(['stat', 'sql', 'path', 'job'] as const)(
    'rejects %s failures and counts commits instead of worker progress',
    async (failure) => {
      const { service, repo, send } = setup()
      if (failure === 'stat')
        vi.mocked(assertMetadataFingerprint).mockRejectedValueOnce(new Error('file changed'))
      if (failure === 'sql')
        repo.updateTrackMetadata.mockImplementation(() => {
          throw new Error('SQL failure')
        })
      if (failure === 'path') repo.getTrackFilePath.mockReturnValue('moved.flac')
      service.refreshTrack(1)
      workers[0].emit('message', {
        type: 'result',
        payload: {
          ...payload,
          jobId: failure === 'job' ? 2 : 1,
        },
      })
      workers[0].emit('message', {
        type: 'progress',
        payload: { jobId: 1, processed: 1, failed: 0 },
      })
      workers[0].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalled())
      expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 0, 1)
      expect(repo.addFailure).toHaveBeenCalledOnce()
      expect(send.mock.calls.some(([channel]) => channel === 'library:changed')).toBe(false)
    },
  )
  it('rechecks path after asynchronous stat and ignores a finished worker during the next job', async () => {
    const { service, repo } = setup()
    const gate = deferred<void>()
    vi.mocked(assertMetadataFingerprint).mockReturnValueOnce(gate.promise)
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    await vi.waitFor(() => expect(assertMetadataFingerprint).toHaveBeenCalledOnce())
    repo.getTrackFilePath.mockReturnValue('moved.flac')
    gate.resolve()
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    workers[1].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalledTimes(2))
    expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
  })
  it('routes lyrics through the atomic repository decision', async () => {
    const { service, repo } = setup()
    service.refreshLyricsForMissing()
    workers[0].emit('message', { type: 'result', payload })
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalled())
    expect(repo.updateTrackLyrics).toHaveBeenCalledWith(payload)
  })
})

describe('metadata refresh worker host shutdown retry', () => {
  it('restores the active job after termination fails and completes shutdown on retry', async () => {
    const { service, repo } = setup()
    service.refreshTrack(1)
    const worker = workers[0] as EventEmitter & { terminate: () => Promise<number> }
    vi.spyOn(worker, 'terminate').mockRejectedValueOnce(new Error('termination failed'))
    await expect(service.shutdown()).rejects.toThrow('termination failed')
    expect(service.hasActiveJob()).toBe(true)
    expect(repo.completeJob).not.toHaveBeenCalled()
    expect(() => service.refreshTrack(1)).toThrow('shutting down')
    await service.shutdown()
    expect(service.hasActiveJob()).toBe(false)
    expect(repo.completeJob).toHaveBeenCalledExactlyOnceWith(
      1,
      'Application shutdown interrupted refresh',
    )
    expect(worker.terminate).toHaveBeenCalledTimes(2)
  })
})

describe('metadata refresh partial completion', () => {
  it.each(['fatal', 'error', 'exit'] as const)(
    'does not publish metadata changes or count unprocessed tracks after %s without commits',
    async (terminal) => {
      const { service, repo, send } = setup()
      service.refreshTrack(1)
      if (terminal === 'fatal')
        workers[0].emit('message', {
          type: 'fatal',
          payload: { jobId: 1, reason: 'Fatal refresh' },
        })
      else if (terminal === 'error') workers[0].emit('error', new Error('Worker error'))
      else workers[0].emit('exit', 1)
      await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 0, 0)
      expect(send).toHaveBeenCalledExactlyOnceWith('metadata:refresh-progress', {
        jobId: 1,
        status: 'failed',
        totalTracks: 1,
        processedTracks: 0,
        failedTracks: 0,
      })
    },
  )

  it.each(['fatal', 'error', 'exit'] as const)(
    'publishes committed tracks and actual counts once after %s, without affecting the next job',
    async (terminal) => {
      const { service, repo, send } = setup()
      repo.getTracksByIds.mockReturnValue([
        { trackId: 1, filePath: 'isolated.flac' },
        { trackId: 2, filePath: 'failed.flac' },
        { trackId: 3, filePath: 'unprocessed.flac' },
      ])
      service.refreshTracks([1, 2, 3])
      const worker = workers[0]
      worker.emit('message', { type: 'result', payload })
      worker.emit('message', {
        type: 'failure',
        payload: { jobId: 1, trackId: 2, filePath: 'failed.flac', reason: 'Invalid tags' },
      })
      if (terminal === 'fatal')
        worker.emit('message', { type: 'fatal', payload: { jobId: 1, reason: 'Fatal refresh' } })
      else if (terminal === 'error') worker.emit('error', new Error('Worker error'))
      else worker.emit('exit', 1)
      await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      expect(repo.updateTrackMetadata).toHaveBeenCalledExactlyOnceWith(payload)
      expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 1)
      expect(repo.completeJob).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledWith('library:changed', {
        reason: 'metadata-refresh',
        trackIds: [1],
        filePaths: [],
      })
      expect(send).toHaveBeenCalledWith('metadata:refresh-progress', {
        jobId: 1,
        status: 'failed',
        totalTracks: 3,
        processedTracks: 2,
        failedTracks: 1,
      })

      service.refreshTrack(1)
      worker.emit('message', { type: 'result', payload })
      worker.emit('message', { type: 'complete' })
      worker.emit('error', new Error('Late worker error'))
      worker.emit('exit', 1)
      workers[1].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalledTimes(2))
      expect(repo.updateTrackMetadata).toHaveBeenCalledOnce()
      expect(send.mock.calls.filter(([channel]) => channel === 'library:changed')).toHaveLength(1)
      expect(
        send.mock.calls.filter(([channel]) => channel === 'metadata:refresh-progress'),
      ).toHaveLength(2)
    },
  )

  it.each(['job-progress', 'renderer-progress', 'completion'] as const)(
    'retains committed changes and file-change scope when %s throws',
    async (failure) => {
      const { service, repo, send } = setup()
      repo.getJobById.mockReturnValue({ scope: 'file-change' })
      service.refreshTracksFromFileChanges([1])
      if (failure === 'job-progress')
        repo.updateJobProgress.mockImplementationOnce(() => {
          throw new Error('Progress SQL failed')
        })
      if (failure === 'renderer-progress')
        send.mockImplementationOnce((channel) => {
          if (channel === 'metadata:refresh-progress') throw new Error('Renderer send failed')
        })
      if (failure === 'completion')
        repo.completeJob.mockImplementationOnce(() => {
          throw new Error('Completion SQL failed')
        })
      workers[0].emit('message', { type: 'result', payload })
      if (failure !== 'completion')
        workers[0].emit('message', {
          type: 'progress',
          payload: { jobId: 1, processed: 1, failed: 0 },
        })
      workers[0].emit('message', { type: 'complete' })
      workers[0].emit('error', new Error('Late error'))
      workers[0].emit('exit', 1)
      await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
      expect(repo.updateTrackMetadata).toHaveBeenCalledExactlyOnceWith(payload)
      expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 0)
      expect(repo.completeJob).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledWith('library:changed', {
        reason: 'file-change',
        trackIds: [1],
        filePaths: [],
      })
      expect(send).toHaveBeenLastCalledWith('metadata:refresh-progress', {
        jobId: 1,
        status: 'failed',
        totalTracks: 1,
        processedTracks: 1,
        failedTracks: 0,
      })
      expect(send.mock.calls.filter(([channel]) => channel === 'library:changed')).toHaveLength(1)
    },
  )

  it('publishes previously committed tracks when shutting down', async () => {
    const { service, repo, send } = setup()
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    await vi.waitFor(() => expect(repo.updateTrackMetadata).toHaveBeenCalledOnce())
    await service.shutdown()
    expect(repo.updateJobProgress).toHaveBeenLastCalledWith(1, 1, 0)
    expect(repo.completeJob).toHaveBeenCalledExactlyOnceWith(
      1,
      'Application shutdown interrupted refresh',
    )
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'metadata-refresh',
      trackIds: [1],
      filePaths: [],
    })
    expect(send).toHaveBeenLastCalledWith('metadata:refresh-progress', {
      jobId: 1,
      status: 'failed',
      totalTracks: 1,
      processedTracks: 1,
      failedTracks: 0,
    })
  })

  it('notifies once after complete even when terminal progress delivery fails', async () => {
    const { service, repo, send } = setup()
    send.mockImplementation((channel) => {
      if (channel === 'metadata:refresh-progress') throw new Error('Renderer send failed')
    })
    service.refreshTrack(1)
    workers[0].emit('message', { type: 'result', payload })
    workers[0].emit('message', { type: 'complete' })
    workers[0].emit('error', new Error('Late error'))
    workers[0].emit('exit', 1)
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
    expect(repo.completeJob).toHaveBeenCalledExactlyOnceWith(1)
    expect(send.mock.calls.filter(([channel]) => channel === 'library:changed')).toEqual([
      ['library:changed', { reason: 'metadata-refresh', trackIds: [1], filePaths: [] }],
    ])
    expect(send).toHaveBeenLastCalledWith(
      'metadata:refresh-progress',
      expect.objectContaining({ status: 'completed', processedTracks: 1, failedTracks: 0 }),
    )
  })
})

describe('legacy lyric cache recovery', () => {
  it.each(['tracks', 'missing-lyrics'] as const)(
    'yields to a manual %s refresh and retries the interrupted recovery',
    async (scope) => {
      const { service, repo, send } = setup()
      repo.getLegacyTtmlTracks.mockReturnValue([{ trackId: 1, filePath: 'isolated.flac' }])
      vi.spyOn(lyricsSidecars, 'getLyricsSidecarFingerprintSync').mockReturnValue('[null,null]')
      service.startLegacyLyricsRecovery()
      await vi.waitFor(() => expect(workers).toHaveLength(1))
      workers[0].emit('message', {
        type: 'result',
        payload: { ...payload, lyricsSidecarFingerprint: '[null,null]' },
      })
      await vi.waitFor(() => expect(repo.updateLegacyTtmlLyrics).toHaveBeenCalledOnce())

      const result =
        scope === 'tracks' ? service.refreshTrack(1) : service.refreshLyricsForMissing()
      expect(result.jobId).toBe(2)
      expect(service.hasActiveJob()).toBe(true)
      expect(() => service.refreshTrack(1)).toThrow('already running')
      await vi.waitFor(() => expect(workers).toHaveLength(2))
      expect(repo.completeJob).toHaveBeenCalledWith(1, expect.stringContaining('yielded'))
      expect(send).toHaveBeenCalledWith(
        'library:changed',
        expect.objectContaining({ trackIds: [1] }),
      )
      workers[1].emit('message', { type: 'complete' })
      await vi.waitFor(() => expect(workers).toHaveLength(3), { timeout: 5000 })
      expect(repo.getLegacyTtmlTracks).toHaveBeenLastCalledWith(0, 128)
      await service.shutdown()
      vi.restoreAllMocks()
    },
  )

  it('reserves the worker during preemption and releases scan pause on shutdown', async () => {
    const { service, repo } = setup()
    repo.getLegacyTtmlTracks.mockReturnValue([{ trackId: 1, filePath: 'isolated.flac' }])
    service.startLegacyLyricsRecovery()
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    const gate = deferred<number>()
    vi.mocked(
      (workers[0] as EventEmitter & { terminate: () => Promise<number> }).terminate,
    ).mockReturnValueOnce(gate.promise)
    const paused = service.pauseLegacyLyricsRecovery()
    expect(service.refreshTrack(1).jobId).toBe(2)
    expect(service.hasActiveJob()).toBe(true)
    expect(() => service.refreshLyricsForMissing()).toThrow('already running')
    const shuttingDown = service.shutdown()
    let shutdownSettled = false
    void shuttingDown.then(() => {
      shutdownSettled = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(shutdownSettled).toBe(false)
    gate.resolve(1)
    await Promise.all([paused, shuttingDown])
    expect(workers).toHaveLength(1)
    expect(repo.completeJob).toHaveBeenCalledWith(2, expect.stringContaining('shutting down'))
    expect(service.hasActiveJob()).toBe(false)
  })

  it('replaces legacy lyrics with a guarded result and publishes the change', async () => {
    const { service, repo, send } = setup()
    repo.getLegacyTtmlTracks.mockImplementation((afterId) =>
      afterId ? [] : [{ trackId: 1, filePath: 'isolated.flac' }],
    )
    vi.spyOn(lyricsSidecars, 'getLyricsSidecarFingerprintSync').mockReturnValue('[null,null]')
    service.startLegacyLyricsRecovery()
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    workers[0].emit('message', {
      type: 'result',
      payload: {
        ...payload,
        lyricsSidecarFingerprint: '[null,null]',
        lyricsText: '[00:01]LRC',
        lyricsFormat: 'lrc',
      },
    })
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(repo.updateLegacyTtmlLyrics).toHaveBeenCalledOnce())
    expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('library:changed', expect.objectContaining({ trackIds: [1] }))
    await service.shutdown()
    vi.restoreAllMocks()
  })

  it('releases a scan pause if shutdown interrupts the recovery worker', async () => {
    const { service, repo } = setup()
    repo.getLegacyTtmlTracks.mockReturnValue([{ trackId: 1, filePath: 'isolated.flac' }])
    service.startLegacyLyricsRecovery()
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    const paused = service.pauseLegacyLyricsRecovery()
    await Promise.all([paused, service.shutdown()])
    expect(repo.completeJob).toHaveBeenCalled()
  })

  it('retains missing sources without marking tracks missing and drains before scan', async () => {
    const { service, repo } = setup()
    repo.getLegacyTtmlTracks.mockReturnValue([{ trackId: 1, filePath: 'isolated.flac' }])
    service.startLegacyLyricsRecovery()
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    let paused = false
    const waiting = service.pauseLegacyLyricsRecovery().then(() => {
      paused = true
    })
    workers[0].emit('message', {
      type: 'failure',
      payload: { jobId: 1, trackId: 1, filePath: 'isolated.flac', reason: 'ENOENT' },
    })
    await Promise.resolve()
    expect(paused).toBe(false)
    workers[0].emit('message', { type: 'complete' })
    await waiting
    expect(repo.markTrackMissing).not.toHaveBeenCalled()
    expect(repo.updateLegacyTtmlLyrics).not.toHaveBeenCalled()
    expect(repo.addFailure).toHaveBeenCalledOnce()
    await service.shutdown()
  })
})
