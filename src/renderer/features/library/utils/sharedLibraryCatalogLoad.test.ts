import { describe, expect, it, vi } from 'vitest'
import {
  LibraryCatalogExpiredError,
  type LibraryTrackPage,
  type LibraryTrackPageRequest,
  type LibraryTrackPageResponse,
} from '@shared/types/libraryCatalog'
import type { TrackListItem } from '@shared/types/libraryScan'
import { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'
import { loadLibraryCatalogSnapshot } from './loadLibraryCatalogSnapshot'

// Runtime-only integration fixture: keep Main out of the renderer composite TypeScript project.
const storeModule = '../../../../main/features/libraryCatalog/libraryCatalogSnapshotStore'
const { LibraryCatalogSnapshotStore } = (await import(storeModule)) as {
  LibraryCatalogSnapshotStore: new (load: () => TrackListItem[]) => {
    getPage(request?: LibraryTrackPageRequest): LibraryTrackPage
  }
}

const tracks = (n: number) => Array.from({ length: n }, (_, id) => ({ id }) as TrackListItem)
function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

describe('shared catalog execution', () => {
  it.each([0, 5000, 5001])('loads %i ordered tracks once for two consumers', async (n) => {
    const build = vi.fn(() => tracks(n))
    const store = new LibraryCatalogSnapshotStore(build)
    const fetch = vi.fn(async (request) => store.getPage(request))
    const client = new SharedLibraryCatalogLoad(fetch)
    const [a, b] = await Promise.all([client.load(() => true), client.load(() => true)])
    expect(a).toBe(b)
    expect(a.tracks.map((t) => t.id)).toEqual(tracks(n).map((t) => t.id))
    expect(build).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(Math.max(1, Math.ceil(n / 5000)))
    expect(Object.isFrozen(a.tracks)).toBe(true)
  })

  it('one consumer leaving does not cancel another; changes coalesce into a new load', async () => {
    const wait = gate()
    let source = tracks(5001)
    const build = vi.fn(() => source)
    const store = new LibraryCatalogSnapshotStore(build)
    const client = new SharedLibraryCatalogLoad(async (request) => {
      const page = store.getPage(request)
      if (!request.cursor) await wait.promise
      return page
    })
    let current = true
    const a = client.load(() => current)
    const rejected = expect(a).rejects.toThrow('stale')
    const b = client.load(() => true)
    current = false
    source = tracks(5002)
    client.invalidate()
    client.invalidate()
    wait.release()
    expect((await b).tracks).toHaveLength(5002)
    await rejected
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('two independent stores consumers may interleave across generations', async () => {
    const store = new LibraryCatalogSnapshotStore(() => tracks(5001))
    const fetch = async (request: Parameters<typeof store.getPage>[0]) => store.getPage(request)
    const [a, b] = await Promise.all([
      loadLibraryCatalogSnapshot(fetch, () => true),
      loadLibraryCatalogSnapshot(fetch, () => true),
    ])
    expect(a.snapshotId).not.toBe(b.snapshotId)
    expect(a.tracks).toEqual(b.tracks)
  })

  it('restarts once on serialized expiry, discarding partial data', async () => {
    const store = new LibraryCatalogSnapshotStore(() => tracks(5001))
    let expired = false
    const fetch = vi.fn(async (request): Promise<LibraryTrackPageResponse> => {
      if (request.cursor && !expired) {
        expired = true
        return { error: { code: 'CATALOG_SNAPSHOT_EXPIRED' } }
      }
      return store.getPage(request)
    })
    const result = await new SharedLibraryCatalogLoad(fetch).load(() => true)
    expect(result.tracks).toHaveLength(5001)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('limits expiry retries and can recover after failure; other errors never retry', async () => {
    const fetch = vi.fn(
      async (): Promise<LibraryTrackPageResponse> => ({
        error: { code: 'CATALOG_SNAPSHOT_EXPIRED' },
      }),
    )
    const client = new SharedLibraryCatalogLoad(fetch)
    await expect(client.load(() => true)).rejects.toBeInstanceOf(LibraryCatalogExpiredError)
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockRejectedValueOnce(new Error('query failed'))
    await expect(client.load(() => true)).rejects.toThrow('query failed')
    expect(fetch).toHaveBeenCalledTimes(3)
    fetch.mockResolvedValue(new LibraryCatalogSnapshotStore(() => []).getPage())
    expect((await client.load(() => true)).tracks).toEqual([])
  })
})
