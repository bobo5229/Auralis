import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFile } from 'music-metadata'
import { stat } from 'node:fs/promises'
import type { TrackRepository } from '../../repositories/trackRepository'
import { LibraryIncrementalImportService } from './libraryIncrementalImportService'

vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({ size: 100, mtimeMs: 100 })) }))
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))
vi.mock('../metadata/resolveLyricsForFile', () => ({ resolveLyricsForFile: async () => null }))
vi.mock('../artwork/resolveArtworkForFile', () => ({ resolveArtworkForFile: async () => null }))
vi.mock('../../logging/logger', () => ({ logger: { warn: vi.fn() } }))

function setup() {
  const repo = {
    upsertMany: vi.fn<TrackRepository['upsertMany']>(),
    findRelocationCandidatesByIdentity: vi.fn<
      TrackRepository['findRelocationCandidatesByIdentity']
    >(() => []),
    relocateTrack: vi.fn<TrackRepository['relocateTrack']>(() => true),
  }
  const send = vi.fn()
  const service = new LibraryIncrementalImportService(
    repo as unknown as TrackRepository,
    'cache',
    send,
  )
  return { repo, send, service }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(stat)
    .mockReset()
    .mockResolvedValue({ size: 100, mtimeMs: 100 } as Awaited<ReturnType<typeof stat>>)
  vi.mocked(parseFile)
    .mockReset()
    .mockResolvedValue({
      format: { duration: 120, trackInfo: [], tagTypes: [] },
      native: {},
      quality: { warnings: [] },
      common: {
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        track: { no: null, of: null },
        disk: { no: null, of: null },
        movementIndex: { no: null, of: null },
      },
    })
})
afterEach(() => vi.useRealTimers())

describe('incremental import batching', () => {
  it('overlaps stability waits, bounds each batch and emits one change per committed batch', async () => {
    const { service, repo, send } = setup()
    const paths = Array.from({ length: 65 }, (_, i) => `song-${i}.flac`)
    const pending = service.importFiles([...paths, paths[0]])
    expect(service.isImportActive()).toBe(true)
    await vi.advanceTimersByTimeAsync(799)
    expect(parseFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(parseFile).toHaveBeenCalledTimes(32)
    // The entire pass is matched before any new path can claim an old identity.
    expect(repo.upsertMany).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1600)
    expect(await pending).toEqual({ imported: paths, unstable: [], failed: [] })
    expect(repo.upsertMany).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenCalledTimes(3)
    expect(service.isImportActive()).toBe(false)
  })

  it('keeps successful files when another parse fails', async () => {
    const { service, repo, send } = setup()
    vi.mocked(parseFile).mockRejectedValueOnce(new Error('EBUSY'))
    const pending = service.importFiles(['busy.flac', 'good.flac'])
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({
      imported: ['good.flac'],
      unstable: [],
      failed: [{ filePath: 'busy.flac', reason: 'EBUSY' }],
    })
    expect(repo.upsertMany.mock.calls[0][0]).toHaveLength(1)
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-added',
      trackIds: [],
      filePaths: ['good.flac'],
    })
  })

  it('reports a rolled-back batch without publishing successful imports', async () => {
    const { service, repo, send } = setup()
    repo.upsertMany.mockImplementationOnce(() => {
      throw new Error('SQL failure')
    })
    const pending = service.importFiles(['a.flac', 'b.flac'])
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({
      imported: [],
      unstable: [],
      failed: [
        { filePath: 'a.flac', reason: 'SQL failure' },
        { filePath: 'b.flac', reason: 'SQL failure' },
      ],
    })
    expect(send).not.toHaveBeenCalled()
    expect(service.isImportActive()).toBe(false)
  })

  it('retains a relocated identity while importing an unrelated new track', async () => {
    const { service, repo, send } = setup()
    const candidate = {
      trackId: 9,
      filePath: 'old.flac',
      metadataSignature: null,
      missingSince: null,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      isrc: null,
      durationSeconds: 120,
      fileSize: 100,
    }
    repo.findRelocationCandidatesByIdentity.mockReturnValue([candidate])
    vi.mocked(stat).mockImplementation(async (filePath) => {
      if (filePath === 'old.flac') throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return { size: 100, mtimeMs: 100 } as Awaited<ReturnType<typeof stat>>
    })
    const metadata = await parseFile('fixture')
    vi.mocked(parseFile).mockResolvedValueOnce({
      ...metadata,
      common: {
        ...metadata.common,
        title: 'Other song',
      },
    })
    const pending = service.importFiles(['occupied.flac', 'moved.flac'])
    await vi.runAllTimersAsync()
    expect((await pending).imported).toEqual(['moved.flac', 'occupied.flac'])
    expect(repo.upsertMany.mock.calls[0][0]).toEqual([
      expect.objectContaining({ filePath: 'occupied.flac' }),
    ])
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-relocated',
      trackIds: [9],
      filePaths: ['moved.flac'],
    })
  })

  it('skips an unavailable file without blocking other files in the batch', async () => {
    const { service } = setup()
    vi.mocked(stat).mockRejectedValueOnce(new Error('ENOENT'))
    const pending = service.importFiles(['missing.flac', 'good.flac'])
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({
      imported: ['good.flac'],
      unstable: ['missing.flac'],
      failed: [],
    })
  })

  it.each(['ENOENT', 'ENOTDIR', 'EACCES', 'present'])(
    'only relocates when the old path is confirmed absent: %s',
    async (state) => {
      const { service, repo, send } = setup()
      repo.findRelocationCandidatesByIdentity.mockReturnValue([
        {
          trackId: 9,
          filePath: 'old.flac',
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          durationSeconds: 120,
          fileSize: 100,
          isrc: null,
          metadataSignature: null,
          missingSince: null,
        },
      ])
      vi.mocked(stat).mockImplementation(async (filePath) => {
        if (filePath === 'old.flac' && state !== 'present')
          throw Object.assign(new Error(state), { code: state })
        return { size: 100, mtimeMs: 100 } as Awaited<ReturnType<typeof stat>>
      })
      const pending = service.importFiles(['new.flac'])
      await vi.runAllTimersAsync()
      expect((await pending).imported).toEqual(['new.flac'])
      expect(repo.findRelocationCandidatesByIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Song' }),
        true,
      )
      if (state === 'ENOENT' || state === 'ENOTDIR') {
        expect(repo.relocateTrack).toHaveBeenCalledWith(
          9,
          expect.objectContaining({ filePath: 'new.flac' }),
          'old.flac',
        )
        expect(repo.upsertMany).not.toHaveBeenCalled()
        expect(send).toHaveBeenCalledWith('library:changed', {
          reason: 'track-relocated',
          trackIds: [9],
          filePaths: ['new.flac'],
        })
      } else {
        expect(repo.relocateTrack).not.toHaveBeenCalled()
        expect(repo.upsertMany).toHaveBeenCalledOnce()
      }
    },
  )

  it('rejects competing new paths across import batches', async () => {
    const { service, repo } = setup()
    repo.findRelocationCandidatesByIdentity.mockReturnValue([
      {
        trackId: 9,
        filePath: 'old.flac',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        durationSeconds: 120,
        fileSize: 100,
        isrc: null,
        metadataSignature: null,
        missingSince: null,
      },
    ])
    const metadata = await parseFile('fixture')
    vi.mocked(parseFile).mockImplementation(async (filePath) => ({
      ...metadata,
      common: {
        ...metadata.common,
        title: filePath === 'new-0.flac' || filePath === 'new-32.flac' ? 'Song' : 'Other',
      },
    }))
    vi.mocked(stat).mockImplementation(async (filePath) => {
      if (filePath === 'old.flac') throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return { size: 100, mtimeMs: 100 } as Awaited<ReturnType<typeof stat>>
    })
    const paths = Array.from({ length: 33 }, (_, i) => `new-${i}.flac`)
    const pending = service.importFiles(paths)
    await vi.runAllTimersAsync()
    expect((await pending).imported).toEqual(paths)
    expect(repo.relocateTrack).not.toHaveBeenCalled()
  })

  it('keeps the old identity when the destination becomes occupied', async () => {
    const { service, repo, send } = setup()
    repo.findRelocationCandidatesByIdentity.mockReturnValue([
      {
        trackId: 9,
        filePath: 'old.flac',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        durationSeconds: 120,
        fileSize: 100,
        isrc: null,
        metadataSignature: null,
        missingSince: null,
      },
    ])
    vi.mocked(stat).mockImplementation(async (filePath) => {
      if (filePath === 'old.flac') throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return { size: 100, mtimeMs: 100 } as Awaited<ReturnType<typeof stat>>
    })
    repo.relocateTrack.mockReturnValue(false)
    const pending = service.importFiles(['occupied.flac'])
    await vi.runAllTimersAsync()
    expect((await pending).imported).toEqual(['occupied.flac'])
    expect(repo.upsertMany).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-relocated' }),
    )
  })

  it('keeps a Windows path alias attached to its own record while importing another copy', async () => {
    const { service, repo } = setup()
    repo.findRelocationCandidatesByIdentity.mockReturnValue([
      {
        trackId: 9,
        filePath: 'old.flac',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        durationSeconds: 120,
        fileSize: 100,
        isrc: null,
        metadataSignature: null,
        missingSince: null,
      },
    ])
    const pending = service.importFiles(['copy.flac', 'OLD.flac'])
    await vi.runAllTimersAsync()
    expect((await pending).failed).toEqual([])
    expect(repo.relocateTrack).toHaveBeenCalledOnce()
    expect(repo.relocateTrack).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ filePath: 'OLD.flac' }),
      'old.flac',
    )
    expect(repo.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ filePath: 'copy.flac' }),
    ])
  })
})
