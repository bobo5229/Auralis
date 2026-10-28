import { readonly, ref } from 'vue'

export const LYRICS_COUNTDOWN_KEY = 'auralis-lyrics-countdown-effect'
export const LYRICS_COUNTDOWN_EFFECTS = ['lighting', 'fracture'] as const
export type LyricsCountdownEffect = (typeof LYRICS_COUNTDOWN_EFFECTS)[number]

function readEffect(): LyricsCountdownEffect {
  try {
    return localStorage.getItem(LYRICS_COUNTDOWN_KEY) === 'fracture' ? 'fracture' : 'lighting'
  } catch {
    return 'lighting'
  }
}

const effect = ref<LyricsCountdownEffect>(readEffect())
const persistFailed = ref(false)

export function useLyricsCountdownPreference() {
  return {
    effect: readonly(effect),
    persistFailed: readonly(persistFailed),
    setEffect(value: LyricsCountdownEffect): void {
      if (value === effect.value && !persistFailed.value) return
      effect.value = value
      try {
        localStorage.setItem(LYRICS_COUNTDOWN_KEY, value)
        persistFailed.value = false
      } catch {
        persistFailed.value = true
      }
    },
  }
}

export function initLyricsCountdownPreference(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== LYRICS_COUNTDOWN_KEY && event.key !== null) return
    effect.value = readEffect()
    persistFailed.value = false
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
