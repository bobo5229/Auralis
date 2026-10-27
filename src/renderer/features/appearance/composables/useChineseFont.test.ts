import { describe, expect, it, vi } from 'vitest'
import type { ChineseFontChoice } from './useChineseFont'
import {
  DEFAULT_CHINESE_FONT,
  CHINESE_FONT_CSS_VARIABLE,
  CHINESE_FONT_STORAGE_KEY,
} from './useChineseFont'

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
  return { mod: await import('./useChineseFont'), setItem, setProperty }
}

describe('chinese font preference', () => {
  it('falls back to the bundled default when nothing valid is stored', async () => {
    const absent = await load(null)
    expect(absent.mod.DEFAULT_CHINESE_FONT).toBe('harmonyOsSans')
    expect(absent.mod.useChineseFont().font.value).toBe(DEFAULT_CHINESE_FONT)
    absent.mod.initChineseFont()
    expect(absent.setProperty).not.toHaveBeenCalled()

    const invalid = await load('sourceHanSans')
    expect(invalid.mod.useChineseFont().font.value).toBe(DEFAULT_CHINESE_FONT)
    invalid.mod.initChineseFont()
    expect(invalid.setProperty).not.toHaveBeenCalled()
  })

  it('applies the stored family on init without writing storage', async () => {
    const setItem = vi.fn()
    const { mod, setProperty } = await load('misans', setItem)
    mod.initChineseFont()
    expect(mod.useChineseFont().font.value).toBe('misans')
    expect(setProperty).toHaveBeenCalledWith(CHINESE_FONT_CSS_VARIABLE, "'MiSans'")
    expect(setItem).not.toHaveBeenCalled()
  })

  it('persists and applies a listed choice and ignores anything else', async () => {
    const { mod, setItem, setProperty } = await load(null)
    const { setChineseFont, font } = mod.useChineseFont()
    setChineseFont('misans')
    expect(font.value).toBe('misans')
    expect(setProperty).toHaveBeenLastCalledWith(CHINESE_FONT_CSS_VARIABLE, "'MiSans'")
    expect(setItem).toHaveBeenCalledWith(CHINESE_FONT_STORAGE_KEY, 'misans')

    setProperty.mockClear()
    setChineseFont('sourceHanSans' as ChineseFontChoice)
    expect(font.value).toBe('misans')
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setProperty).not.toHaveBeenCalled()
  })

  it('skips redundant saves for the current choice', async () => {
    const { mod, setItem } = await load(null)
    const { setChineseFont } = mod.useChineseFont()
    setChineseFont('misans')
    setChineseFont('misans')
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps the applied font when saving fails', async () => {
    const { mod, setProperty } = await load(null, () => {
      throw new Error('storage unavailable')
    })
    const { setChineseFont, font, persistFailed } = mod.useChineseFont()
    setChineseFont('misans')
    expect(font.value).toBe('misans')
    expect(persistFailed.value).toBe(true)
    expect(setProperty).toHaveBeenCalledWith(CHINESE_FONT_CSS_VARIABLE, "'MiSans'")
  })
})
