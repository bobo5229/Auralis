import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryTrackPage, LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import { bench, beforeAll, describe } from 'vitest'
import { getAlbumGroupEstimatedHeight } from '../constants/libraryLayoutMetrics'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import { createLibraryDerivedIndex, type LibraryDerivedGroup } from '../utils/libraryDerivedIndex'
import { createLibrarySearchIndex } from '../utils/librarySearchIndex'
import { scanLibrarySearchIndex } from '../utils/librarySearchScan'
import { loadLibraryCatalogSnapshot } from '../utils/loadLibraryCatalogSnapshot'

const DATASET_SIZES = [30_000, 100_000] as const
const TRACKS_PER_ALBUM = 12
const BENCHMARK_OPTIONS = {
  time: 750,
  iterations: 5,
  warmupTime: 250,
  warmupIterations: 2,
} as const
const END_TO_END_BENCHMARK_OPTIONS = {
  time: 500,
  iterations: 2,
  warmupTime: 0,
  warmupIterations: 1,
} as const

interface BenchmarkAlbumGroup extends LibraryDerivedGroup {
  tracks: TrackListItem[]
  releaseDate: string | null
}

interface LibraryBenchmarkFixture {
  tracks: readonly TrackListItem[]
  albumGroups: readonly BenchmarkAlbumGroup[]
}

const TITLE_FACTORIES: readonly ((index: number) => string | null)[] = [
  (index) => `月光现场 ${index}`,
  (index) => `Midnight Signal ${index}`,
  (index) => `Track 2048-${index}`,
  (index) => `城市與夢 ${index}`,
  (index) => `Ｆｕｌｌ－Ｗｉｄｔｈ ${index}`,
  () => null,
]

const ARTISTS: readonly (string | null)[] = [
  '林海与风',
  'Northern Lights',
  '组合 404',
  '銀河電台',
  null,
]

function createTrack(index: number): TrackListItem {
  const albumIndex = Math.floor(index / TRACKS_PER_ALBUM)
  const hasAlbum = albumIndex % 17 !== 0
  const hasAlbumArtist = albumIndex % 13 !== 0

  return {
    id: index + 1,
    title: TITLE_FACTORIES[index % TITLE_FACTORIES.length](index),
    artist: ARTISTS[index % ARTISTS.length],
    album: hasAlbum ? `Album ${albumIndex.toString().padStart(5, '0')} 城市` : null,
    albumArtist: hasAlbumArtist ? ARTISTS[albumIndex % ARTISTS.length] : null,
    trackNo: (index % TRACKS_PER_ALBUM) + 1,
    discNo: index % 97 === 0 ? null : (index % 2) + 1,
    releaseDate: albumIndex % 11 === 0 ? null : `${1980 + (albumIndex % 47)}-01-01`,
    copyright: index % 19 === 0 ? null : `Copyright ${1980 + (albumIndex % 47)}`,
    durationSeconds: index % 23 === 0 ? null : 120 + (index % 360),
    artworkCacheKey: albumIndex % 9 === 0 ? null : `artwork-${albumIndex}`,
    genre: index % 10 === 0 ? null : ['流行', 'Electronic', 'Jazz 2'][index % 3],
    availability: index % 101 === 0 ? 'missing' : 'available',
    playCount: index % 1000,
    lastPlayedAt: index % 7 === 0 ? null : '2026-08-24T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function createAlbumGroups(tracks: readonly TrackListItem[]): readonly BenchmarkAlbumGroup[] {
  const groups: BenchmarkAlbumGroup[] = []
  const indexByKey = new Map<string, number>()

  for (const track of tracks) {
    const artist = track.albumArtist || track.artist || ''
    const album = track.album || ''
    const key = `${artist}\u0000${album}`
    const existingIndex = indexByKey.get(key)

    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length)
      groups.push({ tracks: [track], releaseDate: track.releaseDate })
      continue
    }

    const group = groups[existingIndex]
    group.tracks.push(track)
    group.releaseDate ??= track.releaseDate
  }

  return groups
}

function createFixture(size: number): LibraryBenchmarkFixture {
  const tracks = Array.from({ length: size }, (_, index) => createTrack(index))
  return {
    tracks,
    albumGroups: createAlbumGroups(tracks),
  }
}

function getAlbumGroupSize(group: BenchmarkAlbumGroup): number {
  return getAlbumGroupEstimatedHeight(group.tracks.length, Boolean(group.releaseDate))
}

function createClonedPage(
  fixture: LibraryBenchmarkFixture,
  request: LibraryTrackPageRequest,
): LibraryTrackPage {
  const offset = request.cursor === undefined ? 0 : Number(request.cursor)
  const limit = Math.min(request.limit ?? 1000, 5000)
  const tracks = fixture.tracks.slice(offset, offset + limit)
  const nextOffset = offset + tracks.length
  return structuredClone({
    snapshotId: 'benchmark-snapshot',
    totalTracks: fixture.tracks.length,
    tracks,
    nextCursor: nextOffset < fixture.tracks.length ? String(nextOffset) : null,
    diagnostics: { snapshotBuildMs: request.refresh ? 1 : null, pageSliceMs: 0.1 },
  })
}

function aggregateClonedPages(fixture: LibraryBenchmarkFixture, pageSize: number): TrackListItem[] {
  const tracks: TrackListItem[] = []
  let cursor: string | undefined

  do {
    const page = createClonedPage(fixture, {
      cursor,
      limit: pageSize,
      refresh: cursor === undefined,
    })
    tracks.push(...page.tracks)
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return tracks
}

async function loadProductionSnapshot(
  fixture: LibraryBenchmarkFixture,
): Promise<readonly TrackListItem[]> {
  const result = await loadLibraryCatalogSnapshot(
    async (request) => createClonedPage(fixture, request),
    () => true,
  )
  return result.tracks
}

function reportMemoryObservation(fixture: LibraryBenchmarkFixture): void {
  if (fixture.tracks.length !== 100_000 || typeof global.gc !== 'function') return
  global.gc()
  const baselineHeap = process.memoryUsage().heapUsed
  const clonedTracks = structuredClone(fixture.tracks)
  const searchIndex = createLibrarySearchIndex(clonedTracks)
  const viewIndex = createLibraryCatalogViewIndex(clonedTracks, getAlbumGroupSize)
  global.gc()
  const retainedHeapDelta = process.memoryUsage().heapUsed - baselineHeap
  process.stdout.write(
    `${JSON.stringify({
      benchmark: 'library-catalog-memory-observation',
      tracks: clonedTracks.length,
      searchRecords: searchIndex.length,
      albumGroups: viewIndex.albumGroups.length,
      retainedHeapDeltaBytes: retainedHeapDelta,
    })}\n`,
  )
}

for (const size of DATASET_SIZES) {
  const fixture = createFixture(size)
  const preparedSearchIndex = createLibrarySearchIndex(fixture.tracks)
  const searchStartIndex = Math.floor(size * 0.73)

  describe(`library catalog (${size.toLocaleString('en-US')} tracks)`, () => {
    beforeAll(() => reportMemoryObservation(fixture))

    bench(
      'build normalized search index',
      () => {
        const result = createLibrarySearchIndex(fixture.tracks)
        if (result.length !== size) throw new Error('Incomplete search index')
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'build legacy second-phase derived index',
      () => {
        const result = createLibraryDerivedIndex(
          fixture.tracks,
          fixture.albumGroups,
          getAlbumGroupSize,
        )
        if (result.trackById.size !== size) throw new Error('Incomplete derived index')
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'build legacy multi-pass album groups and lookup index',
      () => {
        const groups = createAlbumGroups(fixture.tracks)
        const result = createLibraryDerivedIndex(fixture.tracks, groups, getAlbumGroupSize)
        if (result.trackById.size !== size) throw new Error('Incomplete legacy catalog view index')
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'build combined album groups and lookup index',
      () => {
        const result = createLibraryCatalogViewIndex(fixture.tracks, getAlbumGroupSize)
        if (result.trackById.size !== size) throw new Error('Incomplete catalog view index')
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'scan four mixed-field queries',
      () => {
        const chinese = scanLibrarySearchIndex(preparedSearchIndex, '月光', searchStartIndex)
        const english = scanLibrarySearchIndex(preparedSearchIndex, 'midnight', searchStartIndex)
        const numeric = scanLibrarySearchIndex(preparedSearchIndex, 'track 2048', searchStartIndex)
        const missing = scanLibrarySearchIndex(
          preparedSearchIndex,
          'not-in-library',
          searchStartIndex,
        )

        if (
          chinese.totalMatches === 0 ||
          english.totalMatches === 0 ||
          numeric.totalMatches === 0 ||
          missing.totalMatches !== 0
        ) {
          throw new Error('Unexpected search workload result')
        }
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'rebuild complete renderer lookup snapshot',
      () => {
        const searchIndex = createLibrarySearchIndex(fixture.tracks)
        const derivedIndex = createLibraryCatalogViewIndex(fixture.tracks, getAlbumGroupSize)

        if (searchIndex.length !== size || derivedIndex.trackById.size !== size) {
          throw new Error('Incomplete renderer lookup snapshot')
        }
      },
      BENCHMARK_OPTIONS,
    )

    bench(
      'legacy 1k pages: clone and grow renderer aggregate',
      () => {
        const result = aggregateClonedPages(fixture, 1000)
        if (result.length !== size) throw new Error('Incomplete legacy page aggregate')
      },
      END_TO_END_BENCHMARK_OPTIONS,
    )

    bench(
      'production 5k pages: clone and preallocate renderer aggregate',
      async () => {
        const result = await loadProductionSnapshot(fixture)
        if (result.length !== size) throw new Error('Incomplete production page aggregate')
      },
      END_TO_END_BENCHMARK_OPTIONS,
    )
  })
}
