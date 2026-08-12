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
      limit: 1000,
      refresh: true,
    })
    expect(fetchPage).toHaveBeenNthCalledWith(2, {
      cursor: 'next',
      limit: 1000,
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
})
