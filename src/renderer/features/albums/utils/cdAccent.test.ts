import { describe, expect, it } from 'vitest'
import { formatCdAccent } from './cdAccent'

describe('formatCdAccent', () => {
  it('uses the light fallback when no swatch is available', () => {
    expect(formatCdAccent(null, false)).toBe('#62625b')
  })

  it('uses a lifted gray fallback on the dark canvas', () => {
    expect(formatCdAccent(null, true)).toBe('#c5c8ce')
  })

  it('keeps the source RGB on the light canvas', () => {
    expect(formatCdAccent({ r: 40, g: 80, b: 120 }, false)).toBe('rgb(40 80 120)')
  })

  it('raises a dark swatch on the dark canvas without flipping hue', () => {
    const lifted = formatCdAccent({ r: 28, g: 46, b: 88 }, true)
    const match = lifted.match(/^rgb\((\d+) (\d+) (\d+)\)$/)
    expect(match).not.toBeNull()
    const r = Number(match![1])
    const g = Number(match![2])
    const b = Number(match![3])
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
    expect((r + g + b) / 3).toBeGreaterThan(80)
  })
})
