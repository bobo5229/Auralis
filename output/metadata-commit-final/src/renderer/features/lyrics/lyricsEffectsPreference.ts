import { reactive, readonly } from 'vue'

export type LyricsEffect = 'edgeFade' | 'blur'

const STORAGE_KEYS: Record<LyricsEffect, string> = {
  edgeFade: 'auralis-normal-lyrics-edge-fade',
  blur: 'auralis-normal-lyrics-blur',
}

function readEnabled(effect: LyricsEffect): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS[effect]) !== 'false'
  } catch {
    return true
  }
}

const effects = reactive({ edgeFade: readEnabled('edgeFade'), blur: readEnabled('blur') })
const persistFailed = reactive({ edgeFade: false, blur: false })

export function useLyricsEffectsPreference() {
  return {
    effects: readonly(effects),
    persistFailed: readonly(persistFailed),
    setEnabled(effect: LyricsEffect, enabled: boolean): void {
      effects[effect] = enabled
      try {
        localStorage.setItem(STORAGE_KEYS[effect], String(enabled))
        persistFailed[effect] = false
      } catch {
        persistFailed[effect] = true
      }
    },
  }
}
