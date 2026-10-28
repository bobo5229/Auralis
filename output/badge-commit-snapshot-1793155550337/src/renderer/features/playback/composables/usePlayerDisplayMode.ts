import { readonly, ref } from 'vue'

export type PlayerDisplayMode = 'normal' | 'fullscreen'

const displayMode = ref<PlayerDisplayMode>('normal')

export function _resetDisplayModeStateForTesting(): void {
  displayMode.value = 'normal'
}

/** Shared presentation state for the app shell and fullscreen player. */
export function usePlayerDisplayMode() {
  function showNormalPlayer(): void {
    displayMode.value = 'normal'
  }

  function showFullscreenPlayer(): void {
    displayMode.value = 'fullscreen'
  }

  return {
    displayMode: readonly(displayMode),
    showNormalPlayer,
    showFullscreenPlayer,
  }
}
