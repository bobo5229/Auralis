import { describe, expect, it, vi } from 'vitest'

async function load(
  stored: string | null,
  setItem: (key: string, value: string) => void = vi.fn(),
) {
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: () => stored,
    setItem,
  })
  return import('./useControlStyle')
}

describe('control style preference', () => {
  it('uses brushed metal when nothing valid is stored', async () => {
    expect((await load(null)).getControlStyle()).toBe('brushed')
    expect((await load('chrome')).getControlStyle()).toBe('brushed')
  })

  it('stores a listed style and ignores anything else', async () => {
    const setItem = vi.fn()
    const { CONTROL_STYLE_KEY, getControlStyle, useControlStyle } = await load(null, setItem)
    const { setStyle, style } = useControlStyle()
    setStyle('anodized')
    expect(style.value).toBe('anodized')
    expect(getControlStyle()).toBe('anodized')
    expect(setItem).toHaveBeenCalledWith(CONTROL_STYLE_KEY, 'anodized')
    setStyle('gold' as 'anodized')
    expect(style.value).toBe('anodized')
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps the choice when saving fails', async () => {
    const { useControlStyle } = await load(null, () => {
      throw new Error('storage unavailable')
    })
    const { setStyle, style, persistFailed } = useControlStyle()
    setStyle('anodized')
    expect(style.value).toBe('anodized')
    expect(persistFailed.value).toBe(true)
  })
})
