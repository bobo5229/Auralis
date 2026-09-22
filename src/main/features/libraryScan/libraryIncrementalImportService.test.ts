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
    findMissingCandidatesByIdentity: vi.fn<TrackRepository['findMissingCandidatesByIdentity']>(
      () => [],
    ),
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
    expect(repo.upsertMany).toHaveBeenCalledTimes(1)
    expect(repo.upsertMany.mock.calls[0][0]).toHaveLength(32)
    expect(send).toHaveBeenCalledTimes(1)
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

  it('retains relocated identities and falls back to batch upsert for an occupied path', async () => {
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
    repo.findMissingCandidatesByIdentity.mockReturnValue([candidate])
    repo.relocateTrack.mockReturnValueOnce(true).mockReturnValueOnce(false)
    const pending = service.importFiles(['moved.flac', 'occupied.flac'])
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
})
