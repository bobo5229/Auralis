import { createI18n } from 'vue-i18n'
import zhHans from '../locales/zh-Hans.json'
import zhHant from '../locales/zh-Hant.json'
import en from '../locales/en.json'
import { readStoredLocale } from '../composables/localeStorage'

/**
 * Renderer UI locale instance (Composition API, legacy: false).
 * Desktop-lyrics entry does NOT install this (see TECHDOC §6.4 / Q18).
 */
export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(), // 默认 zh-Hans
  fallbackLocale: 'zh-Hans',
  messages: {
    'zh-Hans': zhHans,
    'zh-Hant': zhHant,
    en,
  },
})
