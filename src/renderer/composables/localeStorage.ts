/**
 * Locale 存储层：无 i18n / Vue 运行时依赖。
 * i18n/index.ts 与 useLocale.ts 都依赖本模块，避免两者互相引用（循环依赖）。
 */

export type AppLocale = 'zh-Hans' | 'zh-Hant' | 'en'

export const LOCALE_STORAGE_KEY = 'auralis-locale'
export const DEFAULT_LOCALE: AppLocale = 'zh-Hans'

const LOCALE_VALUES: readonly AppLocale[] = ['zh-Hans', 'zh-Hant', 'en']

export function isAppLocale(value: string | null): value is AppLocale {
  return value !== null && (LOCALE_VALUES as readonly string[]).includes(value)
}

/** 读取存储的 locale；非法值回退默认并清理。 */
export function readStoredLocale(): AppLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isAppLocale(stored)) return stored
  if (stored !== null) {
    localStorage.removeItem(LOCALE_STORAGE_KEY)
  }
  return DEFAULT_LOCALE
}
