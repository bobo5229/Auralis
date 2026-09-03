import { describe, expect, it } from 'vitest'
import {
  clampDesktopLyricsBounds,
  parseDesktopLyricsSavedBounds,
  pickDesktopLyricsDisplay,
  resolveDefaultDesktopLyricsBounds,
  resolveDesktopLyricsRestoreBounds,
  resolveDesktopLyricsWidth,
} from './desktopLyricsBounds'

const primary = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}

const secondary = {
  id: 2,
  workArea: { x: 1920, y: 0, width: 1280, height: 720 },
}

describe('resolveDesktopLyricsWidth', () => {
  it('uses workArea width minus inset, clamped between 720 and 980', () => {
    expect(resolveDesktopLyricsWidth(1920)).toBe(980)
    expect(resolveDesktopLyricsWidth(900)).toBe(740)
  })

  it('never exceeds the workArea width', () => {
    expect(resolveDesktopLyricsWidth(500)).toBe(500)
  })
})

describe('resolveDefaultDesktopLyricsBounds', () => {
  it('centers horizontally and sits above the workArea bottom', () => {
    const bounds = resolveDefaultDesktopLyricsBounds(primary.workArea)

    expect(bounds.width).toBe(980)
    expect(bounds.height).toBe(150)
    expect(bounds.x).toBe(Math.round((1920 - 980) / 2))
    expect(bounds.y).toBe(1080 - 150 - 96)
  })

  it('stays inside a short workArea instead of going above it', () => {
    const bounds = resolveDefaultDesktopLyricsBounds({ x: 10, y: 20, width: 800, height: 180 })
    expect(bounds.y).toBeGreaterThanOrEqual(20)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(200)
  })
})

describe('clampDesktopLyricsBounds', () => {
  it('keeps an already visible rectangle', () => {
    expect(
      clampDesktopLyricsBounds({ x: 100, y: 200, width: 720, height: 150 }, primary.workArea),
    ).toEqual({ x: 100, y: 200, width: 720, height: 150 })
  })

  it('pulls overflow back into the workArea', () => {
    expect(
      clampDesktopLyricsBounds({ x: 3000, y: -40, width: 720, height: 150 }, primary.workArea),
    ).toEqual({ x: 1920 - 720, y: 0, width: 720, height: 150 })
  })
})

describe('pickDesktopLyricsDisplay', () => {
  it('prefers the saved display id when that display still exists', () => {
    const picked = pickDesktopLyricsDisplay({ x: 10, y: 10 }, [primary, secondary], 2)
    expect(picked?.id).toBe(2)
  })

  it('uses the display that contains the point when the saved id is gone', () => {
    const picked = pickDesktopLyricsDisplay({ x: 2000, y: 10 }, [primary, secondary], 99)
    expect(picked?.id).toBe(2)
  })
})

describe('resolveDesktopLyricsRestoreBounds', () => {
  it('returns the primary default when nothing was saved', () => {
    expect(
      resolveDesktopLyricsRestoreBounds({ saved: null, displays: [primary, secondary] }),
    ).toEqual(resolveDefaultDesktopLyricsBounds(primary.workArea))
  })

  it('restores the saved coordinates on the remembered display', () => {
    const bounds = resolveDesktopLyricsRestoreBounds({
      saved: { x: 2000, y: 40, displayId: 2 },
      displays: [primary, secondary],
    })

    expect(bounds.x).toBe(2000)
    expect(bounds.y).toBe(40)
    expect(bounds.width).toBe(resolveDesktopLyricsWidth(secondary.workArea.width))
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      secondary.workArea.y + secondary.workArea.height,
    )
  })

  it('falls back to the nearest remaining display when the saved display is gone', () => {
    const bounds = resolveDesktopLyricsRestoreBounds({
      saved: { x: 2100, y: 80, displayId: 2 },
      displays: [primary],
    })

    expect(bounds.x).toBeGreaterThanOrEqual(primary.workArea.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(primary.workArea.x + primary.workArea.width)
  })
})

describe('parseDesktopLyricsSavedBounds', () => {
  it('accepts finite x/y and optional displayId', () => {
    expect(parseDesktopLyricsSavedBounds({ x: 12, y: 34, displayId: 2 })).toEqual({
      x: 12,
      y: 34,
      displayId: 2,
    })
    expect(parseDesktopLyricsSavedBounds({ x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
      displayId: null,
    })
  })

  it('rejects missing or non-finite coordinates', () => {
    expect(parseDesktopLyricsSavedBounds(null)).toBeNull()
    expect(parseDesktopLyricsSavedBounds({ x: 'nope', y: 1 })).toBeNull()
    expect(parseDesktopLyricsSavedBounds({ x: Number.NaN, y: 1 })).toBeNull()
  })
})
