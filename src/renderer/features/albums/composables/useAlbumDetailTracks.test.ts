import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { AlbumDetailResult } from '@shared/types/albumDetail'
import type { TrackListItem } from '@shared/types/libraryScan'

import {
  invalidateAlbumDetailSnapshot,
  readAlbumDetailSnapshot,
  writeAlbumDetailSnapshot,
} from '../albumDetailSnapshot'
import { selectAlbumTracks, useAlbumDetailTracks } from './useAlbumDetailTracks'

type LibraryClient = Pick<AuralisApi['library'], 'getAlbumDetail' | 'getTracks' | 'onChanged'>
type LibraryChangedListener = Parameters<LibraryClient['onChanged']>[0]
type LibraryChangedEvent = Parameters<LibraryChangedListener>[0]

function createTrack(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

function createLibraryClient() {
  let changedListener: LibraryChangedListener | null = null
  const unsubscribe = vi.fn()
  const getTracks = vi.fn(async (): Promise<TrackListItem[]> => [])
  const getAlbumDetail = vi.fn(
    async (): Promise<AlbumDetailResult> => ({ tracks: [], moreAlbums: [], genreAlbums: [] }),
  )
  const onChanged = vi.fn((listener: LibraryChangedListener) => {
    changedListener = listener
    return unsubscribe
  })

  return {
    client: { getAlbumDetail, getTracks, onChanged } satisfies LibraryClient,
    getTracks,
    getAlbumDetail,
    unsubscribe,
    emit(event: LibraryChangedEvent): void {
      changedListener?.(event)
    },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.useRealTimers()
  invalidateAlbumDetailSnapshot()
})

it('orders undated artist siblings by title when navigation reuses the full catalog', async () => {
  const current = createTrack(1)
  const catalog = [current, createTrack(2, { album: 'Zulu' }), createTrack(3, { album: 'Alpha' })]
  writeAlbumDetailSnapshot({
    albumArtist: 'Artist',
    albumTitle: 'Album',
    artworkCacheKey: null,
    releaseDate: null,
    tracks: [current],
    moreAlbums: [],
    catalogTracks: catalog,
  })
  const library = createLibraryClient()
  const detail = useAlbumDetailTracks({
    albumArtist: ref('Artist'),
    albumTitle: ref('Album'),
    library: library.client,
  })
  try {
    await detail.initialize()
    expect(detail.moreAlbums.value.map((album) => album.title)).toEqual(['Alpha', 'Zulu'])
    expect(library.getAlbumDetail).not.toHaveBeenCalled()
    expect(catalog.map((track) => track.album)).toEqual(['Album', 'Zulu', 'Alpha'])
  } finally {
    detail.dispose()
  }
})

describe('selectAlbumTracks', () => {
  it('filters by effective album identity and sorts by disc, track number, then title', () => {
    const tracks = [
      createTrack(1, { discNo: 2, trackNo: 1 }),
      createTrack(2, { discNo: 1, trackNo: null, title: 'Bravo' }),
      createTrack(3, { discNo: 1, trackNo: null, title: 'Alpha' }),
      createTrack(4, { discNo: 1, trackNo: 2 }),
      createTrack(5, { album: 'Other Album' }),
      createTrack(6, {
        artist: 'Unknown Artist',
        albumArtist: null,
        album: null,
        discNo: null,
        trackNo: null,
      }),
    ]

    expect(selectAlbumTracks(tracks, 'Artist', 'Album').map((track) => track.id)).toEqual([
      4, 3, 2, 1,
    ])
    expect(
      selectAlbumTracks(tracks, 'Unknown Artist', 'Unknown Album').map((track) => track.id),
    ).toEqual([6])
  })
})

describe('useAlbumDetailTracks', () => {
  it('subscribes before initial detail loading so catalog changes are not missed', async () => {
    const library = createLibraryClient()
    const oldDetail = createDeferred<AlbumDetailResult>()
    const oldCatalog = createDeferred<TrackListItem[]>()
    const fresh = [createTrack(2)]
    library.getAlbumDetail
      .mockReturnValueOnce(oldDetail.promise)
      .mockResolvedValue({ tracks: fresh, moreAlbums: [], genreAlbums: [] })
    library.getTracks.mockReturnValueOnce(oldCatalog.promise).mockResolvedValue(fresh)
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })
    try {
      const initializing = detail.initialize()
      const oldPlayback = detail.ensurePlaybackCatalog()
      library.emit({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
      await expect(detail.ensurePlaybackCatalog()).resolves.toBe(fresh)
      oldCatalog.resolve([createTrack(1)])
      oldDetail.resolve({ tracks: [createTrack(1)], moreAlbums: [], genreAlbums: [] })
      await expect(oldPlayback).resolves.toBeNull()
      await initializing
      expect(detail.tracks.value).toEqual(fresh)
      expect(detail.playbackCatalogRevision.value).toBe(1)
    } finally {
      detail.dispose()
    }
  })

  it('loads and caches a full playback catalog on demand without expanding detail display data', async () => {
    const library = createLibraryClient()
    const current = createTrack(1)
    const catalog = [current, createTrack(2, { album: 'Other' })]
    library.getAlbumDetail.mockResolvedValue({ tracks: [current], moreAlbums: [], genreAlbums: [] })
    const pending = createDeferred<TrackListItem[]>()
    library.getTracks.mockReturnValue(pending.promise)
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })
    try {
      await detail.initialize()
      expect(library.getTracks).not.toHaveBeenCalled()
      const first = detail.ensurePlaybackCatalog()
      const second = detail.ensurePlaybackCatalog()
      expect(library.getTracks).toHaveBeenCalledOnce()
      pending.resolve(catalog)
      await expect(first).resolves.toBe(catalog)
      await expect(second).resolves.toBe(catalog)
      await expect(detail.ensurePlaybackCatalog()).resolves.toBe(catalog)
      expect(detail.tracks.value).toEqual([current])
      expect(library.getTracks).toHaveBeenCalledOnce()
    } finally {
      detail.dispose()
    }
  })

  it('reuses a complete navigation snapshot for playback without fetching the catalog', async () => {
    const catalog = [createTrack(1), createTrack(2, { album: 'Other' })]
    writeAlbumDetailSnapshot({
      albumArtist: 'Artist',
      albumTitle: 'Album',
      artworkCacheKey: null,
      releaseDate: null,
      tracks: [catalog[0]],
      moreAlbums: [],
      catalogTracks: catalog,
    })
    const library = createLibraryClient()
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })
    try {
      await expect(detail.ensurePlaybackCatalog()).resolves.toBe(catalog)
      expect(library.getTracks).not.toHaveBeenCalled()
    } finally {
      detail.dispose()
    }
  })

  it.each(['success', 'failure'] as const)(
    'discards an invalidated catalog %s without clearing the fresh snapshot',
    async (outcome) => {
      const library = createLibraryClient()
      const old = createDeferred<TrackListItem[]>()
      const catalog = [createTrack(2)]
      library.getTracks.mockReturnValueOnce(old.promise).mockResolvedValueOnce(catalog)
      const detail = useAlbumDetailTracks({
        albumArtist: ref('Artist'),
        albumTitle: ref('Album'),
        library: library.client,
      })
      try {
        await detail.initialize()
        const pending = detail.ensurePlaybackCatalog()
        library.emit({ reason: 'metadata-refresh', trackIds: [], filePaths: [] })
        await expect(detail.ensurePlaybackCatalog()).resolves.toBe(catalog)
        if (outcome === 'success') {
          old.resolve([createTrack(1)])
          await expect(pending).resolves.toBeNull()
        } else {
          old.reject(new Error('Outdated request failed'))
          await expect(pending).rejects.toThrow('Outdated request failed')
        }
        await expect(detail.ensurePlaybackCatalog()).resolves.toBe(catalog)
        expect(library.getTracks).toHaveBeenCalledTimes(2)
      } finally {
        detail.dispose()
      }
    },
  )

  it('allows retry after catalog failure and discards pending results on disposal', async () => {
    const library = createLibraryClient()
    const pending = createDeferred<TrackListItem[]>()
    library.getTracks
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(pending.promise)
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })
    await expect(detail.ensurePlaybackCatalog()).rejects.toThrow('offline')
    const retry = detail.ensurePlaybackCatalog()
    detail.dispose()
    pending.resolve([createTrack(1)])
    await expect(retry).resolves.toBeNull()
    await expect(detail.ensurePlaybackCatalog()).resolves.toBeNull()
    expect(library.getTracks).toHaveBeenCalledTimes(2)
  })

  it('derives genre fallback from a catalog snapshot without IPC and gives artist siblings priority', async () => {
    const current = createTrack(1, { genre: 'Jazz' })
    const other = createTrack(2, { albumArtist: 'Other Artist', album: 'Other', genre: 'jazz' })
    const snapshot = {
      albumArtist: 'Artist',
      albumTitle: 'Album',
      artworkCacheKey: null,
      releaseDate: null,
      tracks: [current],
      moreAlbums: [],
      catalogTracks: [current, other],
    }
    writeAlbumDetailSnapshot(snapshot)
    const library = createLibraryClient()
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })
    await detail.initialize()
    expect(detail.genreAlbums.value.map((album) => album.title)).toEqual(['Other'])
    expect(library.getAlbumDetail).not.toHaveBeenCalled()

    writeAlbumDetailSnapshot({
      ...snapshot,
      catalogTracks: [...snapshot.catalogTracks, createTrack(3, { album: 'Sibling' })],
    })
    await detail.ensureCurrentAlbum()
    expect(detail.moreAlbums.value.map((album) => album.title)).toEqual(['Sibling'])
    expect(detail.genreAlbums.value).toEqual([])
    detail.dispose()
  })

  it('loads missing genre candidates for a track-only preview and does not leak them across artists', async () => {
    const current = createTrack(1, { genre: 'Jazz' })
    writeAlbumDetailSnapshot({
      albumArtist: 'Artist',
      albumTitle: 'Album',
      artworkCacheKey: null,
      releaseDate: null,
      tracks: [current],
      moreAlbums: [],
      catalogTracks: null,
    })
    const library = createLibraryClient()
    const candidate = {
      title: 'Other',
      albumArtist: 'Other Artist',
      releaseDate: null,
      artworkCacheKey: null,
    }
    library.getAlbumDetail.mockResolvedValue({
      tracks: [current],
      moreAlbums: [],
      genreAlbums: [candidate],
    })
    const artist = ref('Artist')
    const title = ref('Album')
    const detail = useAlbumDetailTracks({
      albumArtist: artist,
      albumTitle: title,
      library: library.client,
    })
    expect(detail.loadState.value).toBe('ready')
    await detail.initialize()
    expect(library.getAlbumDetail).toHaveBeenCalledOnce()
    expect(detail.genreAlbums.value.map((album) => album.title)).toEqual(['Other'])
    await detail.ensureCurrentAlbum()
    expect(library.getAlbumDetail).toHaveBeenCalledOnce()

    artist.value = 'Other Artist'
    title.value = 'Other'
    expect(detail.genreAlbums.value).toEqual([])
    library.getAlbumDetail.mockResolvedValue({
      tracks: [createTrack(2, { albumArtist: 'Other Artist', album: 'Other', genre: null })],
      moreAlbums: [],
      genreAlbums: [],
    })
    await detail.ensureCurrentAlbum()
    expect(detail.genreAlbums.value).toEqual([])
    expect(detail.loadState.value).toBe('ready')
    detail.dispose()
  })

  it('hydrates synchronously from a matching snapshot and skips IPC', async () => {
    writeAlbumDetailSnapshot({
      albumArtist: 'Artist',
      albumTitle: 'Album',
      artworkCacheKey: 'cover',
      releaseDate: '2020-01-01',
      tracks: [createTrack(1)],
      moreAlbums: [],
      catalogTracks: [createTrack(1), createTrack(2, { album: 'Other' })],
    })
    const library = createLibraryClient()
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })

    expect(detail.loadState.value).toBe('ready')
    expect(detail.albumTracks.value.map((track) => track.id)).toEqual([1])
    expect(detail.previewArtworkCacheKey.value).toBe('cover')
    expect(detail.moreAlbums.value.map((album) => album.title)).toEqual(['Other'])

    await detail.initialize()
    expect(library.getAlbumDetail).not.toHaveBeenCalled()

    library.getAlbumDetail.mockResolvedValue({
      tracks: [createTrack(1)],
      moreAlbums: [],
      genreAlbums: [],
    })
    library.emit({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
    expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)
  })

  it('loads the album via getAlbumDetail and derives ready/not-found state', async () => {
    const library = createLibraryClient()
    library.getAlbumDetail.mockResolvedValue({
      tracks: [createTrack(1)],
      genreAlbums: [],
      moreAlbums: [
        {
          title: 'Other',
          albumArtist: 'Artist',
          releaseDate: '2019-01-01',
          artworkCacheKey: null,
        },
      ],
    })
    const albumArtist = ref('Artist')
    const albumTitle = ref('Album')
    const detail = useAlbumDetailTracks({
      albumArtist,
      albumTitle,
      library: library.client,
    })

    await detail.initialize()

    expect(detail.loadState.value).toBe('ready')
    expect(detail.albumTracks.value.map((track) => track.id)).toEqual([1])
    expect(detail.moreAlbums.value.map((album) => album.title)).toEqual(['Other'])
    expect(library.getAlbumDetail).toHaveBeenCalledWith({
      albumArtist: 'Artist',
      albumTitle: 'Album',
    })

    albumTitle.value = 'Missing'
    await detail.ensureCurrentAlbum()
    expect(detail.loadState.value).toBe('not-found')
  })

  it('lets the newest request win when background reloads resolve out of order', async () => {
    const library = createLibraryClient()
    const first = createDeferred<AlbumDetailResult>()
    const second = createDeferred<AlbumDetailResult>()
    library.getAlbumDetail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })

    const firstReload = detail.reloadTracks({ background: true })
    const secondReload = detail.reloadTracks({ background: true })
    second.resolve({ tracks: [createTrack(2)], moreAlbums: [], genreAlbums: [] })

    await expect(secondReload).resolves.toBe(true)
    expect(detail.tracks.value.map((track) => track.id)).toEqual([2])

    first.resolve({ tracks: [createTrack(1)], moreAlbums: [], genreAlbums: [] })
    await expect(firstReload).resolves.toBe(false)
    expect(detail.tracks.value.map((track) => track.id)).toEqual([2])
  })

  it.each(['success', 'failure'] as const)(
    'ignores an old album refresh %s after navigation reuses a catalog snapshot',
    async (outcome) => {
      const oldTrack = createTrack(1, {
        album: 'A',
        artworkCacheKey: 'cover-A',
        releaseDate: '2001-01-01',
      })
      const nextTrack = createTrack(2, { album: 'B' })
      const catalog = [oldTrack, nextTrack]
      writeAlbumDetailSnapshot({
        albumArtist: 'Artist',
        albumTitle: 'A',
        artworkCacheKey: oldTrack.artworkCacheKey,
        releaseDate: oldTrack.releaseDate,
        tracks: [oldTrack],
        moreAlbums: [],
        catalogTracks: catalog,
      })
      const library = createLibraryClient()
      const pending = createDeferred<AlbumDetailResult>()
      library.getAlbumDetail.mockReturnValueOnce(pending.promise)
      const title = ref('A')
      const detail = useAlbumDetailTracks({
        albumArtist: ref('Artist'),
        albumTitle: title,
        library: library.client,
      })
      try {
        await detail.initialize()
        const reload = detail.reloadTracks({ background: true })
        const album = detail.moreAlbums.value.find((item) => item.title === 'B')!
        // Match AlbumDetailPage.openAlbum's snapshot handoff.
        writeAlbumDetailSnapshot({
          albumArtist: album.albumArtist,
          albumTitle: album.title,
          artworkCacheKey: album.artworkCacheKey,
          releaseDate: album.releaseDate,
          tracks: album.tracks,
          moreAlbums: detail.moreAlbums.value.filter((item) => item.key !== album.key),
          catalogTracks: detail.tracks.value,
        })
        title.value = 'B'
        await detail.ensureCurrentAlbum()
        const nextSnapshot = readAlbumDetailSnapshot('Artist', 'B')

        if (outcome === 'success')
          pending.resolve({ tracks: [oldTrack], moreAlbums: [], genreAlbums: [] })
        else pending.reject(new Error('Old album refresh failed'))

        await expect(reload).resolves.toBe(false)
        expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)
        expect(detail.albumTracks.value.map((item) => item.id)).toEqual([2])
        expect(detail.previewArtworkCacheKey.value).toBeNull()
        expect(detail.previewReleaseDate.value).toBeNull()
        expect(detail.loadState.value).toBe('ready')
        expect(readAlbumDetailSnapshot('Artist', 'B')).toBe(nextSnapshot)
        expect(nextSnapshot?.tracks.map((item) => item.id)).toEqual([2])
      } finally {
        detail.dispose()
      }
    },
  )

  it('rejects a refresh when album identity changes before the route watcher runs', async () => {
    const library = createLibraryClient()
    const pending = createDeferred<AlbumDetailResult>()
    library.getAlbumDetail.mockReturnValueOnce(pending.promise)
    const artist = ref('Artist')
    const detail = useAlbumDetailTracks({
      albumArtist: artist,
      albumTitle: ref('Album'),
      library: library.client,
    })
    try {
      const reload = detail.reloadTracks()
      artist.value = 'Other Artist'
      pending.resolve({ tracks: [createTrack(1)], moreAlbums: [], genreAlbums: [] })
      await expect(reload).resolves.toBe(false)
      expect(detail.tracks.value).toEqual([])
      expect(readAlbumDetailSnapshot('Other Artist', 'Album')).toBeNull()
    } finally {
      detail.dispose()
    }
  })

  it('ends an old refresh even after cached navigation returns to the same album', async () => {
    const oldTrack = createTrack(1, { album: 'A' })
    const otherTrack = createTrack(2, { album: 'B' })
    const catalog = [oldTrack, otherTrack]
    const seed = (albumTitle: string, item: TrackListItem) =>
      writeAlbumDetailSnapshot({
        albumArtist: 'Artist',
        albumTitle,
        artworkCacheKey: null,
        releaseDate: null,
        tracks: [item],
        moreAlbums: [],
        catalogTracks: catalog,
      })
    seed('A', oldTrack)
    const library = createLibraryClient()
    const pending = createDeferred<AlbumDetailResult>()
    library.getAlbumDetail.mockReturnValueOnce(pending.promise)
    const title = ref('A')
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: title,
      library: library.client,
    })
    try {
      await detail.initialize()
      const reload = detail.reloadTracks({ background: true })
      seed('B', otherTrack)
      title.value = 'B'
      await detail.ensureCurrentAlbum()
      seed('A', oldTrack)
      title.value = 'A'
      await detail.ensureCurrentAlbum()
      const snapshot = readAlbumDetailSnapshot('Artist', 'A')
      pending.resolve({
        tracks: [{ ...oldTrack, title: 'Stale response' }],
        moreAlbums: [],
        genreAlbums: [],
      })
      await expect(reload).resolves.toBe(false)
      expect(detail.albumTracks.value[0].title).toBe(oldTrack.title)
      expect(readAlbumDetailSnapshot('Artist', 'A')).toBe(snapshot)
      expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)
    } finally {
      detail.dispose()
    }
  })

  it('debounces play-stat changes but reloads other library changes immediately', async () => {
    vi.useFakeTimers()
    const library = createLibraryClient()
    library.getAlbumDetail.mockResolvedValue({
      tracks: [createTrack(1)],
      moreAlbums: [],
      genreAlbums: [],
    })
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
      playStatsReloadDebounceMs: 400,
    })
    await detail.initialize()

    const baseEvent = { trackIds: [1], filePaths: [] }
    library.emit({ ...baseEvent, reason: 'play-stats-updated' })
    library.emit({ ...baseEvent, reason: 'play-stats-reset' })
    await vi.advanceTimersByTimeAsync(399)
    expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(library.getAlbumDetail).toHaveBeenCalledTimes(2)

    library.emit({ ...baseEvent, reason: 'metadata-refresh' })
    expect(library.getAlbumDetail).toHaveBeenCalledTimes(3)

    detail.dispose()
    expect(library.unsubscribe).toHaveBeenCalledOnce()
  })

  it('preserves an existing ready snapshot after a failed background reload', async () => {
    const library = createLibraryClient()
    library.getAlbumDetail
      .mockResolvedValueOnce({ tracks: [createTrack(1)], moreAlbums: [], genreAlbums: [] })
      .mockRejectedValueOnce(new Error('fail'))
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
    })

    await detail.initialize()
    await expect(detail.reloadTracks({ background: true })).resolves.toBe(false)

    expect(detail.loadState.value).toBe('ready')
    expect(detail.tracks.value.map((track) => track.id)).toEqual([1])
  })

  it('reports an initial foreground failure and cancels pending work on dispose', async () => {
    vi.useFakeTimers()
    const library = createLibraryClient()
    library.getAlbumDetail
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue({ tracks: [createTrack(1)], moreAlbums: [], genreAlbums: [] })
    const detail = useAlbumDetailTracks({
      albumArtist: ref('Artist'),
      albumTitle: ref('Album'),
      library: library.client,
      playStatsReloadDebounceMs: 400,
    })

    await detail.initialize()
    expect(detail.loadState.value).toBe('error')

    library.emit({ reason: 'play-stats-updated', trackIds: [1], filePaths: [] })
    detail.dispose()
    await vi.advanceTimersByTimeAsync(400)

    expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)
    expect(library.unsubscribe).toHaveBeenCalledOnce()
  })
})
