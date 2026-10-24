import { computed, ref, shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackMode } from '@renderer/features/playback/types'
import type { AlbumDropRequest } from '../utils/albumDropMotion'
import { getAlbumCatalogIndex } from '../utils/albumCatalogIndex'
import { useAlbumPlaybackActions } from './useAlbumPlaybackActions'

function fixture(mode: PlaybackMode = 'sequential') {
  const tracks = shallowRef(
    [1, 2, 3].map(
      (id) =>
        ({
          id,
          title: `Track ${id}`,
          album: id === 2 ? 'B' : 'A',
          artist: 'Artist',
          albumArtist: 'Artist',
          trackNo: id,
          discNo: 1,
          artworkCacheKey: null,
          releaseDate: null,
        }) as TrackListItem,
    ),
  )
  const catalogIndex = computed(() => getAlbumCatalogIndex(tracks.value))
  const album = catalogIndex.value.albums.find((item) => item.title === 'A')!
  const contextMenu = shallowRef<{ album: typeof album } | null>({ album })
  const closeContextMenu = vi.fn(() => {
    contextMenu.value = null
  })
  const playTrackFromQueue = vi.fn()
  const insertTracksAfterCurrent = vi.fn()
  const playback = {
    state: { currentTrackId: 1, playbackMode: mode },
    playTrackFromQueue,
    insertTracksAfterCurrent,
  } as unknown as Parameters<typeof useAlbumPlaybackActions>[0]['playback']
  let drop: AlbumDropRequest | undefined
  const cancel = vi.fn()
  const dropLayerRef = shallowRef({
    cancel,
    play: (request: AlbumDropRequest) => {
      drop = request
    },
  })
  const canDropAlbum = ref(true)
  const isDropActive = ref(false)
  const hasCurrentTrack = ref(true)
  const actions = useAlbumPlaybackActions({
    tracks,
    catalogIndex,
    playback,
    contextMenu,
    closeContextMenu,
    dropLayerRef,
    canDropAlbum,
    isDropActive,
    hasCurrentTrack,
  })
  return {
    actions,
    album,
    playback,
    playTrackFromQueue,
    insertTracksAfterCurrent,
    cancel,
    canDropAlbum,
    isDropActive,
    hasCurrentTrack,
    getDrop: () => drop,
  }
}

it('preserves sequential continuation and scoped shuffle when playing a cover', () => {
  const sequential = fixture()
  sequential.actions.playCoverAlbum(sequential.album)
  expect(sequential.cancel).toHaveBeenCalledOnce()
  expect(
    sequential.playTrackFromQueue.mock.calls[0][0].map((track: TrackListItem) => track.id),
  ).toEqual([1, 3, 2])
  expect(sequential.playTrackFromQueue.mock.calls[0][1]).toBe(1)
  const shuffle = fixture('shuffle')
  shuffle.actions.playContextAlbum()
  expect(
    shuffle.playTrackFromQueue.mock.calls[0][0].map((track: TrackListItem) => track.id),
  ).toEqual([1, 3])
})

it('plays only when a permitted drop lands and inserts only while there is a current track', () => {
  const f = fixture()
  f.canDropAlbum.value = false
  f.actions.dropAlbum(f.album, {} as HTMLElement)
  expect(f.getDrop()).toBeUndefined()
  f.canDropAlbum.value = true
  f.actions.dropAlbum(f.album, {} as HTMLElement)
  expect(f.playTrackFromQueue).not.toHaveBeenCalled()
  f.getDrop()!.onLand()
  expect(f.playTrackFromQueue).toHaveBeenCalledOnce()
  const insert = fixture()
  insert.hasCurrentTrack.value = false
  insert.actions.insertContextAlbum()
  expect(insert.insertTracksAfterCurrent).not.toHaveBeenCalled()
  insert.hasCurrentTrack.value = true
  insert.actions.insertContextAlbum()
  expect(
    insert.insertTracksAfterCurrent.mock.calls[0][0].map((track: TrackListItem) => track.id),
  ).toEqual([1, 3])
})
