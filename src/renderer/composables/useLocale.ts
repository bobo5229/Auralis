import { computed, ref } from 'vue'
import { i18n } from '../i18n'
import { LOCALE_STORAGE_KEY, readStoredLocale, type AppLocale } from './localeStorage'

export type { AppLocale } from './localeStorage'

/** 语言选项展示名固定，不随当前 locale 改写（TECHDOC §3.1）。 */
const LOCALE_OPTIONS: readonly { value: AppLocale; label: string }[] = [
  { value: 'zh-Hans', label: '简体' },
  { value: 'zh-Hant', label: '繁體' },
  { value: 'en', label: 'English' },
]

/** 写入 localStorage 并热切换 i18n；同步 document.documentElement.lang 利于无障碍。 */
export function setAppLocale(locale: AppLocale): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

/**
 * 冷启动同步：读存储 locale → 设 i18n 与 <html lang>（不重复写 storage）。
 * 仅主应用入口调用；桌面歌词入口不接入 i18n（TECHDOC Q18）。
 */
export function initLocale(): AppLocale {
  const locale = readStoredLocale()
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  return locale
}

const currentLocale = ref<AppLocale>(readStoredLocale())

export function useLocale() {
  function setLocale(locale: AppLocale): void {
    currentLocale.value = locale
    setAppLocale(locale)
  }

  return {
    locale: currentLocale,
    setLocale,
    localeOptions: computed(() => LOCALE_OPTIONS),
  }
}
