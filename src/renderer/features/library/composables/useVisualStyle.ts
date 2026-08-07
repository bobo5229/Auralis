import { ref } from 'vue'

/**
 * 独立于主题系统的页面视觉风格（TECHDOC：library-manuscript-skin-mvp §4.1）。
 * 只影响 Library feature 的视觉表达，不扩展现有 ThemeMode，也不触碰 auralis-theme key。
 */
export type VisualStyle = 'modern' | 'manuscript'

const VISUAL_STYLE_STORAGE_KEY = 'auralis-visual-style'

const DEFAULT_VISUAL_STYLE: VisualStyle = 'modern'

function isVisualStyle(value: string | null): value is VisualStyle {
  return value === 'modern' || value === 'manuscript'
}

/** 读取 localStorage 并校验 union；缺失、非法或读取失败时回退到 modern。 */
function readStoredVisualStyle(): VisualStyle {
  try {
    const stored = localStorage.getItem(VISUAL_STYLE_STORAGE_KEY)
    return isVisualStyle(stored) ? stored : DEFAULT_VISUAL_STYLE
  } catch {
    return DEFAULT_VISUAL_STYLE
  }
}

/** module-scope ref 作为唯一 Renderer 状态；仅 Library feature 消费。 */
const visualStyle = ref<VisualStyle>(readStoredVisualStyle())

/** setter 同时更新响应式状态与 localStorage；写入失败不能阻断切换。 */
function setVisualStyle(next: VisualStyle): void {
  visualStyle.value = next
  try {
    localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, next)
  } catch {
    // localStorage 不可用（如隐私模式）时静默降级，仅保留内存态
  }
}

export function useVisualStyle() {
  return {
    visualStyle,
    setVisualStyle,
  }
}
