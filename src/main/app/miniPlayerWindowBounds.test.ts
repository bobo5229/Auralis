import { describe, expect, it } from 'vitest'
import {
  isScreenOccupying,
  miniPlayerBoundsApplied,
  resolveMiniPlayerSourceBounds,
  windowOccupiesDisplay,
} from './miniPlayerWindowBounds'

const bounds = { x: 10, y: 20, width: 1180, height: 760 }
const normalBounds = { x: 100, y: 80, width: 900, height: 620 }

describe('resolveMiniPlayerSourceBounds', () => {
  it('uses current bounds when the window is neither fullscreen nor maximized', () => {
    expect(resolveMiniPlayerSourceBounds(false, false, bounds, normalBounds)).toEqual(bounds)
  })

  it('uses normal bounds when maximized', () => {
    expect(resolveMiniPlayerSourceBounds(false, true, bounds, normalBounds)).toEqual(normalBounds)
  })

  it('uses normal bounds when fullscreen', () => {
    expect(resolveMiniPlayerSourceBounds(true, false, bounds, normalBounds)).toEqual(normalBounds)
  })

  it('uses normal bounds when both fullscreen and maximized', () => {
    expect(resolveMiniPlayerSourceBounds(true, true, bounds, normalBounds)).toEqual(normalBounds)
  })
})

describe('windowOccupiesDisplay', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 }

  it('is true when the window covers the display', () => {
    expect(windowOccupiesDisplay({ x: 0, y: 0, width: 1920, height: 1080 }, display)).toBe(true)
  })

  it('is false for a restored or mini window', () => {
    expect(windowOccupiesDisplay(bounds, display)).toBe(false)
    expect(windowOccupiesDisplay({ x: 40, y: 40, width: 304, height: 512 }, display)).toBe(false)
  })
})

describe('isScreenOccupying', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 }

  it('is true when isFullScreen is true even if bounds are not the display', () => {
    expect(isScreenOccupying(true, bounds, display)).toBe(true)
  })

  it('is true when the window occupies the display even if isFullScreen is false', () => {
    expect(isScreenOccupying(false, { x: 0, y: 0, width: 1920, height: 1080 }, display)).toBe(true)
  })

  it('is false for a restored or mini window that is not fullscreen', () => {
    expect(isScreenOccupying(false, bounds, display)).toBe(false)
    expect(isScreenOccupying(false, { x: 40, y: 40, width: 304, height: 512 }, display)).toBe(false)
  })
})

describe('miniPlayerBoundsApplied', () => {
  it('accepts a 4px size mismatch', () => {
    expect(miniPlayerBoundsApplied({ width: 304, height: 512 }, { width: 304, height: 512 })).toBe(
      true,
    )
    expect(miniPlayerBoundsApplied({ width: 306, height: 510 }, { width: 304, height: 512 })).toBe(
      true,
    )
  })

  it('rejects a still-fullscreen size', () => {
    expect(
      miniPlayerBoundsApplied({ width: 1920, height: 1080 }, { width: 304, height: 512 }),
    ).toBe(false)
  })
})
