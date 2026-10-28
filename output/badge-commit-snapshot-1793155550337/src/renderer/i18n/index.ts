import { createI18n } from 'vue-i18n'
import { ref } from 'vue'
import type { UiLocale } from '@shared/uiLocale'
import { UI_LOCALE_STORAGE_KEY } from '@shared/uiLocale'
import { initialUiLocale } from './preference'
import zhHans from '../locales/zh-Hans.json'
import en from '../locales/en.json'

/**
 * Renderer UI locale instance (Composition API, legacy: false).
 */
export const i18n = createI18n({
  legacy: false,
  locale: initialUiLocale(),
  fallbackLocale: 'zh-Hans',
  messages: {
    'zh-Hans': zhHans,
    en,
  },
})

const persistFailed = ref(false)
const nativeSyncFailed = ref(false)
let syncRevision = 0
let syncNativeLocale: ((locale: UiLocale) => Promise<void>) | undefined

function syncLocale(locale: UiLocale): void {
  const revision = ++syncRevision
  nativeSyncFailed.value = false
  void syncNativeLocale?.(locale).catch(() => {
    if (revision === syncRevision) nativeSyncFailed.value = true
  })
}

export function initUiLocale(sync: (locale: UiLocale) => Promise<void>): void {
  syncNativeLocale = sync
  document.documentElement.lang = i18n.global.locale.value
  syncLocale(i18n.global.locale.value)
}

export function useUiLocale() {
  function setUiLocale(locale: UiLocale): void {
    i18n.global.locale.value = locale
    document.documentElement.lang = locale
    persistFailed.value = false
    try {
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale)
    } catch {
      persistFailed.value = true
    }
    syncLocale(locale)
  }
  return { locale: i18n.global.locale, persistFailed, nativeSyncFailed, setUiLocale }
}

export function uiText(key: string, values: Record<string, unknown> = {}, plural?: number): string {
  return i18n.global.t(key, values, { plural })
}
