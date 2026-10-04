import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n, initUiLocale, useUiLocale } from './index'
import { readUiLocale } from './preference'
import { UI_LOCALE_STORAGE_KEY } from '@shared/uiLocale'
import type { UiLocale } from '@shared/uiLocale'

afterEach(() => {
  i18n.global.locale.value = 'zh-Hans'
  vi.unstubAllGlobals()
})

function storage() {
  const values = new Map<string, string>()
  const memory = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  vi.stubGlobal('localStorage', memory)
  vi.stubGlobal('document', { documentElement: { lang: 'zh-Hans' } })
  return memory
}

describe('UI locale preference and live state', () => {
  it('defaults invalid, retired and unavailable preferences to Simplified Chinese', () => {
    for (const value of [null, '', 'zh-Hant', 'fr', 'EN', '{"locale":"en"}']) {
      expect(readUiLocale({ getItem: () => value })).toBe('zh-Hans')
    }
    expect(readUiLocale(undefined)).toBe('zh-Hans')
    expect(
      readUiLocale({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('zh-Hans')
    expect(readUiLocale({ getItem: () => 'en' })).toBe('en')
  })
  it('changes both directions immediately, synchronizes native controls and saves a restart-readable preference', async () => {
    const memory = storage()
    const sync = vi.fn<(locale: UiLocale) => Promise<void>>(async () => undefined)
    initUiLocale(sync)
    const state = useUiLocale()
    state.setUiLocale('en')
    expect(i18n.global.t('settings.title')).toBe('Settings')
    expect(document.documentElement.lang).toBe('en')
    expect(memory.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en')
    expect(readUiLocale(memory)).toBe('en')
    state.setUiLocale('zh-Hans')
    expect(i18n.global.t('settings.title')).toBe('设置')
    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(sync.mock.calls.map(([value]) => value)).toEqual(['zh-Hans', 'en', 'zh-Hans'])
    await Promise.resolve()
    expect(state.persistFailed.value).toBe(false)
  })
  it('retains the requested UI language on storage failure and allows a later save retry', () => {
    const memory = storage()
    initUiLocale(async () => undefined)
    const state = useUiLocale()
    vi.spyOn(memory, 'setItem').mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    state.setUiLocale('en')
    expect(state.locale.value).toBe('en')
    expect(state.persistFailed.value).toBe(true)
    state.setUiLocale('en')
    expect(state.persistFailed.value).toBe(false)
    expect(readUiLocale(memory)).toBe('en')
  })
  it('reports native synchronization separately and ignores stale failed requests after another switch', async () => {
    storage()
    let rejectOld!: (error: Error) => void
    const sync = vi.fn<(locale: UiLocale) => Promise<void>>(async () => undefined)
    initUiLocale(sync)
    sync.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject
        }),
    )
    const state = useUiLocale()
    state.setUiLocale('en')
    state.setUiLocale('zh-Hans')
    rejectOld(new Error('old request failed'))
    await Promise.resolve()
    expect(state.nativeSyncFailed.value).toBe(false)
    sync.mockRejectedValueOnce(new Error('native unavailable'))
    state.setUiLocale('en')
    await Promise.resolve()
    expect(state.nativeSyncFailed.value).toBe(true)
    expect(state.persistFailed.value).toBe(false)
    expect(state.locale.value).toBe('en')
  })
  it('selects English singular and plural messages using the numeric count', () => {
    i18n.global.locale.value = 'en'
    expect(i18n.global.t('facets.trackCount', { count: 1 })).toBe('1 track')
    expect(i18n.global.t('facets.trackCount', { count: 2 })).toBe('2 tracks')
  })
})
