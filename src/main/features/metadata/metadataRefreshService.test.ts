import type { EventEmitter } from 'node:events'
import { stat } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMetadataRefreshEvents } from '@main/ipc/metadataRefreshEvents'
import { MetadataRefreshService, type MetadataWriteCoordinator } from './metadataRefreshService'
import type { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { MetadataRefreshWorkerResult } from './metadataRefreshTypes'
import { assertMetadataFingerprint, readStableMetadata } from './readStableMetadata'
import { writeAudioTags } from './audioTagWriteService'
import * as lyricsSidecars from './resolveLyricsForFile'
import type { PlaybackMetadataTagWrite } from './metadataTagWriteCoordinator'

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
function setup(coordinator?: MetadataWriteCoordinator, readLibraryRevision?: () => string) {
  let job = 0
  const repo = {
    markInterruptedJobs: vi.fn(),
    getActiveJob: vi.fn(() => true),
    getTracksByIds: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    getTracksWithMissingLyrics: vi.fn(() => [{ trackId: 1, filePath: 'isolated.flac' }]),
    pruneLegacyLyricsJobs: vi.fn(),
    getLegacyTtmlTracks: vi.fn(
      (_afterId: number, _limit: number) => [] as Array<{ trackId: number; filePath: string }>,
    ),
    updateLegacyTtmlLyrics: vi.fn(() => true),
    createJob: vi.fn(() => ++job),
    getTrackFilePath: vi.fn<MetadataRefreshRepository['getTrackFilePath']>(() => 'isolated.flac'),
    getLegacyTtmlFilePath: vi.fn(() => 'isolated.flac'),
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
    createMetadataRefreshEvents(send),
    'isolated-bin/ffmpeg.exe',
    coordinator,
    readLibraryRevision,
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
  it('writes the old database value when a failed save has already published another value', async () => {
    const { service, repo } = setup()
    const old = {
      trackId: 1,
      title: 'Old',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    }
    repo.getEditableTrackMetadata.mockReturnValue(old)
    service.refreshTrack(1) // Defer reconciliation while the user retries.
    vi.mocked(readStableMetadata).mockResolvedValue(payload)
    repo.commitVerifiedUserEdit.mockImplementationOnce(() => {
      throw new Error('SQL failed')
    })
    await expect(service.updateTrackMetadata({ ...old, title: 'Published' })).rejects.toThrow(
      'SQL failed',
    )
    expect(await service.updateTrackMetadata(old)).toEqual({ ok: true })
    expect(writeAudioTags).toHaveBeenCalledTimes(2)
    expect(writeAudioTags).toHaveBeenLastCalledWith('isolated.flac', old, 'isolated-bin/ffmpeg.exe')
    expect(repo.commitVerifiedUserEdit).toHaveBeenLastCalledWith(old, payload)
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(2)
  })

  it('drains a published failure added while another track is reconciling', async () => {
    const { service, repo, send } = setup()
    const gate = deferred<MetadataRefreshWorkerResult>()
    const firstAttempts = new Set([1, 2])
    repo.getTrackFilePath.mockImplementation((id) => `isolated-${id}.flac`)
    repo.commitVerifiedUserEdit.mockImplementation((metadata) => {
      if (firstAttempts.delete(metadata.trackId)) throw new Error('SQL failed')
    })
    let firstReads = 0
    vi.mocked(readStableMetadata).mockImplementation(async (id, path) => {
      if (id === 1 && ++firstReads === 2) return gate.promise
      return { ...payload, trackId: id, sourceFilePath: path }
    })
    const edit = (trackId: number) => ({
      trackId,
      title: 'Published',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    await expect(service.updateTrackMetadata(edit(1))).rejects.toThrow('SQL failed')
    await expect(service.updateTrackMetadata(edit(2))).rejects.toThrow('SQL failed')
    gate.resolve({ ...payload, sourceFilePath: 'isolated-1.flac' })
    await vi.waitFor(() => expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(4))
    expect(
      send.mock.calls
        .filter(([channel]) => channel === 'library:changed')
        .map(([, event]) => event.trackIds),
    ).toEqual([[1], [2]])
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(4)
  })

  it('does not let an older reconciliation commit or remove a newer failed write', async () => {
    const { service, repo } = setup()
    const gate = deferred<MetadataRefreshWorkerResult>()
    vi.mocked(readStableMetadata)
      .mockReset()
      .mockResolvedValue(payload)
      .mockResolvedValueOnce(payload)
      .mockReturnValueOnce(gate.promise)
    repo.commitVerifiedUserEdit
      .mockImplementationOnce(() => {
        throw new Error('SQL failed')
      })
      .mockImplementationOnce(() => {
        throw new Error('SQL failed')
      })
    const old = {
      trackId: 1,
      title: 'First',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    }
    await expect(service.updateTrackMetadata(old)).rejects.toThrow('SQL failed')
    const latest = { ...old, title: 'Latest' }
    await expect(service.updateTrackMetadata(latest)).rejects.toThrow('SQL failed')
    gate.resolve(payload)
    await vi.waitFor(() => expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(3))
    expect(repo.commitVerifiedUserEdit.mock.calls.map(([metadata]) => metadata.title)).toEqual([
      'First',
      'Latest',
      'Latest',
    ])
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(3)
  })

  it('does not spin on a persistent reconciliation failure', async () => {
    const { service, repo } = setup()
    vi.mocked(readStableMetadata).mockReset().mockResolvedValue(payload)
    repo.commitVerifiedUserEdit.mockImplementation(() => {
      throw new Error('SQL unavailable')
    })
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
    ).rejects.toThrow('SQL unavailable')
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(2)
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(3)
  })

  it('returns the exact committed revision carried by the success notification', async () => {
    const readRevision = vi.fn(() => '12:1')
    const { service, repo, send } = setup(undefined, readRevision)
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
    const result = await service.updateTrackMetadata({
      trackId: 1,
      title: 'Changed',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    expect(result).toEqual({ ok: true, libraryRevision: '12:1' })
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
    expect(readRevision).toHaveBeenCalledOnce()
    expect(repo.commitVerifiedUserEdit.mock.invocationCallOrder[0]).toBeLessThan(
      readRevision.mock.invocationCallOrder[0],
    )
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'metadata-refresh',
      trackIds: [1],
      filePaths: ['isolated.flac'],
      libraryRevision: '12:1',
    })
    await service.shutdown()
  })

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
    const metadata = {
      trackId: 1,
      title: 'Published',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    }
    repo.commitVerifiedUserEdit.mockImplementationOnce(() => {
      throw new Error('SQL failed')
    })
    vi.mocked(readStableMetadata).mockResolvedValueOnce(payload).mockResolvedValueOnce(payload)
    await expect(service.updateTrackMetadata(metadata)).rejects.toThrow('SQL failed')
    expect(service.isWritingFile('isolated.flac')).toBe(false)
    await vi.waitFor(() => expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(2))
    expect(repo.commitVerifiedUserEdit).toHaveBeenNthCalledWith(1, metadata, payload)
    expect(repo.commitVerifiedUserEdit).toHaveBeenNthCalledWith(2, metadata, payload)
    expect(repo.updateTrackMetadata).not.toHaveBeenCalled()
    expect(send.mock.calls.filter(([channel]) => channel === 'library:changed')).toEqual([
      [
        'library:changed',
        {
          reason: 'metadata-refresh',
          trackIds: [1],
          filePaths: ['isolated.flac'],
        },
      ],
    ])
    expect(workers).toHaveLength(0)
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledTimes(2)
    expect(workers).toHaveLength(0)
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

  it.each(['path', 'generation', 'shutdown'] as const)(
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
      if (boundary === 'generation') {
        vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
        vi.mocked(writeAudioTags).mockResolvedValueOnce()
        await service.updateTrackMetadata({
          trackId: 1,
          title: 'Saved',
          artistDisplay: null,
          albumTitle: null,
          albumArtistDisplay: null,
          genreDisplay: null,
          year: null,
          releaseDate: null,
        })
      }
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
  it('a user write invalidates an already-parsed worker result and keeps a failed database commit for direct reconciliation', async () => {
    const { service, repo } = setup()
    vi.mocked(readStableMetadata)
      .mockRejectedValueOnce(new Error('Written tags do not match'))
      .mockRejectedValueOnce(new Error('reconcile unread'))
      .mockResolvedValueOnce(payload)
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
    expect(workers).toHaveLength(1)
    await service.shutdown()
    expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(1)
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

    it('does not reconcile a playback restore failure after the database commit', async () => {
      const { service, repo } = setup({
        tryAcquireWriteLease: () => ({ ok: false, reason: 'playback-in-use' }),
        releaseWriteLease: vi.fn(),
      })
      vi.mocked(readStableMetadata).mockResolvedValueOnce(payload)
      service.setPlaybackTagWriteHandler(async (_filePath, _metadata, reconcile) => {
        await reconcile(async () => undefined)
        return { ok: false, reason: 'playback-restore-failed' }
      })
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
      ).resolves.toEqual({ ok: false, reason: 'playback-restore-failed' })
      expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
      expect(workers).toHaveLength(0)
      await service.shutdown()
      expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
      expect(workers).toHaveLength(0)
    })

    it('does not reconcile playback-in-use returned before commit', async () => {
      const { service, repo } = setup({
        tryAcquireWriteLease: () => ({ ok: false, reason: 'playback-in-use' }),
        releaseWriteLease: vi.fn(),
      })
      service.setPlaybackTagWriteHandler(async () => ({ ok: false, reason: 'playback-in-use' }))
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
      ).resolves.toEqual({ ok: false, reason: 'playback-in-use' })
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
      expect(readStableMetadata).not.toHaveBeenCalled()
      expect(workers).toHaveLength(0)
      await service.shutdown()
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
    })

    it('reconciles a published file on shutdown when the first stable read fails', async () => {
      const { service, repo } = setup()
      vi.mocked(writeAudioTags).mockResolvedValueOnce(undefined as never)
      vi.mocked(readStableMetadata)
        .mockRejectedValueOnce(new Error('Written tags do not match'))
        .mockRejectedValueOnce(new Error('reconcile unread'))
        .mockResolvedValueOnce(payload)
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
      ).rejects.toThrow('Written tags do not match')
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
      expect(workers).toHaveLength(0)
      await service.shutdown()
      expect(repo.commitVerifiedUserEdit).toHaveBeenCalledOnce()
      expect(workers).toHaveLength(0)
    })

    it('does not reconcile a commit that fails before the file is published', async () => {
      const { service, repo } = setup()
      vi.mocked(writeAudioTags).mockRejectedValueOnce(new Error('save failed'))
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
      ).rejects.toThrow('save failed')
      await service.shutdown()
      expect(repo.commitVerifiedUserEdit).not.toHaveBeenCalled()
      expect(readStableMetadata).not.toHaveBeenCalled()
      expect(workers).toHaveLength(0)
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

describe('legacy lyric cache recovery', () => {
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
