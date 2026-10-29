import { describe, expect, it, vi } from 'vitest'
import {
  LibraryCatalogExpiredError,
  type LibraryTrackPage,
  type LibraryTrackPageRequest,
  type LibraryTrackPageResponse,
} from '@shared/types/libraryCatalog'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  LibraryCatalogLoadInvalidatedError,
  SharedLibraryCatalogLoad,
} from './sharedLibraryCatalogLoad'
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
  it('shares in-flight and completed snapshots for the same committed library revision', async () => {
    const wait = gate()
    const store = new LibraryCatalogSnapshotStore(() => tracks(2))
    const fetch = vi.fn(async (request) => {
      const page = store.getPage(request)
      await wait.promise
      return page
    })
    const client = new SharedLibraryCatalogLoad(fetch)
    client.invalidateForLibraryRevision('12:1')
    const notification = client.load(() => true, 'snapshot', '12:1')
    client.invalidateForLibraryRevision('12:1')
    const save = client.load(() => true, 'fresh', '12:1')
    wait.release()
    const [first, second] = await Promise.all([notification, save])
    expect(second).toBe(first)
    client.invalidateForLibraryRevision('12:1')
    expect(await client.load(() => true, 'fresh', '12:1')).toBe(first)
    expect(fetch).toHaveBeenCalledOnce()
    // An ordinary fresh load still queries again without a versioned reuse request.
    await client.load(() => true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never reuses a completed revision across a different commit or unversioned change', async () => {
    const store = new LibraryCatalogSnapshotStore(() => tracks(2))
    const fetch = vi.fn(async (request) => store.getPage(request))
    const client = new SharedLibraryCatalogLoad(fetch)
    client.invalidateForLibraryRevision('12:1')
    await client.load(() => true, 'fresh', '12:1')
    client.invalidateForLibraryRevision('13:1')
    await client.load(() => true, 'fresh', '13:1')
    client.invalidate()
    client.invalidateForLibraryRevision('13:1')
    await client.load(() => true, 'fresh', '13:1')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

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

  it('publishes an in-flight complete import snapshot while a fresh consumer waits for a newer one', async () => {
    const wait = gate()
    let source = tracks(5001)
    const store = new LibraryCatalogSnapshotStore(() => source)
    const client = new SharedLibraryCatalogLoad(async (request) => {
      const page = store.getPage(request)
      if (request.cursor) await wait.promise
      return page
    })
    const progressive = client.load(() => true, 'snapshot')
    source = tracks(5002)
    client.invalidate('import')
    const fresh = client.load(() => true)
    wait.release()
    expect((await progressive).tracks).toHaveLength(5001)
    expect((await fresh).tracks).toHaveLength(5002)
  })

  it('does not extend a fresh request boundary for imports arriving after its snapshot started', async () => {
    const wait = gate()
    const store = new LibraryCatalogSnapshotStore(() => tracks(5001))
    const fetch = vi.fn(async (request) => {
      const page = store.getPage(request)
      await wait.promise
      return page
    })
    const client = new SharedLibraryCatalogLoad(fetch)
    client.invalidate()
    const fresh = client.load(() => true)
    client.invalidate('import')
    client.invalidate('import')
    wait.release()
    expect((await fresh).tracks).toHaveLength(5001)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('discards a complete progressive snapshot invalidated by a strong change', async () => {
    const wait = gate()
    let source = tracks(5001)
    const store = new LibraryCatalogSnapshotStore(() => source)
    const client = new SharedLibraryCatalogLoad(async (request) => {
      const page = store.getPage(request)
      if (request.cursor) await wait.promise
      return page
    })
    const progressive = client.load(() => true, 'snapshot')
    source = tracks(5000)
    client.invalidate()
    wait.release()
    expect((await progressive).tracks).toHaveLength(5000)
  })

  it('fails after bounded strong invalidations and can recover on a later request', async () => {
    const store = new LibraryCatalogSnapshotStore(() => tracks(1))
    let changing = true
    const fetch = vi.fn(async (request) => {
      if (changing) client.invalidate()
      return store.getPage(request)
    })
    const client = new SharedLibraryCatalogLoad(fetch)
    await expect(client.load(() => true)).rejects.toBeInstanceOf(LibraryCatalogLoadInvalidatedError)
    expect(fetch).toHaveBeenCalledTimes(2)
    changing = false
    expect((await client.load(() => true)).tracks).toHaveLength(1)
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

it('reuses current snapshots between visits and observes invalidation without a page', async () => {
  let changed!: Parameters<import('@shared/ipc/api').AuralisApi['library']['onChanged']>[0]
  let scanned!: Parameters<import('@shared/ipc/api').AuralisApi['library']['onScanProgress']>[0]
  const stopChanged = vi.fn(),
    stopScan = vi.fn()
  const store = new LibraryCatalogSnapshotStore(() => tracks(3))
  const fetch = vi.fn(async (request) => store.getPage(request))
  const client = new SharedLibraryCatalogLoad(fetch, {
    onChanged: (callback) => {
      changed = callback
      return stopChanged
    },
    onScanProgress: (callback) => {
      scanned = callback
      return stopScan
    },
  })
  const first = await client.load(() => true, 'current')
  expect(await client.load(() => true, 'current')).toBe(first)
  expect(fetch).toHaveBeenCalledOnce()
  for (const reason of [
    'track-added',
    'track-missing',
    'metadata-refresh',
    'play-stats-updated',
    'play-stats-reset',
  ] as const) {
    const calls = fetch.mock.calls.length
    changed({ reason, trackIds: [], filePaths: [] })
    await client.load(() => true, 'current')
    expect(fetch).toHaveBeenCalledTimes(calls + 1)
  }
  scanned({
    status: 'completed',
    jobId: 1,
    totalFiles: 3,
    scannedFiles: 3,
    failedFiles: 0,
    currentFile: null,
    message: null,
  })
  const beforeScanRead = fetch.mock.calls.length
  await client.load(() => true, 'current')
  expect(fetch).toHaveBeenCalledTimes(beforeScanRead + 1)
  await client.load(() => true, 'fresh')
  expect(fetch).toHaveBeenCalledTimes(beforeScanRead + 2)
  client.dispose()
  expect(stopChanged).toHaveBeenCalledOnce()
  expect(stopScan).toHaveBeenCalledOnce()
})

it('current revisit waits for a generation started after an in-flight import invalidation', async () => {
  const wait = gate()
  let source = tracks(1)
  const store = new LibraryCatalogSnapshotStore(() => source)
  const client = new SharedLibraryCatalogLoad(async (request) => {
    const page = store.getPage(request)
    await wait.promise
    return page
  })
  const previous = client.load(() => true, 'snapshot')
  source = tracks(2)
  client.invalidate('import')
  const revisit = client.load(() => true, 'current')
  wait.release()
  expect((await previous).tracks).toHaveLength(1)
  expect((await revisit).tracks).toHaveLength(2)
})
