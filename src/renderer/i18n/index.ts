import { createI18n } from 'vue-i18n'
import zhHans from '../locales/zh-Hans.json'

/**
 * Renderer UI locale instance (Composition API, legacy: false).
 * Desktop-lyrics entry does NOT install this (see TECHDOC §6.4 / Q18).
 */
export const i18n = createI18n({
  legacy: false,
  locale: 'zh-Hans',
  fallbackLocale: 'zh-Hans',
  messages: {
    'zh-Hans': zhHans,
  },
})
