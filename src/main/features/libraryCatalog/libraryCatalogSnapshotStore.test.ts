import { afterEach, describe, expect, it, vi } from 'vitest'
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
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-13T00:00:00.000Z',
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('LibraryCatalogSnapshotStore', () => {
  it('never falls back to a synchronous full query when the cache expires during revision checking', async () => {
    let now = 0
    let advanceOnRevision = false
    const sync = vi.fn(() => {
      throw new Error('synchronous full query is forbidden')
    })
    const store = new LibraryCatalogSnapshotStore(
      sync,
      () => now,
      () => {
        if (advanceOnRevision) now++
        return '1'
      },
    )
    const load = vi.fn(async () => ({ revision: '1', tracks: [createTrack(1)] }))
    await store.getPageAsync({}, load)
    now = 299_999
    advanceOnRevision = true
    expect((await store.getPageAsync({}, load)).tracks[0].id).toBe(1)
    expect(load).toHaveBeenCalledTimes(2)
    expect(sync).not.toHaveBeenCalled()
    store.dispose()
  })
  it('coalesces asynchronous builds and publishes only a matching committed revision', async () => {
    let revision = '1'
    let resolve!: (value: { revision: string; tracks: TrackListItem[] }) => void
    const sync = vi.fn(() => {
      throw new Error('main-thread full query is forbidden')
    })
    const store = new LibraryCatalogSnapshotStore(sync, Date.now, () => revision)
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValue({ revision: '2', tracks: [createTrack(3), createTrack(4)] })
    const first = store.getPageAsync({ refresh: true, limit: 1 }, load)
    const second = store.getPageAsync({ refresh: true, limit: 1 }, load)
    expect(load).toHaveBeenCalledOnce()
    revision = '2'
    resolve({ revision: '1', tracks: [createTrack(1)] })
    const [a, b] = await Promise.all([first, second])
    expect(a.snapshotId).toBe(b.snapshotId)
    expect(a.tracks[0].id).toBe(3)
    expect(a.totalTracks).toBe(2)
    expect(load).toHaveBeenCalledTimes(2)
    expect(sync).not.toHaveBeenCalled()
    store.dispose()
  })

  it('rejects a late asynchronous result after disposal without publishing a snapshot', async () => {
    let resolve!: (value: { revision: string; tracks: TrackListItem[] }) => void
    const store = new LibraryCatalogSnapshotStore(
      () => [],
      Date.now,
      () => '1',
    )
    const pending = store.getPageAsync(
      {},
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const failure = expect(pending).rejects.toThrow('disposed')
    store.dispose()
    resolve({ revision: '1', tracks: [createTrack(1)] })
    await failure
  })
  it('expires old cursors but reuses unchanged bounded data for a new generation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let revision = '1'
    const load = vi.fn(() => [createTrack(1), createTrack(2)])
    const store = new LibraryCatalogSnapshotStore(load, Date.now, () => revision)
    const first = store.getPage({ limit: 1 })
    vi.advanceTimersByTime(60_000)
    expect(() => store.getPage({ cursor: first.nextCursor! })).toThrow('expired snapshot')
    const second = store.getPage({ refresh: true, limit: 1 })
    expect(second.snapshotId).not.toBe(first.snapshotId)
    expect(load).toHaveBeenCalledOnce()
    expect(() => store.getPage({ cursor: first.nextCursor! })).toThrow('expired snapshot')
    revision = '2'
    store.getPage({ refresh: true })
    expect(load).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('actively releases the data cache after its own idle deadline and reloads on return', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const load = vi.fn(() => [createTrack(1), createTrack(2)])
    const store = new LibraryCatalogSnapshotStore(load, Date.now, () => '1')
    store.getPage({})
    vi.advanceTimersByTime(5 * 60_000)
    expect(vi.getTimerCount()).toBe(0)
    expect((store as unknown as { cachedData: unknown }).cachedData).toBeNull()
    store.getPage({})
    expect(load).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('does not retain an oversized catalog as idle reusable data', () => {
    vi.useFakeTimers()
    const load = vi.fn(() => Array.from({ length: 100_001 }, (_, i) => createTrack(i + 1)))
    const store = new LibraryCatalogSnapshotStore(load, Date.now, () => '1')
    store.getPage({})
    vi.advanceTimersByTime(60_000)
    expect(vi.getTimerCount()).toBe(0)
    store.getPage({})
    expect(load).toHaveBeenCalledTimes(2)
    store.dispose()
  })
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

  it('releases idle snapshots without another request and expires the old cursor', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const store = new LibraryCatalogSnapshotStore(() => [createTrack(1), createTrack(2)])
    const page = store.getPage({ limit: 1 })
    const snapshots = (store as unknown as { snapshots: Map<string, unknown> }).snapshots
    expect(snapshots.size).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(59_999)
    expect(snapshots.size).toBe(1)
    vi.advanceTimersByTime(1)
    expect(snapshots.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => store.getPage({ cursor: page.nextCursor! })).toThrow('expired snapshot')
    store.dispose()
  })

  it('extends expiry when a page is read and keeps the cleanup timer unreferenced', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const timer = vi.spyOn(globalThis, 'setTimeout')
    const store = new LibraryCatalogSnapshotStore(() => [createTrack(1), createTrack(2)])
    const page = store.getPage({ limit: 1 })
    expect(timer.mock.results.at(-1)?.value.hasRef()).toBe(false)
    vi.advanceTimersByTime(40_000)
    expect(store.getPage({ cursor: page.nextCursor! }).tracks[0].id).toBe(2)
    const snapshots = (store as unknown as { snapshots: Map<string, unknown> }).snapshots
    vi.advanceTimersByTime(59_999)
    expect(snapshots.size).toBe(1)
    vi.advanceTimersByTime(1)
    expect(snapshots.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    store.dispose()
  })

  it('reschedules the nearest expiry after third-generation eviction', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let revision = '1'
    const store = new LibraryCatalogSnapshotStore(
      () => [createTrack(1), createTrack(2)],
      Date.now,
      () => revision,
    )
    const first = store.getPage({ refresh: true, limit: 1 })
    vi.advanceTimersByTime(20_000)
    revision = '2'
    const second = store.getPage({ refresh: true, limit: 1 })
    vi.advanceTimersByTime(20_000)
    revision = '3'
    const third = store.getPage({ refresh: true, limit: 1 })
    const snapshots = (store as unknown as { snapshots: Map<string, unknown> }).snapshots
    expect([...snapshots.keys()]).toEqual([second.snapshotId, third.snapshotId])
    expect(() => store.getPage({ cursor: first.nextCursor! })).toThrow('expired snapshot')
    vi.advanceTimersByTime(40_000)
    expect([...snapshots.keys()]).toEqual([third.snapshotId])
    expect(() => store.getPage({ cursor: second.nextCursor! })).toThrow('expired snapshot')
    expect(store.getPage({ cursor: third.nextCursor! }).tracks[0].id).toBe(2)
    store.dispose()
  })

  it('dispose clears references and timer and rejects future requests', () => {
    vi.useFakeTimers()
    const store = new LibraryCatalogSnapshotStore(() => [createTrack(1), createTrack(2)])
    store.getPage({ limit: 1 })
    store.getPage({ refresh: true, limit: 1 })
    const snapshots = (store as unknown as { snapshots: Map<string, unknown> }).snapshots
    expect(snapshots.size).toBe(2)
    store.dispose()
    store.dispose()
    expect(snapshots.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => store.getPage()).toThrow('disposed')
  })
})
