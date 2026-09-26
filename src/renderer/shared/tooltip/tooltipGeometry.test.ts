import { describe, expect, it } from 'vitest'
import { isTooltipTextClipped, placeTooltip } from './tooltipGeometry'

describe('tooltip geometry', () => {
  it('only enables overflow hints for clipped, measurable text, including line clamps', () => {
    const box = { clientWidth: 100, clientHeight: 20, scrollWidth: 100, scrollHeight: 20 }
    expect(isTooltipTextClipped(box)).toBe(false)
    expect(isTooltipTextClipped({ ...box, scrollWidth: 160 })).toBe(true)
    expect(isTooltipTextClipped({ ...box, scrollHeight: 40 })).toBe(true)
    expect(isTooltipTextClipped({ ...box, clientWidth: 0, clientHeight: 0 })).toBe(false)
  })

  it('flips below top-edge anchors and stays inside small mini-player windows', () => {
    const viewport = { width: 320, height: 240 }
    const size = { width: 180, height: 32 }
    expect(placeTooltip({ left: 0, right: 20, top: 0, bottom: 20 }, size, viewport)).toEqual({
      left: 8,
      top: 28,
    })
    expect(placeTooltip({ left: 300, right: 320, top: 210, bottom: 240 }, size, viewport)).toEqual({
      left: 132,
      top: 170,
    })
  })

  it('clamps tall wrapped content when neither preferred side has enough space', () => {
    expect(
      placeTooltip(
        { left: 100, right: 140, top: 70, bottom: 90 },
        { width: 180, height: 184 },
        { width: 240, height: 200 },
      ),
    ).toEqual({ left: 30, top: 8 })
  })
})
