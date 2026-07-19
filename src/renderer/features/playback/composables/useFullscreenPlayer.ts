import { computed } from 'vue'
import { usePlayerDisplayMode } from './usePlayerDisplayMode'

export function useFullscreenPlayer() {
  const { displayMode, showFullscreenPlayer, showNormalPlayer } = usePlayerDisplayMode()
  const isFullscreenPlayerOpen = computed(() => displayMode.value === 'fullscreen')

  function openFullscreenPlayer(): void {
    showFullscreenPlayer()
  }

  function closeFullscreenPlayer(): void {
    if (displayMode.value === 'fullscreen') {
      showNormalPlayer()
    }
  }

  return {
    isFullscreenPlayerOpen,
    openFullscreenPlayer,
    closeFullscreenPlayer,
  }
}
