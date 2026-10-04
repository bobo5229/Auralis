import { describe, expect, it } from 'vitest'
import {
  cdLyricsArcPlacement,
  cdLyricsOccupiedArcBounds,
  cdLyricsPlacement,
  type LyricsRect,
} from './cdLyricsPlacement'

describe('CD lyric occupied arc bounds', () => {
  const points = Array.from({ length: 97 }, (_, index) => {
    const angle = ((-60 + (index / 96) * 120) * Math.PI) / 180
    return { x: 500 + Math.sin(angle) * 300, y: 400 - Math.cos(angle) * 300, scale: 1 }
  })
  it('keeps a short line on the disc when only unused path ends cross the side panels', () => {
    const bounds = { left: 0, top: 0, width: 1000, height: 800 }
    const panels = [
      { left: 0, top: 0, width: 300, height: 800 },
      { left: 700, top: 0, width: 300, height: 800 },
    ]
    const occupied = cdLyricsOccupiedArcBounds(points, 180, 15, 24)
    expect(cdLyricsArcPlacement(0, () => occupied, bounds, panels)).toBe(0)
    expect(
      cdLyricsArcPlacement(
        0,
        () => ({ left: 240, top: 70, width: 520, height: 230 }),
        bounds,
        panels,
      ),
    ).toBeNull()
  })
  it('continues rejecting actual text collisions for long lines', () => {
    const rect = cdLyricsOccupiedArcBounds(points, 600, 40, 24)
    expect(rect.width).toBeGreaterThan(500)
    expect(
      cdLyricsArcPlacement(0, () => rect, { left: 0, top: 0, width: 1000, height: 800 }, [
        { left: 0, top: 0, width: 300, height: 800 },
      ]),
    ).toBeNull()
  })
  it('includes perspective enlargement and bounds centered glyphs on both path directions', () => {
    const normal = cdLyricsOccupiedArcBounds(points, 180, 15, 24)
    const enlarged = cdLyricsOccupiedArcBounds(
      points.map((point) => ({ ...point, scale: 1.8 })),
      180,
      15,
      24,
    )
    expect(enlarged.width).toBeGreaterThan(normal.width)
    expect(enlarged.height).toBeGreaterThan(normal.height)
    const reversed = cdLyricsOccupiedArcBounds([...points].reverse(), 180, 15, 24)
    expect(reversed.left).toBeCloseTo(normal.left)
    expect(reversed.width).toBeCloseTo(normal.width)
  })
})

describe('CD lyric arc avoidance', () => {
  const bounds = { left: 0, top: 0, width: 800, height: 600 }
  const rectangleAt = (angle: number): LyricsRect => {
    const radians = (angle * Math.PI) / 180
    return {
      left: 350 + Math.sin(radians) * 250,
      top: 250 - Math.cos(radians) * 200,
      width: 100,
      height: 100,
    }
  }

  it('retains a safe angle across repeated updates', () => {
    expect(cdLyricsArcPlacement(90, rectangleAt, bounds, [])).toBe(90)
  })

  it('moves away from the expanded Composer information rectangle', () => {
    const information = { left: 0, top: 0, width: 300, height: 600 }
    const angle = cdLyricsArcPlacement(270, rectangleAt, bounds, [information])!
    expect(angle).not.toBeNull()
    expect(rectangleAt(angle).left).toBeGreaterThanOrEqual(300)
    expect(cdLyricsArcPlacement(angle, rectangleAt, bounds, [information])).toBe(angle)
  })

  it('rejects arcs beyond the viewport and requests fallback when all space is blocked', () => {
    expect(cdLyricsArcPlacement(0, () => ({ ...bounds, left: -1 }), bounds, [])).toBeNull()
    expect(cdLyricsArcPlacement(0, rectangleAt, bounds, [bounds])).toBeNull()
  })
})

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
