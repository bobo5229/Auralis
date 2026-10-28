import { onScopeDispose, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { buildAlbumPlaybackQueue } from '../utils/albumPlaybackQueue'

interface AlbumDetailPlaybackOptions {
  albumArtist: Readonly<Ref<string>>
  albumTitle: Readonly<Ref<string>>
  tracks: Readonly<Ref<TrackListItem[]>>
  albumTracks: Readonly<Ref<TrackListItem[]>>
  ensurePlaybackCatalog: () => Promise<TrackListItem[] | null>
  playbackCatalogRevision: Readonly<Ref<number>>
  playback: Pick<
    PlaybackPublicApi,
    'state' | 'queueSession' | 'commandRevision' | 'playTrackFromQueue' | 'setPlaybackMode'
  >
}

export function useAlbumDetailPlayback({
  albumArtist,
  albumTitle,
  tracks,
  albumTracks,
  ensurePlaybackCatalog,
  playbackCatalogRevision,
  playback,
}: AlbumDetailPlaybackOptions) {
  let actionId = 0
  const cancel = (): void => {
    actionId += 1
  }
  watch(
    [
      albumArtist,
      albumTitle,
      () => playback.state.playbackMode,
      () => playback.queueSession.value,
      () => playback.commandRevision.value,
      playbackCatalogRevision,
    ],
    cancel,
    { flush: 'sync' },
  )
  onScopeDispose(cancel)

  async function playTrack(trackId: number): Promise<void> {
    const action = ++actionId
    if (!albumTracks.value.some((track) => track.id === trackId)) return
    const mode = playback.state.playbackMode
    try {
      const catalog = mode === 'sequential' ? await ensurePlaybackCatalog() : tracks.value
      if (!catalog || action !== actionId) return
      const queue = buildAlbumPlaybackQueue(catalog, albumArtist.value, albumTitle.value, mode)
      if (!queue.some((track) => track.id === trackId)) return
      await playback.playTrackFromQueue(queue, trackId)
    } catch (error) {
      if (action !== actionId) return
      rendererDiagnostics.error({
        scope: 'albums.detail.play',
        message: 'Failed to start album playback',
        cause: error,
      })
    }
  }

  function playAlbum(): void {
    const firstTrack = albumTracks.value[0]
    if (firstTrack) void playTrack(firstTrack.id)
  }

  function playAlbumShuffle(): void {
    cancel()
    const pool = albumTracks.value
    if (pool.length === 0) return
    const startTrack = pool[Math.floor(Math.random() * pool.length)]
    if (!startTrack) return
    // Preserve the explicit album-only shuffle pool, independently of the catalog.
    playback.setPlaybackMode('shuffle')
    void playback.playTrackFromQueue(pool, startTrack.id, { shufflePool: pool })
  }

  return { playAlbum, playTrack, playAlbumShuffle, cancel }
}
