import { readonly, ref } from 'vue'

export type FullscreenBackgroundMode = 'fluid' | 'solid'

// Keep background preferences for this app session, including fullscreen re-entry.
const backgroundMode = ref<FullscreenBackgroundMode>('fluid')
const backgroundMotionPaused = ref(false)

export function useFullscreenBackground() {
  return {
    backgroundMode: readonly(backgroundMode),
    backgroundMotionPaused: readonly(backgroundMotionPaused),
    setBackgroundMode(mode: FullscreenBackgroundMode) {
      backgroundMode.value = mode
    },
    setBackgroundMotionPaused(paused: boolean) {
      backgroundMotionPaused.value = paused
    },
  }
}
