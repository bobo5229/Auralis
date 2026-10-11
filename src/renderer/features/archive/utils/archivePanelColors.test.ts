import { describe, expect, it } from 'vitest'
import { parse } from 'culori/fn'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import { archivePanelColors } from './archivePanelColors'

function channels(value: string) {
  const color = parse(value)!
  if (color.mode !== 'rgb') throw new Error('Expected sRGB')
  return { r: color.r * 255, g: color.g * 255, b: color.b * 255 }
}
describe('archive panel colors', () => {
  it('preserves fractional mixed cell channels and removes transparency', () => {
    const colors = archivePanelColors('color(srgb 0.15 0.65 0.3 / 0.5)')!
    expect(channels(colors.fill)).toEqual({ r: 38.25, g: 165.75, b: 76.5 })
    expect(parse(colors.fill)?.alpha ?? 1).toBe(1)
  })
  it.each(['#202020', '#E7E8E9', '#13D65D', '#FFD84D', '#2459FF', '#777777', '#7C7C7C'])(
    'keeps primary and secondary text readable on %s',
    (fill) => {
      const colors = archivePanelColors(fill)!
      const background = channels(colors.fill)
      expect(getContrastRatio(channels(colors.text), background)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(channels(colors.muted), background)).toBeGreaterThanOrEqual(4.5)
    },
  )
})
