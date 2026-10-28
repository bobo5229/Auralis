import { readonly, ref } from 'vue'

export const CHINESE_FONT_STORAGE_KEY = 'auralis-chinese-font'
/** 覆盖 typography.css 的根级中文字体变量；引导脚本 theme-boot.js 在首帧前写同一变量。 */
export const CHINESE_FONT_CSS_VARIABLE = '--auralis-font-cjk'
export const CHINESE_FONTS = ['harmonyOsSans', 'misans'] as const
export type ChineseFontChoice = (typeof CHINESE_FONTS)[number]
export const DEFAULT_CHINESE_FONT: ChineseFontChoice = 'harmonyOsSans'

/** 与 @font-face 家族名一一对应；新增字体须同时登记字体文件与家族名。 */
export const CHINESE_FONT_FAMILIES: Record<ChineseFontChoice, string> = {
  harmonyOsSans: 'HarmonyOS Sans SC',
  misans: 'MiSans',
}

export function isChineseFontChoice(value: unknown): value is ChineseFontChoice {
  return CHINESE_FONTS.some((candidate) => candidate === value)
}

function readStoredChineseFont(): ChineseFontChoice | null {
  try {
    const stored = localStorage.getItem(CHINESE_FONT_STORAGE_KEY)
    return isChineseFontChoice(stored) ? stored : null
  } catch {
    return null
  }
}

function readChineseFont(): ChineseFontChoice {
  return readStoredChineseFont() ?? DEFAULT_CHINESE_FONT
}

function applyChineseFont(choice: ChineseFontChoice): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  document.documentElement.style.setProperty(
    CHINESE_FONT_CSS_VARIABLE,
    `'${CHINESE_FONT_FAMILIES[choice]}'`,
  )
}

const font = ref<ChineseFontChoice>(readChineseFont())
const persistFailed = ref(false)

export function useChineseFont() {
  return {
    font: readonly(font),
    persistFailed: readonly(persistFailed),
    setChineseFont(value: ChineseFontChoice): void {
      if (!isChineseFontChoice(value)) return
      if (font.value === value && !persistFailed.value) return
      font.value = value
      applyChineseFont(value)
      try {
        localStorage.setItem(CHINESE_FONT_STORAGE_KEY, value)
        persistFailed.value = false
      } catch {
        persistFailed.value = true
      }
    },
  }
}

/** 启动时应用已保存的选择；无有效存储时保留样式表默认，不内联固定当前默认值。 */
export function initChineseFont(): void {
  const stored = readStoredChineseFont()
  if (!stored) return
  font.value = stored
  applyChineseFont(stored)
}
