import type { Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import type { AlbumSummary } from '@shared/types/albumSummary'
import type { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import { buildAlbumPlaybackQueue } from '@renderer/shared/catalog/albumPlaybackQueue'

export function useAlbumPlaybackActions({
  tracks,
  catalogIndex,
  playback,
  hasCurrentTrack,
  contextMenu,
  closeContextMenu,
}: {
  tracks: Readonly<Ref<TrackListItem[]>>
  catalogIndex: Readonly<Ref<ReturnType<typeof getAlbumCatalogIndex>>>
  playback: Pick<PlaybackPublicApi, 'state' | 'playTrackFromQueue' | 'insertTracksAfterCurrent'>
  hasCurrentTrack: Readonly<Ref<boolean>>
  contextMenu: Readonly<Ref<{ album: AlbumSummary } | null>>
  closeContextMenu: () => void
}) {
  function selectAlbumPlaybackTracks(album: AlbumSummary): readonly TrackListItem[] {
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

  function insertContextAlbum(): void {
    if (!hasCurrentTrack.value) return
    const album = contextMenu.value?.album
    closeContextMenu()
    if (!album) return

    playback.insertTracksAfterCurrent(selectAlbumPlaybackTracks(album))
  }
  return { playAlbum, playContextAlbum, insertContextAlbum }
}
