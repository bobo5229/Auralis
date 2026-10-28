import { describe, expect, it, vi } from 'vitest'
import type { EnglishFontChoice } from './useEnglishFont'
import {
  DEFAULT_ENGLISH_FONT,
  ENGLISH_FONT_CSS_VARIABLE,
  ENGLISH_FONT_STORAGE_KEY,
} from './useEnglishFont'

async function load(
  stored: string | null,
  setItem: (key: string, value: string) => void = vi.fn(),
) {
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: () => stored,
    setItem,
  })
  const setProperty = vi.fn()
  vi.stubGlobal('document', { documentElement: { style: { setProperty } } })
  return { mod: await import('./useEnglishFont'), setItem, setProperty }
}

describe('english font preference', () => {
  it('falls back to the bundled default when nothing valid is stored', async () => {
    const absent = await load(null)
    expect(absent.mod.DEFAULT_ENGLISH_FONT).toBe('plusJakartaSans')
    expect(absent.mod.useEnglishFont().font.value).toBe(DEFAULT_ENGLISH_FONT)
    absent.mod.initEnglishFont()
    expect(absent.setProperty).not.toHaveBeenCalled()

    const invalid = await load('roboto')
    expect(invalid.mod.useEnglishFont().font.value).toBe(DEFAULT_ENGLISH_FONT)
    invalid.mod.initEnglishFont()
    expect(invalid.setProperty).not.toHaveBeenCalled()
  })

  it('applies the stored family on init without writing storage', async () => {
    const setItem = vi.fn()
    const { mod, setProperty } = await load('inter', setItem)
    mod.initEnglishFont()
    expect(mod.useEnglishFont().font.value).toBe('inter')
    expect(setProperty).toHaveBeenCalledWith(ENGLISH_FONT_CSS_VARIABLE, "'Inter'")
    expect(setItem).not.toHaveBeenCalled()
  })

  it('persists and applies a listed choice and ignores anything else', async () => {
    const { mod, setItem, setProperty } = await load(null)
    const { setEnglishFont, font } = mod.useEnglishFont()
    setEnglishFont('inter')
    expect(font.value).toBe('inter')
    expect(setProperty).toHaveBeenLastCalledWith(ENGLISH_FONT_CSS_VARIABLE, "'Inter'")
    expect(setItem).toHaveBeenCalledWith(ENGLISH_FONT_STORAGE_KEY, 'inter')

    setProperty.mockClear()
    setEnglishFont('roboto' as EnglishFontChoice)
    expect(font.value).toBe('inter')
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setProperty).not.toHaveBeenCalled()
  })

  it('skips redundant saves for the current choice', async () => {
    const { mod, setItem } = await load(null)
    const { setEnglishFont } = mod.useEnglishFont()
    setEnglishFont('inter')
    setEnglishFont('inter')
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps the applied font when saving fails', async () => {
    const { mod, setProperty } = await load(null, () => {
      throw new Error('storage unavailable')
    })
    const { setEnglishFont, font, persistFailed } = mod.useEnglishFont()
    setEnglishFont('inter')
    expect(font.value).toBe('inter')
    expect(persistFailed.value).toBe(true)
    expect(setProperty).toHaveBeenCalledWith(ENGLISH_FONT_CSS_VARIABLE, "'Inter'")
  })
})
