import { readonly, ref } from 'vue'

export const ENGLISH_FONT_STORAGE_KEY = 'auralis-english-font'
/** 覆盖 typography.css 的根级英文字体变量；引导脚本 theme-boot.js 在首帧前写同一变量。 */
export const ENGLISH_FONT_CSS_VARIABLE = '--auralis-font-latin'
export const ENGLISH_FONTS = ['plusJakartaSans', 'inter', 'publicSans', 'geist', 'rubik'] as const
export type EnglishFontChoice = (typeof ENGLISH_FONTS)[number]
export const DEFAULT_ENGLISH_FONT: EnglishFontChoice = 'plusJakartaSans'

/** 与 main.css 的 @font-face 家族名一一对应；新增字体须同时登记字体文件与家族名。 */
export const ENGLISH_FONT_FAMILIES: Record<EnglishFontChoice, string> = {
  plusJakartaSans: 'Plus Jakarta Sans',
  inter: 'Inter',
  publicSans: 'Public Sans',
  geist: 'Geist',
  rubik: 'Rubik',
}

export function isEnglishFontChoice(value: unknown): value is EnglishFontChoice {
  return ENGLISH_FONTS.some((candidate) => candidate === value)
}

function readStoredEnglishFont(): EnglishFontChoice | null {
  try {
    const stored = localStorage.getItem(ENGLISH_FONT_STORAGE_KEY)
    return isEnglishFontChoice(stored) ? stored : null
  } catch {
    return null
  }
}

function readEnglishFont(): EnglishFontChoice {
  return readStoredEnglishFont() ?? DEFAULT_ENGLISH_FONT
}

function applyEnglishFont(choice: EnglishFontChoice): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  document.documentElement.style.setProperty(
    ENGLISH_FONT_CSS_VARIABLE,
    `'${ENGLISH_FONT_FAMILIES[choice]}'`,
  )
}

const font = ref<EnglishFontChoice>(readEnglishFont())
const persistFailed = ref(false)

export function useEnglishFont() {
  return {
    font: readonly(font),
    persistFailed: readonly(persistFailed),
    setEnglishFont(value: EnglishFontChoice): void {
      if (!isEnglishFontChoice(value)) return
      if (font.value === value && !persistFailed.value) return
      font.value = value
      applyEnglishFont(value)
      try {
        localStorage.setItem(ENGLISH_FONT_STORAGE_KEY, value)
        persistFailed.value = false
      } catch {
        persistFailed.value = true
      }
    },
  }
}

/** 启动时应用已保存的选择；无有效存储时保留样式表默认，不内联固定当前默认值。 */
export function initEnglishFont(): void {
  const stored = readStoredEnglishFont()
  if (!stored) return
  font.value = stored
  applyEnglishFont(stored)
}
