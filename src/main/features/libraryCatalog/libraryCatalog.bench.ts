import { bench, beforeAll, describe } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LibraryCatalogSnapshotStore } from './libraryCatalogSnapshotStore'

const SIZE = 100_000
const BENCHMARK_OPTIONS = {
  time: 500,
  iterations: 2,
  warmupTime: 0,
  warmupIterations: 1,
} as const

function createTrack(index: number): TrackListItem {
  const albumIndex = Math.floor(index / 12)
  return {
    id: index + 1,
    title: `Track ${index + 1}`,
    artist: `Artist ${albumIndex % 500}`,
    album: `Album ${albumIndex}`,
    albumArtist: `Artist ${albumIndex % 500}`,
    trackNo: (index % 12) + 1,
    discNo: 1,
    releaseDate: '2026-01-01',
    copyright: null,
    durationSeconds: 180,
    artworkCacheKey: `artwork-${albumIndex}`,
    genre: 'Benchmark',
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  }
}

const tracks = Array.from({ length: SIZE }, (_, index) => createTrack(index))

function walkClonedSnapshot(pageSize: number): number {
  const store = new LibraryCatalogSnapshotStore(() => tracks.slice())
  let cursor: string | undefined
  let collected = 0
  do {
    const page = structuredClone(
      store.getPage({ cursor, limit: pageSize, refresh: cursor === undefined }),
    )
    collected += page.tracks.length
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return collected
}

describe('main-process library snapshot (100,000 tracks)', () => {
  beforeAll(() => {
    if (typeof global.gc !== 'function') return
    global.gc()
    const baselineHeap = process.memoryUsage().heapUsed
    const store = new LibraryCatalogSnapshotStore(() => tracks.slice())
    const firstPage = store.getPage({ refresh: true, limit: 5000 })
    global.gc()
    process.stdout.write(
      `${JSON.stringify({
        benchmark: 'main-library-snapshot-memory-observation',
        tracks: firstPage.totalTracks,
        snapshotHeapDeltaBytes: process.memoryUsage().heapUsed - baselineHeap,
      })}\n`,
    )
  })

  bench(
    'build immutable snapshot and first 5k page',
    () => {
      const store = new LibraryCatalogSnapshotStore(() => tracks.slice())
      const page = store.getPage({ refresh: true, limit: 5000 })
      if (page.totalTracks !== SIZE) throw new Error('Incomplete snapshot')
    },
    BENCHMARK_OPTIONS,
  )

  bench(
    'legacy 1k pages: slice and structured-clone full snapshot',
    () => {
      if (walkClonedSnapshot(1000) !== SIZE) throw new Error('Incomplete legacy snapshot walk')
    },
    BENCHMARK_OPTIONS,
  )

  bench(
    'production 5k pages: slice and structured-clone full snapshot',
    () => {
      if (walkClonedSnapshot(5000) !== SIZE) throw new Error('Incomplete production snapshot walk')
    },
    BENCHMARK_OPTIONS,
  )
})
