import { readonly, ref } from 'vue'

export const LYRICS_SCROLL_PRESET_KEY = 'auralis-lyrics-scroll-preset'

export const LYRICS_SCROLL_PRESETS = ['standard', 'quick', 'soft', 'emphasized'] as const
export type LyricsScrollPreset = (typeof LYRICS_SCROLL_PRESETS)[number]

const EASING_BY_PRESET: Record<LyricsScrollPreset, string> = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  quick: 'cubic-bezier(0, 0, 0.2, 1)',
  soft: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
}

function parsePreset(value: string | null): LyricsScrollPreset {
  return LYRICS_SCROLL_PRESETS.find((preset) => preset === value) ?? 'standard'
}

function readPreset(): LyricsScrollPreset {
  try {
    return parsePreset(localStorage.getItem(LYRICS_SCROLL_PRESET_KEY))
  } catch {
    return 'standard'
  }
}

const preset = ref<LyricsScrollPreset>(readPreset())
const persistFailed = ref(false)

export function getLyricsScrollPreset(): LyricsScrollPreset {
  return preset.value
}

export function getLyricsScrollEasing(value: LyricsScrollPreset = preset.value): string {
  return EASING_BY_PRESET[value]
}

export function setLyricsScrollPreset(value: LyricsScrollPreset): void {
  if (value === preset.value && !persistFailed.value) return
  preset.value = value
  try {
    localStorage.setItem(LYRICS_SCROLL_PRESET_KEY, value)
    persistFailed.value = false
  } catch {
    persistFailed.value = true
  }
}

export function useLyricsScrollPreset() {
  return {
    preset: readonly(preset),
    persistFailed: readonly(persistFailed),
    setPreset: setLyricsScrollPreset,
  }
}

export function initLyricsScrollPreset(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== LYRICS_SCROLL_PRESET_KEY && event.key !== null) return
    preset.value = readPreset()
    persistFailed.value = false
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
