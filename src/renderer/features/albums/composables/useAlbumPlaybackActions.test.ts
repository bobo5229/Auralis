import { computed, ref, shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackMode } from '@renderer/features/playback/types'
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
  const hasCurrentTrack = ref(true)
  const actions = useAlbumPlaybackActions({
    tracks,
    catalogIndex,
    playback,
    contextMenu,
    closeContextMenu,
    hasCurrentTrack,
  })
  return {
    actions,
    album,
    playback,
    playTrackFromQueue,
    insertTracksAfterCurrent,
    hasCurrentTrack,
    contextMenu,
    closeContextMenu,
    tracks,
  }
}

it.each(['sequential', 'shuffle'] as const)(
  'plays immediately from the button and context menu with the existing %s queue',
  (mode) => {
    for (const entry of ['button', 'context'] as const) {
      const f = fixture(mode)
      if (entry === 'button') f.actions.playAlbum(f.album)
      else f.actions.playContextAlbum()
      expect(f.playTrackFromQueue).toHaveBeenCalledOnce()
      const [queue, firstId] = f.playTrackFromQueue.mock.calls[0]
      expect(queue.map((track: TrackListItem) => track.id)).toEqual(
        mode === 'shuffle' ? [1, 3] : [1, 3, 2],
      )
      expect(firstId).toBe(1)
      if (entry === 'context') {
        expect(f.closeContextMenu).toHaveBeenCalledOnce()
        expect(f.contextMenu.value).toBeNull()
      }
    }
  },
)

it('does not play a stale album or an absent context selection', () => {
  const f = fixture()
  f.tracks.value = []
  f.actions.playAlbum(f.album)
  f.contextMenu.value = null
  f.actions.playContextAlbum()
  expect(f.playTrackFromQueue).not.toHaveBeenCalled()
})

it('inserts album tracks only while there is a current track', () => {
  const insert = fixture()
  insert.hasCurrentTrack.value = false
  insert.actions.insertContextAlbum()
  expect(insert.insertTracksAfterCurrent).not.toHaveBeenCalled()
  expect(insert.closeContextMenu).not.toHaveBeenCalled()
  insert.hasCurrentTrack.value = true
  insert.actions.insertContextAlbum()
  expect(
    insert.insertTracksAfterCurrent.mock.calls[0][0].map((track: TrackListItem) => track.id),
  ).toEqual([1, 3])
  expect(insert.closeContextMenu).toHaveBeenCalledOnce()
  expect(insert.contextMenu.value).toBeNull()
})
