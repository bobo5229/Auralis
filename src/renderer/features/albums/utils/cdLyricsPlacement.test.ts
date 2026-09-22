import { describe, expect, it } from 'vitest'
import { cdLyricsPlacement, type LyricsRect } from './cdLyricsPlacement'

describe('CD lyrics placement', () => {
  it('finds whitespace without overlapping the disc, information or tracks', () => {
    const bounds = { left: 24, top: 24, width: 1152, height: 652 }
    const obstacles = [
      { left: 300, top: 90, width: 500, height: 470 },
      { left: 24, top: 24, width: 260, height: 240 },
      { left: 880, top: 100, width: 296, height: 576 },
    ]
    const result = cdLyricsPlacement(bounds, obstacles)!
    expect(result).not.toBeNull()
    expect(result.left).toBeGreaterThanOrEqual(bounds.left)
    expect(result.top).toBeGreaterThanOrEqual(bounds.top)
    expect(result.left + result.width).toBeLessThanOrEqual(bounds.left + bounds.width)
    expect(result.top + result.height).toBeLessThanOrEqual(bounds.top + bounds.height)
    for (const rect of obstacles) {
      expect(
        result.left >= rect.left + rect.width ||
          result.left + result.width <= rect.left ||
          result.top >= rect.top + rect.height ||
          result.top + result.height <= rect.top,
      ).toBe(true)
    }
  })

  it('hides when no complete two-line block fits', () => {
    const bounds: LyricsRect = { left: 0, top: 0, width: 600, height: 300 }
    expect(cdLyricsPlacement(bounds, [bounds])).toBeNull()
    expect(cdLyricsPlacement({ ...bounds, width: 239 }, [])).toBeNull()
    expect(cdLyricsPlacement({ ...bounds, height: 111 }, [])).toBeNull()
  })
})
