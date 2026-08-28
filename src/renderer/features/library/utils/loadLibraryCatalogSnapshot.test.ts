import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryTrackPage } from '@shared/types/libraryCatalog'
import {
  LibraryCatalogLoadStaleError,
  loadLibraryCatalogSnapshot,
} from './loadLibraryCatalogSnapshot'

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-13T00:00:00.000Z',
  }
}

function createPage(
  tracks: TrackListItem[],
  nextCursor: string | null,
  patch: Partial<LibraryTrackPage> = {},
): LibraryTrackPage {
  return {
    snapshotId: 'snapshot-1',
    totalTracks: 3,
    tracks,
    nextCursor,
    diagnostics: { snapshotBuildMs: null, pageSliceMs: 0.1 },
    ...patch,
  }
}

describe('loadLibraryCatalogSnapshot', () => {
  it('aggregates ordered pages and preserves diagnostics', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(
        createPage([createTrack(1), createTrack(2)], 'next', {
          diagnostics: { snapshotBuildMs: 4, pageSliceMs: 0.2 },
        }),
      )
      .mockResolvedValueOnce(createPage([createTrack(3)], null))

    const snapshot = await loadLibraryCatalogSnapshot(fetchPage, () => true)

    expect(snapshot.tracks.map((track) => track.id)).toEqual([1, 2, 3])
    expect(snapshot.totalPages).toBe(2)
    expect(snapshot.snapshotBuildMs).toBe(4)
    expect(snapshot.pageSliceMs).toBeCloseTo(0.3)
    expect(fetchPage).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      limit: 5000,
      refresh: true,
    })
    expect(fetchPage).toHaveBeenNthCalledWith(2, {
      cursor: 'next',
      limit: 5000,
      refresh: false,
    })
  })

  it('rejects a changed snapshot or an incomplete aggregate', async () => {
    const changedSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createPage([createTrack(1)], 'next'))
      .mockResolvedValueOnce(
        createPage([createTrack(2)], null, { snapshotId: 'snapshot-2', totalTracks: 2 }),
      )
    await expect(loadLibraryCatalogSnapshot(changedSnapshot, () => true)).rejects.toThrow(
      'snapshot changed',
    )

    const incomplete = vi.fn().mockResolvedValue(createPage([createTrack(1)], null))
    await expect(loadLibraryCatalogSnapshot(incomplete, () => true)).rejects.toThrow('page count')
  })

  it('stops between pages when the request generation becomes stale', async () => {
    let isCurrent = true
    const fetchPage = vi.fn().mockImplementation(async () => {
      isCurrent = false
      return createPage([createTrack(1)], 'next')
    })

    await expect(loadLibraryCatalogSnapshot(fetchPage, () => isCurrent)).rejects.toBeInstanceOf(
      LibraryCatalogLoadStaleError,
    )
    expect(fetchPage).toHaveBeenCalledOnce()
  })

  it('preallocates and completely aggregates a 100k snapshot in twenty bounded pages', async () => {
    const source = Array.from({ length: 100_000 }, (_, index) => createTrack(index + 1))
    let requests = 0
    const fetchPage = async (request: {
      cursor?: string
      limit?: number
      refresh?: boolean
    }): Promise<LibraryTrackPage> => {
      requests += 1
      const offset = request.cursor === undefined ? 0 : Number(request.cursor)
      const limit = request.limit ?? 5000
      const pageTracks = source.slice(offset, offset + limit)
      const nextOffset = offset + pageTracks.length
      return createPage(pageTracks, nextOffset < source.length ? String(nextOffset) : null, {
        totalTracks: source.length,
      })
    }

    const snapshot = await loadLibraryCatalogSnapshot(fetchPage, () => true)

    expect(requests).toBe(20)
    expect(snapshot.totalPages).toBe(20)
    expect(snapshot.tracks).toHaveLength(source.length)
    expect(snapshot.tracks[0].id).toBe(1)
    expect(snapshot.tracks[49_999].id).toBe(50_000)
    expect(snapshot.tracks.at(-1)?.id).toBe(100_000)
    expect(new Set(snapshot.tracks.map((track) => track.id)).size).toBe(source.length)
  })

  it('rejects a page that would write beyond the advertised snapshot size', async () => {
    const oversized = vi
      .fn()
      .mockResolvedValue(createPage([createTrack(1), createTrack(2)], null, { totalTracks: 1 }))

    await expect(loadLibraryCatalogSnapshot(oversized, () => true)).rejects.toThrow(
      'exceeds snapshot total',
    )
  })
})
