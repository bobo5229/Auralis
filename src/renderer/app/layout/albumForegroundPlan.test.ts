import { describe, expect, it } from 'vitest'
import { parseSurfaceColor, planAlbumForeground } from './albumForegroundPlan'

describe('album foreground transition plan', () => {
  it('keeps the preferred gray-white while it is readable, then reaches dark text on a light surface', () => {
    const from = { r: 26, g: 26, b: 26, a: 1 }
    const to = { r: 190, g: 238, b: 179, a: 1 }
    const steps = planAlbumForeground(from, to, from, {
      active: { target: { r: 32, g: 32, b: 32 }, preferred: { r: 216, g: 216, b: 216 } },
    })
    expect(steps[0].colors.active).toBe('rgb(216 216 216)')
    expect(steps.at(-1)?.colors.active).toBe('rgb(32 32 32)')
    expect(steps.length).toBeGreaterThan(2)
    expect(steps.every((step, index) => index === 0 || step.offset > steps[index - 1].offset)).toBe(
      true,
    )
  })
  it('parses the CSS color formats used by the browser transition', () => {
    expect(parseSurfaceColor('#1a1a1a')).toEqual({ r: 26, g: 26, b: 26, a: 1 })
    expect(parseSurfaceColor('rgba(24, 24, 24, 0.4)')).toEqual({ r: 24, g: 24, b: 24, a: 0.4 })
    expect(parseSurfaceColor('rgb(190 238 179)')).toEqual({ r: 190, g: 238, b: 179, a: 1 })
    expect(parseSurfaceColor('invalid')).toBeNull()
  })
})
