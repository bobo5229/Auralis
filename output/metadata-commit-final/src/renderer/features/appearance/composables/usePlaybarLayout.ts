import { readonly, ref } from 'vue'

export const PLAYBAR_LAYOUT_KEY = 'auralis-playbar-layout'
export const PLAYBAR_LAYOUTS = ['island', 'full'] as const
export type PlaybarLayout = (typeof PLAYBAR_LAYOUTS)[number]

function readLayout(): PlaybarLayout {
  try {
    const stored = localStorage.getItem(PLAYBAR_LAYOUT_KEY)
    return PLAYBAR_LAYOUTS.find((value) => value === stored) ?? 'island'
  } catch {
    return 'island'
  }
}

const layout = ref<PlaybarLayout>(readLayout())
const persistFailed = ref(false)

function setLayout(value: PlaybarLayout): void {
  if (!PLAYBAR_LAYOUTS.some((candidate) => candidate === value)) return
  if (layout.value === value && !persistFailed.value) return

  layout.value = value
  try {
    localStorage.setItem(PLAYBAR_LAYOUT_KEY, value)
    persistFailed.value = false
  } catch {
    persistFailed.value = true
  }
}

export function usePlaybarLayout() {
  return {
    layout: readonly(layout),
    persistFailed: readonly(persistFailed),
    setLayout,
  }
}
