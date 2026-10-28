import { describe, expect, it } from 'vitest'
import { isTooltipTextClipped } from './tooltipGeometry'

describe('tooltip geometry', () => {
  it('only enables overflow hints for clipped, measurable text, including line clamps', () => {
    const box = { clientWidth: 100, clientHeight: 20, scrollWidth: 100, scrollHeight: 20 }
    expect(isTooltipTextClipped(box)).toBe(false)
    expect(isTooltipTextClipped({ ...box, scrollWidth: 160 })).toBe(true)
    expect(isTooltipTextClipped({ ...box, scrollHeight: 40 })).toBe(true)
    expect(isTooltipTextClipped({ ...box, clientWidth: 0, clientHeight: 0 })).toBe(false)
  })
})
