import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { AlbumDetailResult } from '@shared/types/albumDetail'
import type { TrackListItem } from '@shared/types/libraryScan'

import { invalidateAlbumDetailSnapshot, writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import { selectAlbumTracks, useAlbumDetailTracks } from './useAlbumDetailTracks'

type LibraryClient = Pick<AuralisApi['library'], 'getAlbumDetail' | 'onChanged'>
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
  const getAlbumDetail = vi.fn(
    async (): Promise<AlbumDetailResult> => ({ tracks: [], moreAlbums: [] }),
  )
  const onChanged = vi.fn((listener: LibraryChangedListener) => {
    changedListener = listener
    return unsubscribe
  })

  return {
    client: { getAlbumDetail, onChanged } satisfies LibraryClient,
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

    library.getAlbumDetail.mockResolvedValue({ tracks: [createTrack(1)], moreAlbums: [] })
    library.emit({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
    expect(library.getAlbumDetail).toHaveBeenCalledTimes(1)
  })

  it('loads the album via getAlbumDetail and derives ready/not-found state', async () => {
    const library = createLibraryClient()
    library.getAlbumDetail.mockResolvedValue({
      tracks: [createTrack(1)],
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
    second.resolve({ tracks: [createTrack(2)], moreAlbums: [] })

    await expect(secondReload).resolves.toBe(true)
    expect(detail.tracks.value.map((track) => track.id)).toEqual([2])

    first.resolve({ tracks: [createTrack(1)], moreAlbums: [] })
    await expect(firstReload).resolves.toBe(false)
    expect(detail.tracks.value.map((track) => track.id)).toEqual([2])
  })

  it('debounces play-stat changes but reloads other library changes immediately', async () => {
    vi.useFakeTimers()
    const library = createLibraryClient()
    library.getAlbumDetail.mockResolvedValue({ tracks: [createTrack(1)], moreAlbums: [] })
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
      .mockResolvedValueOnce({ tracks: [createTrack(1)], moreAlbums: [] })
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
      .mockResolvedValue({ tracks: [createTrack(1)], moreAlbums: [] })
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
