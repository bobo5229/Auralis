import { readonly, ref } from 'vue'

// Keep background preferences for this app session, including fullscreen re-entry.
const backgroundMotionPaused = ref(false)

export function useFullscreenBackground() {
  return {
    backgroundMotionPaused: readonly(backgroundMotionPaused),
    setBackgroundMotionPaused(paused: boolean) {
      backgroundMotionPaused.value = paused
    },
  }
}
