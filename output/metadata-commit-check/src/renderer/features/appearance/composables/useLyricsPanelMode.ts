import { readonly, ref } from 'vue'

export const LYRICS_PANEL_MODE_KEY = 'auralis-lyrics-panel-mode'
export const LYRICS_PANEL_MODES = ['split', 'floating'] as const
export type LyricsPanelMode = (typeof LYRICS_PANEL_MODES)[number]

function readMode(): LyricsPanelMode {
  try {
    return localStorage.getItem(LYRICS_PANEL_MODE_KEY) === 'floating' ? 'floating' : 'split'
  } catch {
    return 'split'
  }
}

const mode = ref<LyricsPanelMode>(readMode())
const persistFailed = ref(false)

export function useLyricsPanelMode() {
  return {
    mode: readonly(mode),
    persistFailed: readonly(persistFailed),
    setMode(value: LyricsPanelMode): void {
      if (mode.value === value && !persistFailed.value) return
      mode.value = value
      try {
        localStorage.setItem(LYRICS_PANEL_MODE_KEY, value)
        persistFailed.value = false
      } catch {
        persistFailed.value = true
      }
    },
  }
}

export function initLyricsPanelMode(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== LYRICS_PANEL_MODE_KEY && event.key !== null) return
    mode.value = readMode()
    persistFailed.value = false
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
