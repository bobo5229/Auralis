import type { Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import type { AlbumSummary } from '../types'
import type { AlbumDropRequest } from '../utils/albumDropMotion'
import type { getAlbumCatalogIndex } from '../utils/albumCatalogIndex'
import { buildAlbumPlaybackQueue } from '../utils/albumPlaybackQueue'

export function useAlbumPlaybackActions({
  tracks,
  catalogIndex,
  playback,
  hasCurrentTrack,
  contextMenu,
  closeContextMenu,
  dropLayerRef,
  canDropAlbum,
  isDropActive,
}: {
  tracks: Readonly<Ref<TrackListItem[]>>
  catalogIndex: Readonly<Ref<ReturnType<typeof getAlbumCatalogIndex>>>
  playback: Pick<PlaybackPublicApi, 'state' | 'playTrackFromQueue' | 'insertTracksAfterCurrent'>
  hasCurrentTrack: Readonly<Ref<boolean>>
  contextMenu: Readonly<Ref<{ album: AlbumSummary } | null>>
  closeContextMenu: () => void
  dropLayerRef: Readonly<
    Ref<{ cancel: () => void; play: (request: AlbumDropRequest) => void } | null>
  >
  canDropAlbum: Readonly<Ref<boolean>>
  isDropActive: Readonly<Ref<boolean>>
}) {
  function selectAlbumPlaybackTracks(album: AlbumSummary): TrackListItem[] {
    return catalogIndex.value.selectTracks(album.albumArtist, album.title)
  }

  function playAlbum(album: AlbumSummary): void {
    const firstTrack = selectAlbumPlaybackTracks(album)[0]
    if (!firstTrack) return

    void playback.playTrackFromQueue(
      buildAlbumPlaybackQueue(
        tracks.value,
        album.albumArtist,
        album.title,
        playback.state.playbackMode,
      ),
      firstTrack.id,
    )
  }

  function playContextAlbum(): void {
    const album = contextMenu.value?.album
    closeContextMenu()
    if (album) playAlbum(album)
  }

  function playCoverAlbum(album: AlbumSummary): void {
    dropLayerRef.value?.cancel()
    playAlbum(album)
  }

  function dropAlbum(album: AlbumSummary, cover: HTMLElement): void {
    if (!canDropAlbum.value || isDropActive.value || !album.tracks.length) return
    closeContextMenu()
    dropLayerRef.value?.play({ album, cover, onLand: () => playAlbum(album) })
  }

  function insertContextAlbum(): void {
    if (!hasCurrentTrack.value) return
    const album = contextMenu.value?.album
    closeContextMenu()
    if (!album) return

    playback.insertTracksAfterCurrent(selectAlbumPlaybackTracks(album))
  }
  return { playContextAlbum, playCoverAlbum, dropAlbum, insertContextAlbum }
}
