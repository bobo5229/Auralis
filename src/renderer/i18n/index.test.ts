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

  it('only changes public locale state through the operation that synchronizes its side effects', async () => {
    const memory = storage()
    const sync = vi.fn<(locale: UiLocale) => Promise<void>>(async () => undefined)
    initUiLocale(sync)
    const state = useUiLocale()
    const other = useUiLocale()
    state.setUiLocale('zh-Hans')
    sync.mockClear()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // @ts-expect-error Consumers cannot write the shared locale.
      state.locale.value = 'en'
      // @ts-expect-error Failure state is owned by the locale operation.
      state.persistFailed.value = true
      // @ts-expect-error Failure state is owned by the locale operation.
      state.nativeSyncFailed.value = true
      expect(other.locale.value).toBe('zh-Hans')
      expect(other.persistFailed.value).toBe(false)
      expect(other.nativeSyncFailed.value).toBe(false)
      expect(document.documentElement.lang).toBe('zh-Hans')
      expect(memory.getItem(UI_LOCALE_STORAGE_KEY)).toBe('zh-Hans')
      expect(sync).not.toHaveBeenCalled()
      state.setUiLocale('en')
      await Promise.resolve()
      expect(other.locale.value).toBe('en')
      expect(document.documentElement.lang).toBe('en')
      expect(memory.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en')
      expect(sync).toHaveBeenCalledExactlyOnceWith('en')
    } finally {
      warning.mockRestore()
    }
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

it('uses singular and plural English units for a custom recent-added range', () => {
  i18n.global.locale.value = 'en'
  expect(i18n.global.t('sidebar.recentAddedRangeDayUnit', 1)).toBe('day')
  expect(i18n.global.t('sidebar.recentAddedRangeDayUnit', 30)).toBe('days')
  i18n.global.locale.value = 'zh-Hans'
  expect(i18n.global.t('sidebar.recentAddedRangeDayUnit', 1)).toBe('天')
  expect(i18n.global.t('sidebar.recentAddedRangeDayUnit', 30)).toBe('天')
})

it.each([
  ['library.recentAdded.days', 'Last 1 day', 'Last 2 days'],
  ['library.journal.moreAlbums', '1 more album', '2 more albums'],
  ['library.journal.moreRecords', '1 more entry', '2 more entries'],
  ['archive.daySummary', '1 play · 0 min', '2 plays · 0 min'],
  ['archive.summary.recordedTracks', '1 track heard', '2 tracks heard'],
  ['archive.summary.days', '1 day', '2 days'],
  ['archive.summary.trackCount', '1 track', '2 tracks'],
] as const)('selects count-sensitive English text for %s', (key, singular, plural) => {
  i18n.global.locale.value = 'en'
  expect(i18n.global.t(key, { count: 1, minutes: 0 })).toBe(singular)
  expect(i18n.global.t(key, { count: 2, minutes: 0 })).toBe(plural)
})
