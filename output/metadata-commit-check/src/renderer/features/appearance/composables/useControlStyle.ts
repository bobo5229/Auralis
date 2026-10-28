import { readonly, ref } from 'vue'

export const CONTROL_STYLE_KEY = 'auralis-control-style'
export const CONTROL_STYLES = ['brushed', 'anodized'] as const
export type ControlStyle = (typeof CONTROL_STYLES)[number]

function readStyle(): ControlStyle {
  try {
    const stored = localStorage.getItem(CONTROL_STYLE_KEY)
    return CONTROL_STYLES.find((value) => value === stored) ?? 'brushed'
  } catch {
    return 'brushed'
  }
}

const style = ref<ControlStyle>(readStyle())
const persistFailed = ref(false)

export function getControlStyle(): ControlStyle {
  return style.value
}

function setStyle(value: ControlStyle): void {
  if (!CONTROL_STYLES.some((candidate) => candidate === value)) return
  if (style.value === value && !persistFailed.value) return

  style.value = value
  try {
    localStorage.setItem(CONTROL_STYLE_KEY, value)
    persistFailed.value = false
  } catch {
    persistFailed.value = true
  }
}

export function useControlStyle() {
  return {
    style: readonly(style),
    persistFailed: readonly(persistFailed),
    setStyle,
  }
}
