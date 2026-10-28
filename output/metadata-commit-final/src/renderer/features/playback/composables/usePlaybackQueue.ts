import { computed } from 'vue'
import { usePlayback } from './usePlayback'

const UPCOMING_TRACK_LIMIT = 100

/**
 * Shared queue projection for player surfaces.
 *
 * The playback store remains the sole source of truth. This composable only derives the
 * currently-playing item and the bounded list that follows it, matching the Playbar queue.
 */
export function usePlaybackQueue() {
  const playback = usePlayback()

  const currentTrack = computed(() => playback.state.currentTrack)
  const queue = computed(() => playback.state.queue)
  const currentIndex = computed(() => playback.state.currentIndex)
  const upcomingTracks = computed(() => {
    if (currentIndex.value < 0) return []
    return queue.value.slice(currentIndex.value + 1, currentIndex.value + 1 + UPCOMING_TRACK_LIMIT)
  })
  const isQueueEmpty = computed(() => !currentTrack.value || queue.value.length === 0)
  const totalCount = computed(() => queue.value.length)

  async function playTrack(trackId: number): Promise<void> {
    await playback.playTrackFromQueue(playback.state.queue, trackId)
  }

  function isActive(trackId: number): boolean {
    return trackId === playback.state.currentTrackId
  }

  return {
    currentTrack,
    currentIndex,
    upcomingTracks,
    isQueueEmpty,
    totalCount,
    playTrack,
    isActive,
  }
}
