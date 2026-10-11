import { readonly, ref, shallowRef } from 'vue'
import {
  DEFAULT_LIQUID_METAL_SETTINGS,
  resolveLiquidMetalSettings,
  type LiquidMetalSettings,
} from '../runtime/liquidMetalSettings'

export type FullscreenBackgroundMode = 'metal' | 'fluid'

// Keep comparison settings for this app session, including leaving/re-entering fullscreen.
const backgroundMode = ref<FullscreenBackgroundMode>('metal')
const backgroundMotionPaused = ref(false)
const metalSettings = shallowRef<LiquidMetalSettings>({ ...DEFAULT_LIQUID_METAL_SETTINGS })

export function useFullscreenBackground() {
  return {
    backgroundMode: readonly(backgroundMode),
    backgroundMotionPaused: readonly(backgroundMotionPaused),
    metalSettings: readonly(metalSettings),
    setBackgroundMode(mode: FullscreenBackgroundMode) {
      backgroundMode.value = mode
    },
    setBackgroundMotionPaused(paused: boolean) {
      backgroundMotionPaused.value = paused
    },
    setMetalSettings(settings: Partial<LiquidMetalSettings>) {
      metalSettings.value = resolveLiquidMetalSettings(settings, metalSettings.value)
    },
    resetMetalSettings() {
      metalSettings.value = { ...DEFAULT_LIQUID_METAL_SETTINGS }
    },
  }
}
