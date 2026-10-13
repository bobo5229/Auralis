import type { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetadataRefreshService, type MetadataWriteCoordinator } from './metadataRefreshService'
import type { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerResult } from './metadataRefreshTypes'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { writeAudioTags } from './audioTagWriteService'
import type { PlaybackMetadataTagWrite } from './metadataTagWriteCoordinator'

const workers = vi.hoisted(() => [] as EventEmitter[])
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
function setup(coordinator?: MetadataWriteCoordinator) {
  let job = 0
  const repo = {
    markInterruptedJobs: vi.fn(),
    getActiveJob: vi.fn(() => true),
    getTracksByIds: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    getTracksWithMissingLyrics: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    createJob: vi.fn(() => ++job),
    getTrackFilePath: vi.fn(() => 'isolated.flac'),
    getEditableTrackMetadata: vi.fn(
      () => null as import('@shared/types/libraryScan').EditableTrackMetadata | null,
    ),
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
    'isolated-bin/ffmpeg.exe',
    coordinator,
  )
  return { repo, service, send }
}
beforeEach(() => {
  workers.length = 0
  vi.clearAllMocks()
  vi.mocked(assertMetadataFingerprint).mockReset().mockResolvedValue()
})

describe('metadata result acceptance', () => {
  it('routes lyric-only edits through the playback writer even when other fields are unchanged', async () => {
    const { service, repo } = setup({
      tryAcquireWriteLease: () => ({ ok: false, reason: 'playback-in-use' }),
      releaseWriteLease: vi.fn(),
    })
    repo.getEditableTrackMetadata.mockReturnValue({
      trackId: 1,
      title: 'Before',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    const commit = vi.fn(async () => undefined)
    const guard = vi.fn(async () => undefined)
    const committed = vi.fn()
    const writer = vi.fn<PlaybackMetadataTagWrite>(async (_path, metadata, reconcile) => {
      expect(metadata.lyricsText).toBe('[00:01.20]Edited')
      await reconcile(commit)
      return { ok: true as const }
    })
    service.setPlaybackTagWriteHandler(writer)
    expect(await service.updateTrackLyrics(1, '[00:01.20]Edited', guard, committed)).toEqual({
      ok: true,
    })
    expect(writer).toHaveBeenCalledOnce()
    expect(guard).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    expect(committed).toHaveBeenCalledOnce()
    expect(repo.updateTrackLyrics).toHaveBeenCalledWith(payload)
    expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
  })
  it('reconciles a published file after the database commit fails and notifies from accepted disk data', async () => {
    const { service, repo, send } = setup()
    repo.getJobById.mockReturnValue({ scope: 'file-change' })
    repo.commitVerifiedUserEdit.mockImplementationOnce(() => {
      throw new Error('SQL failed')
    })
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    await expect(
      service.updateTrackMetadata({
        trackId: 1,
        title: 'Published',
        artistDisplay: null,
        albumTitle: null,
        albumArtistDisplay: null,
        genreDisplay: null,
        year: null,
        releaseDate: null,
      }),
    ).rejects.toThrow('SQL failed')
    expect(service.isWritingFile('isolated.flac')).toBe(false)
    expect(send.mock.calls.some(([channel]) => channel === 'library:changed')).toBe(false)
    expect(workers).toHaveLength(1)
    const accepted = { ...payload, generation: 1 }
    workers[0].emit('message', { type: 'result', payload: accepted })
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
    expect(repo.updateTrackMetadata).toHaveBeenCalledWith(accepted)
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'file-change',
      trackIds: [1],
      filePaths: [],
    })
    await service.shutdown()
  })

  it('cancels deferred failed-save reconciliation after a successful retry', async () => {
    const { service, repo } = setup()
    service.refreshTrack(1)
    const metadata = {
      trackId: 1,
      title: 'Retry',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    }
    vi.mocked(writeAudioTags).mockRejectedValueOnce(new Error('save failed'))
    await expect(service.updateTrackMetadata(metadata)).rejects.toThrow('save failed')
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    expect(await service.updateTrackMetadata(metadata)).toEqual({ ok: true })
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
    workers[0].emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
    expect(workers).toHaveLength(1)
    await service.shutdown()
  })
  it('skips an unchanged canonical edit before acquiring a lease, suppressing watchers or mutating data', async () => {
    const coordinator = { tryAcquireWriteLease: vi.fn(), releaseWriteLease: vi.fn() }
    const { service, repo } = setup(coordinator)
    const metadata = {
      trackId: 1,
      title: 'Title',
      artistDisplay: 'A; B',
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: 2026,
      releaseDate: '2026',
    }
    repo.getEditableTrackMetadata.mockReturnValue(metadata)
    const suppress = vi.fn()
    service.setTagWriteSuccessHandler(suppress)
    expect(
      await service.updateTrackMetadata({
        ...metadata,
        title: ' Title ',
        artistDisplay: 'A; B; a',
        albumTitle: '  ',
      }),
    ).toEqual({ ok: true })
    expect(coordinator.tryAcquireWriteLease).not.toHaveBeenCalled()
    expect(writeAudioTags).not.toHaveBeenCalled()
    expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
    expect(suppress).not.toHaveBeenCalled()
    expect(workers).toHaveLength(0)
  })
  it('passes the same canonical request to file writing and database commit', async () => {
    const { service, repo } = setup()
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    const metadata = {
      trackId: 1,
      title: ' Title ',
      artistDisplay: ' A;  ; B; a ',
      albumTitle: ' Album ',
      albumArtistDisplay: 'C; D; c',
      genreDisplay: 'Pop; Live; pop',
      year: null,
      releaseDate: null,
    }
    await service.updateTrackMetadata(metadata)
    const canonical = {
      ...metadata,
      title: 'Title',
      artistDisplay: 'A; B',
      albumTitle: 'Album',
      albumArtistDisplay: 'C; D',
      genreDisplay: 'Pop; Live',
    }
    expect(writeAudioTags).toHaveBeenCalledWith(
      'isolated.flac',
      canonical,
      'isolated-bin/ffmpeg.exe',
    )
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledWith(canonical, payload)
  })
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

  it('waits for a user file write and its verified database commit', async () => {
    const { service, repo } = setup()
    const gate = deferred<void>()
    vi.mocked(writeAudioTags).mockReturnValueOnce(gate.promise)
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    const save = service.updateTrackMetadata({
      trackId: 1,
      title: null,
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    let stopped = false
    const shutdown = service.shutdown().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
    gate.resolve()
    await Promise.all([save, shutdown])
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
    expect(writeAudioTags).toHaveBeenCalledWith(
      'isolated.flac',
      expect.any(Object),
      'isolated-bin/ffmpeg.exe',
    )
  })

  it.each(['2025-02-31', '2025-04-31', '2025-13', '2025-00-01'])(
    'rejects %s before touching the audio file',
    async (releaseDate) => {
      const { service, repo } = setup()
      await expect(
        service.updateTrackMetadata({
          trackId: 1,
          title: null,
          artistDisplay: null,
          albumTitle: null,
          albumArtistDisplay: null,
          genreDisplay: null,
          year: 2025,
          releaseDate,
        }),
      ).rejects.toThrow('Release Date')
      expect(writeAudioTags).not.toHaveBeenCalled()
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
      expect(workers).toHaveLength(0)
    },
  )

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
    vi.mocked(readStableMetadata).mockRejectedValueOnce(new Error('Written tags do not match'))
    const gate = deferred<void>()
    vi.mocked(writeAudioTags).mockReturnValueOnce(gate.promise)
    service.refreshTrack(1)
    const save = service.updateTrackMetadata({
      trackId: 1,
      title: null,
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    expect(service.hasActiveArtworkWrites()).toBe(true)
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

  describe('playback and write coordination', () => {
    it('returns playback-in-use without calling writeAudioTags, modifying repo, or queuing reconciliation', async () => {
      const coordinator = {
        tryAcquireWriteLease: vi.fn(() => ({
          ok: false as const,
          reason: 'playback-in-use' as const,
        })),
        releaseWriteLease: vi.fn(),
      }
      const { service, repo } = setup(coordinator)

      const result = await service.updateTrackMetadata({
        trackId: 1,
        title: 'New Title',
        artistDisplay: null,
        albumTitle: null,
        albumArtistDisplay: null,
        genreDisplay: null,
        year: null,
        releaseDate: null,
      })

      expect(result).toEqual({ ok: false, reason: 'playback-in-use' })
      expect(coordinator.tryAcquireWriteLease).toHaveBeenCalledWith('isolated.flac', 'track-1')
      expect(writeAudioTags).not.toHaveBeenCalled()
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
      expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
      expect(coordinator.releaseWriteLease).not.toHaveBeenCalled()
      expect(service.hasActiveArtworkWrites()).toBe(false)
    })

    it('acquires write lease on success and releases it in finally', async () => {
      const coordinator = {
        tryAcquireWriteLease: vi.fn(() => ({ ok: true as const, leaseId: 'lease_test_write' })),
        releaseWriteLease: vi.fn(),
      }
      const { service, repo } = setup(coordinator)
      vi.mocked(writeAudioTags).mockResolvedValueOnce(undefined as never)
      vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)

      const result = await service.updateTrackMetadata({
        trackId: 1,
        title: 'New Title',
        artistDisplay: null,
        albumTitle: null,
        albumArtistDisplay: null,
        genreDisplay: null,
        year: null,
        releaseDate: null,
      })

      expect(result).toEqual({ ok: true })
      expect(coordinator.tryAcquireWriteLease).toHaveBeenCalledWith('isolated.flac', 'track-1')
      expect(writeAudioTags).toHaveBeenCalledOnce()
      expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
      expect(coordinator.releaseWriteLease).toHaveBeenCalledWith('lease_test_write')
    })
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
