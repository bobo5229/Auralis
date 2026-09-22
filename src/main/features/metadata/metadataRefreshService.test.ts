import type { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetadataRefreshService } from './metadataRefreshService'
import type { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerResult } from './metadataRefreshTypes'
import { assertMetadataFingerprint } from './readStableMetadata'
import { writeAudioTags } from './audioTagWriteService'

const workers = vi.hoisted(() => [] as EventEmitter[])
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      constructor() {
        super()
        workers.push(this)
      }
    },
  }
})
vi.mock('./readStableMetadata', () => ({
  assertMetadataFingerprint: vi.fn(async () => undefined),
  readStableMetadata: vi.fn(),
}))
vi.mock('./audioTagWriteService', () => ({ writeAudioTags: vi.fn() }))
vi.mock('../../logging/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const payload = {
  jobId: 1,
  generation: 0,
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
    createJob: vi.fn(() => ++job),
    getTrackFilePath: vi.fn(() => 'isolated.flac'),
    updateTrackMetadata: vi.fn(),
    updateTrackLyrics: vi.fn(),
    addFailure: vi.fn(),
    updateJobProgress: vi.fn(),
    completeJob: vi.fn(),
    getJobById: vi.fn(() => ({ scope: 'tracks' })),
    commitVerifiedUserEdit: vi.fn(),
    markTrackMissing: vi.fn(),
  }
  const send = vi.fn()
  const service = new MetadataRefreshService(
    repo as unknown as MetadataRefreshRepository,
    'cache',
    send,
  )
  return { repo, service, send }
}
beforeEach(() => {
  workers.length = 0
  vi.clearAllMocks()
  vi.mocked(assertMetadataFingerprint).mockReset().mockResolvedValue()
})

describe('metadata result acceptance', () => {
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
  it.each(['stat', 'sql', 'path', 'generation', 'job'] as const)(
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
          generation: failure === 'generation' ? 4 : 0,
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
  it('a user write invalidates an already-parsed worker result and queues failed-write reconciliation', async () => {
    const { service, repo } = setup()
    const gate = deferred<void>()
    vi.mocked(writeAudioTags).mockReturnValueOnce(gate.promise)
    service.refreshTrack(1)
    const save = service.updateTrackMetadata({ trackId: 1 } as Parameters<
      typeof service.updateTrackMetadata
    >[0])
    const rejected = expect(save).rejects.toThrow()
    workers[0].emit('message', { type: 'result', payload })
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(repo.completeJob).toHaveBeenCalled())
    expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
    gate.resolve()
    await rejected
    expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
    expect(workers).toHaveLength(2)
    workers[1].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
  })
})
