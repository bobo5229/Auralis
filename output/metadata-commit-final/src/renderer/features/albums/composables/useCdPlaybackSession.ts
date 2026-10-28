import { computed, ref, type Ref } from 'vue'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'
import {
  buildCdPlaybackPlan,
  getNextCdPlaybackMode,
  type CdPlaybackMode,
} from '../utils/cdPlaybackQueue'

interface Options {
  albums: Readonly<Ref<CdAlbumInfo[]>>
  focusedAlbum: Readonly<Ref<CdAlbumInfo | null>>
  playback: Pick<
    PlaybackPublicApi,
    'queueSession' | 'playTrackFromQueue' | 'replaceCurrentPlaybackQueue' | 'togglePlayPause'
  > & { state: Pick<PlaybackPublicApi['state'], 'currentTrackId' | 'queue'> }
  isUnavailable: () => boolean
}

/** Translates CD-room actions into the shared player's explicit queue operations. */
export function useCdPlaybackSession(options: Options) {
  const { albums, focusedAlbum, playback } = options
  const cdMode = ref<CdPlaybackMode>('catalog-sequential')
  const browsingPlaybackAlbumIndex = computed(() => {
    const trackId = playback.state.currentTrackId
    if (trackId === null) return -1
    return albums.value.findIndex((album) => album.tracks.some((track) => track.id === trackId))
  })
  const ringTrackMatches = computed(() => {
    const trackId = playback.state.currentTrackId
    return (
      trackId !== null && Boolean(focusedAlbum.value?.tracks.some((track) => track.id === trackId))
    )
  })

  function playCdTrack(id: number): void {
    if (!focusedAlbum.value?.tracks.some((track) => track.id === id)) return
    const plan = buildCdPlaybackPlan(albums.value, id, cdMode.value)
    if (!plan) return
    void playback.playTrackFromQueue(plan.queue, id, {
      source: 'cd',
      shufflePool: plan.shufflePool,
      shuffleCycle: plan.shuffleCycle,
      playbackMode: plan.playbackMode,
      replaceHistory: true,
    })
  }

  function cycleMode(): void {
    cdMode.value = getNextCdPlaybackMode(cdMode.value)
    const currentTrackId = playback.state.currentTrackId
    const session = playback.queueSession.value
    if (currentTrackId === null || session?.source !== 'cd') return
    const plan = buildCdPlaybackPlan(albums.value, currentTrackId, cdMode.value)
    if (!plan) return
    playback.replaceCurrentPlaybackQueue({
      expectedSessionId: session.id,
      expectedTrackId: currentTrackId,
      expectedQueueTrackIds: playback.state.queue.map((track) => track.id),
      queue: plan.queue,
      playbackMode: plan.playbackMode,
      shufflePool: plan.shufflePool,
      shuffleCycle: plan.shuffleCycle,
    })
  }

  function toggleCdPlayback(): boolean {
    if (!ringTrackMatches.value || options.isUnavailable()) return false
    void playback.togglePlayPause()
    return true
  }

  return {
    cdMode,
    browsingPlaybackAlbumIndex,
    ringTrackMatches,
    playCdTrack,
    cycleMode,
    toggleCdPlayback,
  }
}
