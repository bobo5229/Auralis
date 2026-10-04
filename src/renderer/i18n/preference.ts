import {
  DEFAULT_UI_LOCALE,
  isUiLocale,
  UI_LOCALE_STORAGE_KEY,
  type UiLocale,
} from '@shared/uiLocale'

export function readUiLocale(storage: Pick<Storage, 'getItem'> | undefined): UiLocale {
  try {
    const value = storage?.getItem(UI_LOCALE_STORAGE_KEY)
    return isUiLocale(value) ? value : DEFAULT_UI_LOCALE
  } catch {
    return DEFAULT_UI_LOCALE
  }
}

export function initialUiLocale(): UiLocale {
  try {
    return readUiLocale(window.localStorage)
  } catch {
    return DEFAULT_UI_LOCALE
  }
}
