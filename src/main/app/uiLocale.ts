import { DEFAULT_UI_LOCALE, nativeUiMessages, type UiLocale } from '@shared/uiLocale'

let locale: UiLocale = DEFAULT_UI_LOCALE
const listeners = new Set<() => void>()
export function getNativeUiMessages() {
  return nativeUiMessages[locale]
}
export function setNativeUiLocale(value: UiLocale): void {
  locale = value
  for (const listener of listeners) listener()
}
export function onNativeUiLocaleChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
