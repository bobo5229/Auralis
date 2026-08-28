import { computed, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'

export type AlbumDetailLoadState = 'loading' | 'ready' | 'not-found' | 'error'

type AlbumDetailLibraryClient = Pick<AuralisApi['library'], 'getTracks' | 'onChanged'>

interface UseAlbumDetailTracksOptions {
  albumArtist: Readonly<Ref<string>>
  albumTitle: Readonly<Ref<string>>
  library: AlbumDetailLibraryClient
  playStatsReloadDebounceMs?: number
}

interface UseAlbumDetailTracksResult {
  tracks: Ref<TrackListItem[]>
  albumTracks: ComputedRef<TrackListItem[]>
  loadState: Ref<AlbumDetailLoadState>
  initialize: () => Promise<void>
  reloadTracks: (options?: { background?: boolean }) => Promise<boolean>
  syncLoadStateFromTracks: () => void
  dispose: () => void
}

const DEFAULT_PLAY_STATS_RELOAD_DEBOUNCE_MS = 400

export function selectAlbumTracks(
  tracks: TrackListItem[],
  albumArtist: string,
  albumTitle: string,
): TrackListItem[] {
  return tracks
    .filter((track) => {
      const artist = track.albumArtist || track.artist || 'Unknown Artist'
      const title = track.album || 'Unknown Album'
      return artist === albumArtist && title === albumTitle
    })
    .sort((left, right) => {
      const discOrder = (left.discNo ?? 1) - (right.discNo ?? 1)
      if (discOrder !== 0) return discOrder

      const trackOrder =
        (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER)
      if (trackOrder !== 0) return trackOrder

      return (left.title ?? '').localeCompare(right.title ?? '')
    })
}

export function useAlbumDetailTracks({
  albumArtist,
  albumTitle,
  library,
  playStatsReloadDebounceMs = DEFAULT_PLAY_STATS_RELOAD_DEBOUNCE_MS,
}: UseAlbumDetailTracksOptions): UseAlbumDetailTracksResult {
  const tracks = shallowRef<TrackListItem[]>([])
  const loadState = shallowRef<AlbumDetailLoadState>('loading')
  const albumTracks = computed(() =>
    selectAlbumTracks(tracks.value, albumArtist.value, albumTitle.value),
  )

  let disposed = false
  let loadGeneration = 0
  let playStatsReloadTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeChanged: (() => void) | null = null

  function syncLoadStateFromTracks(): void {
    loadState.value = albumTracks.value.length > 0 ? 'ready' : 'not-found'
  }

  async function reloadTracks(options: { background?: boolean } = {}): Promise<boolean> {
    const requestGeneration = ++loadGeneration
    const hasExistingSnapshot = tracks.value.length > 0
    if (!options.background && !hasExistingSnapshot) loadState.value = 'loading'

    try {
      const nextTracks = await library.getTracks()
      if (disposed || requestGeneration !== loadGeneration) return false

      tracks.value = nextTracks
      syncLoadStateFromTracks()
      return true
    } catch {
      if (disposed || requestGeneration !== loadGeneration) return false

      if (hasExistingSnapshot || options.background) {
        if (hasExistingSnapshot) syncLoadStateFromTracks()
      } else {
        loadState.value = 'error'
      }
      return false
    }
  }

  function schedulePlayStatsReload(): void {
    if (playStatsReloadTimer) clearTimeout(playStatsReloadTimer)
    playStatsReloadTimer = setTimeout(() => {
      playStatsReloadTimer = null
      void reloadTracks({ background: true })
    }, playStatsReloadDebounceMs)
  }

  async function initialize(): Promise<void> {
    await reloadTracks()
    if (disposed) return

    unsubscribeChanged?.()
    unsubscribeChanged = library.onChanged((event) => {
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
        schedulePlayStatsReload()
        return
      }
      void reloadTracks({ background: true })
    })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    loadGeneration += 1

    if (playStatsReloadTimer) {
      clearTimeout(playStatsReloadTimer)
      playStatsReloadTimer = null
    }

    unsubscribeChanged?.()
    unsubscribeChanged = null
  }

  return {
    tracks,
    albumTracks,
    loadState,
    initialize,
    reloadTracks,
    syncLoadStateFromTracks,
    dispose,
  }
}
