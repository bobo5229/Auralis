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

  it('flips below top-edge anchors and stays inside small viewports', () => {
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

  it('places rail tooltips to the right of the anchor, vertically centered', () => {
    const viewport = { width: 1280, height: 860 }
    expect(
      placeTooltip(
        { left: 35, right: 69, top: 54, bottom: 88 },
        { width: 92, height: 33 },
        viewport,
        'right',
      ),
    ).toEqual({ left: 77, top: 54.5 })
  })

  it('falls back to above/below when the right side has no room', () => {
    const viewport = { width: 320, height: 240 }
    const aboveFallback = placeTooltip(
      { left: 280, right: 310, top: 40, bottom: 60 },
      { width: 180, height: 32 },
      viewport,
      'right',
    )
    expect(aboveFallback).toEqual({ left: 132, top: 68 })
  })
})
