import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LibraryCatalogSnapshotStore } from './libraryCatalogSnapshotStore'

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: `Artist ${Math.floor(id / 10)}`,
    album: `Album ${Math.floor(id / 12)}`,
    albumArtist: `Artist ${Math.floor(id / 10)}`,
    trackNo: id % 12,
    discNo: 1,
    releaseDate: '2026',
    copyright: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-13T00:00:00.000Z',
  }
}

describe('LibraryCatalogSnapshotStore', () => {
  it('walks a stable snapshot without duplicates or omissions', () => {
    const source = Array.from({ length: 50_005 }, (_, index) => createTrack(index + 1))
    const store = new LibraryCatalogSnapshotStore(() => source)
    const collectedIds: number[] = []
    let cursor: string | undefined
    let snapshotId = ''

    do {
      const page = store.getPage({ cursor, limit: 1000, refresh: cursor === undefined })
      snapshotId ||= page.snapshotId
      expect(page.snapshotId).toBe(snapshotId)
      expect(page.totalTracks).toBe(source.length)
      collectedIds.push(...page.tracks.map((track) => track.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)

    expect(collectedIds).toEqual(source.map((track) => track.id))
    expect(new Set(collectedIds).size).toBe(source.length)
  })

  it('expires old cursors when a refreshed snapshot replaces them', () => {
    const store = new LibraryCatalogSnapshotStore(() => [createTrack(1), createTrack(2)])
    const first = store.getPage({ refresh: true, limit: 1 })
    expect(first.nextCursor).not.toBeNull()

    const refreshed = store.getPage({ refresh: true, limit: 1 })
    expect(refreshed.snapshotId).not.toBe(first.snapshotId)
    expect(() => store.getPage({ cursor: first.nextCursor!, limit: 1 })).toThrow('expired snapshot')
  })

  it('clamps page sizes and rejects malformed cursors', () => {
    const store = new LibraryCatalogSnapshotStore(() =>
      Array.from({ length: 1100 }, (_, index) => createTrack(index + 1)),
    )

    expect(store.getPage({ refresh: true, limit: 5000 }).tracks).toHaveLength(1000)
    expect(() => store.getPage({ cursor: 'not-a-cursor' })).toThrow(
      'Invalid library catalog cursor',
    )
  })
})
