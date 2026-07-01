import { readonly, ref } from 'vue'

const isFullscreenPlayerOpen = ref(false)

export function useFullscreenPlayer() {
  function openFullscreenPlayer(): void {
    isFullscreenPlayerOpen.value = true
  }

  function closeFullscreenPlayer(): void {
    isFullscreenPlayerOpen.value = false
  }

  return {
    isFullscreenPlayerOpen: readonly(isFullscreenPlayerOpen),
    openFullscreenPlayer,
    closeFullscreenPlayer,
  }
}
