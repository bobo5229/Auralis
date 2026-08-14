import { ref } from 'vue'

/** 独立于 light/dark 主题与 PlayerBar 材质的页面视觉风格。 */
export type VisualStyle = 'modern' | 'manuscript'

const VISUAL_STYLE_STORAGE_KEY = 'auralis-visual-style'
const DEFAULT_VISUAL_STYLE: VisualStyle = 'modern'

function isVisualStyle(value: string | null): value is VisualStyle {
  return value === 'modern' || value === 'manuscript'
}

function readStoredVisualStyle(): VisualStyle {
  try {
    const stored = localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)
    return isVisualStyle(stored) ? stored : DEFAULT_VISUAL_STYLE
  } catch {
    return DEFAULT_VISUAL_STYLE
  }
}

const visualStyle = ref<VisualStyle>(readStoredVisualStyle())

function setVisualStyle(next: VisualStyle): void {
  visualStyle.value = next
  try {
    localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, next)
  } catch {
    // localStorage 不可用时仅保留当前 Renderer 会话内的状态。
  }
}

export function useVisualStyle() {
  return {
    visualStyle,
    setVisualStyle,
  }
}
