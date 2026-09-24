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
    composer: null,
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
  it('shares unchanged refreshes across consumers and rebuilds only for a new revision', () => {
    let revision = '1'
    let builds = 0
    const source = [createTrack(1), createTrack(2)]
    const store = new LibraryCatalogSnapshotStore(
      () => {
        builds++
        return source
      },
      Date.now,
      () => revision,
    )
    const first = store.getPage({ refresh: true, limit: 1 })
    for (let i = 0; i < 5; i++)
      expect(store.getPage({ refresh: true }).snapshotId).toBe(first.snapshotId)
    expect(builds).toBe(1)
    revision = '2'
    source[1].title = 'Changed'
    const updated = store.getPage({ refresh: true })
    expect(updated.snapshotId).not.toBe(first.snapshotId)
    expect(updated.tracks[1].title).toBe('Changed')
    expect(store.getPage({ cursor: first.nextCursor! }).tracks[0].title).toBe('Track 2')
    expect(builds).toBe(2)
  })

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

  it('isolates the immutable snapshot order from returned page arrays', () => {
    const source = [createTrack(1), createTrack(2), createTrack(3)]
    const store = new LibraryCatalogSnapshotStore(() => source)
    const first = store.getPage({ refresh: true, limit: 2 })
    first.tracks.reverse()

    const reread = store.getPage({ limit: 3 })
    expect(reread.tracks.map((track) => track.id)).toEqual([1, 2, 3])
    expect(first.diagnostics.snapshotHeapDeltaBytes).toEqual(expect.any(Number))
  })

  it('retains the preceding generation, then evicts on the third refresh', () => {
    const store = new LibraryCatalogSnapshotStore(() => [createTrack(1), createTrack(2)])
    const first = store.getPage({ refresh: true, limit: 1 })
    expect(first.nextCursor).not.toBeNull()

    const refreshed = store.getPage({ refresh: true, limit: 1 })
    expect(refreshed.snapshotId).not.toBe(first.snapshotId)
    expect(store.getPage({ cursor: first.nextCursor! }).tracks.map((t) => t.id)).toEqual([2])
    expect(store.getPage({ refresh: true }).diagnostics.retainedSnapshots).toBe(2)
    expect(() => store.getPage({ cursor: first.nextCursor!, limit: 1 })).toThrow('expired snapshot')
  })

  it('expires idle cursors without silently building a replacement', () => {
    let now = 0
    let builds = 0
    const store = new LibraryCatalogSnapshotStore(
      () => {
        builds++
        return [createTrack(1), createTrack(2)]
      },
      () => now,
    )
    const page = store.getPage({ limit: 1 })
    now = 60_000
    expect(() => store.getPage({ cursor: page.nextCursor! })).toThrow('expired snapshot')
    expect(builds).toBe(1)
  })

  it('clamps page sizes and rejects malformed cursors', () => {
    const store = new LibraryCatalogSnapshotStore(() =>
      Array.from({ length: 5500 }, (_, index) => createTrack(index + 1)),
    )

    expect(store.getPage({ refresh: true, limit: 50_000 }).tracks).toHaveLength(5000)
    expect(() => store.getPage({ cursor: 'not-a-cursor' })).toThrow(
      'Invalid library catalog cursor',
    )
  })
})
