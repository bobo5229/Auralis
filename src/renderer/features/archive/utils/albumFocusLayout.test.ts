import { describe, expect, it } from 'vitest'
import { ALBUM_CASE_OPEN_ANGLE, albumFocusLayout, albumFocusProjection } from './albumFocusLayout'

const source = { left: 500, top: 380, width: 64, height: 258 }

describe('album focus layout', () => {
  it('centers the cover within the content area, above the player safe area', () => {
    const result = albumFocusLayout(source, 220, { left: 260, top: 0, width: 920, height: 760 }, 88)
    expect(source.left + source.width / 2 + result.x).toBe(720)
    expect(source.top + 110 + result.y).toBe(336)
    expect(result.scale).toBe(2)
  })

  it('fits a narrow content area when lyrics are visible', () => {
    const result = albumFocusLayout(source, 220, { left: 260, top: 0, width: 330, height: 620 }, 88)
    expect(result.scale * 220).toBe(266)
    expect(source.left + 32 + result.x).toBe(425)
    expect(source.top + 110 + result.y).toBe(266)
  })

  it('limits size by available height in a short window', () => {
    const result = albumFocusLayout(
      source,
      220,
      { left: 260, top: 40, width: 900, height: 480 },
      88,
    )
    expect(result.scale * 220).toBe(328)
    expect(source.top + 110 + result.y).toBe(236)
  })

  it('centers the projected case including its depth, rather than the front plane alone', () => {
    const projection = albumFocusProjection(220, source.height)
    const result = albumFocusLayout(
      source,
      220,
      { left: 260, top: 0, width: 920, height: 760 },
      88,
      projection,
    )
    expect(
      source.left + source.width / 2 + result.x + projection.offsetX * result.scale,
    ).toBeCloseTo(720)
    expect(source.top + 110 + result.y + projection.offsetY * result.scale).toBeCloseTo(336)
    expect(Math.max(projection.width, projection.height) * result.scale).toBeCloseTo(440)
  })

  it('keeps the complete tilted case inside a narrow content region', () => {
    const projection = albumFocusProjection(220, source.height)
    const result = albumFocusLayout(
      source,
      220,
      { left: 260, top: 0, width: 330, height: 620 },
      88,
      projection,
    )
    const centerX = source.left + source.width / 2 + result.x + projection.offsetX * result.scale
    const width = projection.width * result.scale
    expect(centerX - width / 2).toBeGreaterThanOrEqual(292)
    expect(centerX + width / 2).toBeLessThanOrEqual(558)
    expect(projection.height * result.scale).toBeLessThanOrEqual(266)
  })

  it('projects a lid opening to the left of the stationary tray', () => {
    const closed = albumFocusProjection(220, source.height)
    const open = albumFocusProjection(220, source.height, ALBUM_CASE_OPEN_ANGLE)
    expect(open.width).toBeGreaterThan(closed.width)
    expect(open.offsetX).toBeLessThan(closed.offsetX)
  })

  it.each([330, 660, 920])(
    'keeps the tray centered and the moving lid inside %ipx of content',
    (width) => {
      const base = albumFocusProjection(220, source.height)
      const content = { left: 260, top: 0, width, height: 620 }
      for (const angle of [0, -20, -40, -60, -80, -100, -120, -140, ALBUM_CASE_OPEN_ANGLE]) {
        const envelope = albumFocusProjection(220, source.height, angle)
        const layout = albumFocusLayout(source, 220, content, 88, base, envelope)
        const originX = source.left + source.width / 2 + layout.x
        const originY = source.top + 110 + layout.y
        expect(originX + base.offsetX * layout.scale).toBeCloseTo(260 + width / 2)
        expect(originY + base.offsetY * layout.scale).toBeCloseTo(266)
        expect(
          originX + (envelope.offsetX - envelope.width / 2) * layout.scale,
        ).toBeGreaterThanOrEqual(292 - 0.000001)
        expect(
          originX + (envelope.offsetX + envelope.width / 2) * layout.scale,
        ).toBeLessThanOrEqual(260 + width - 32 + 0.000001)
        expect(
          originY + (envelope.offsetY - envelope.height / 2) * layout.scale,
        ).toBeGreaterThanOrEqual(32 - 0.000001)
        expect(
          originY + (envelope.offsetY + envelope.height / 2) * layout.scale,
        ).toBeLessThanOrEqual(500 + 0.000001)
      }
    },
  )
})
