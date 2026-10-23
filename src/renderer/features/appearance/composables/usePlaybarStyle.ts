import { readonly, ref } from 'vue'

export const PLAYBAR_STYLE_KEY = 'auralis-playbar-style'
export const PLAYBAR_STYLES = ['plain', 'frosted'] as const
export type PlaybarStyle = (typeof PLAYBAR_STYLES)[number]

function readStyle(): PlaybarStyle {
  try {
    const stored = localStorage.getItem(PLAYBAR_STYLE_KEY)
    return PLAYBAR_STYLES.find((value) => value === stored) ?? 'plain'
  } catch {
    return 'plain'
  }
}

const style = ref<PlaybarStyle>(readStyle())
const persistFailed = ref(false)

function setStyle(value: PlaybarStyle): void {
  if (!PLAYBAR_STYLES.some((candidate) => candidate === value)) return
  if (style.value === value && !persistFailed.value) return

  style.value = value
  try {
    localStorage.setItem(PLAYBAR_STYLE_KEY, value)
    persistFailed.value = false
  } catch {
    persistFailed.value = true
  }
}

export function usePlaybarStyle() {
  return {
    style: readonly(style),
    persistFailed: readonly(persistFailed),
    setStyle,
  }
}
