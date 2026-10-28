import { describe, expect, it } from 'vitest'
import {
  isWholeLyricsOpening,
  resolveWholeLyricsStart,
  resolveWholeLyricsWindow,
  resolveWholeLyricsMotionDuration,
} from './wholeLineLyricsLayout'

const lines = ['第一句', '', '第二句', '第三句', '', '第四句', '第五句'].map((text, index) => ({
  id: String(index),
  timeSeconds: index,
  text,
}))

describe('whole-line fullscreen lyrics', () => {
  it('uses 360ms for the first sentence, countdown and the next nonblank sentence', () => {
    expect(resolveWholeLyricsMotionDuration(lines, -1, 0)).toBe(360)
    expect(resolveWholeLyricsMotionDuration(lines, -1, -1)).toBe(360)
    expect(resolveWholeLyricsMotionDuration(lines, 0, 2)).toBe(360)
    expect(resolveWholeLyricsMotionDuration(lines, 2, 3)).toBe(360)
  })

  it('uses 180ms for backward and multi-sentence seeks', () => {
    expect(resolveWholeLyricsMotionDuration(lines, 3, 0)).toBe(180)
    expect(resolveWholeLyricsMotionDuration(lines, 0, 5)).toBe(180)
    expect(resolveWholeLyricsMotionDuration(lines, 2, -1)).toBe(180)
  })

  it('skips animations for calibration and reduced motion', () => {
    expect(resolveWholeLyricsMotionDuration(lines, 0, 2, true)).toBe(0)
    expect(resolveWholeLyricsMotionDuration(lines, 0, 5, true)).toBe(0)
  })
  it('starts opening layout before any sentence is active and ends at the third real sentence', () => {
    expect(isWholeLyricsOpening(lines, -1)).toBe(true)
    expect(isWholeLyricsOpening(lines, 0)).toBe(true)
    expect(isWholeLyricsOpening(lines, 1)).toBe(true)
    expect(isWholeLyricsOpening(lines, 2)).toBe(true)
    expect(isWholeLyricsOpening(lines, 3)).toBe(false)
    expect(isWholeLyricsOpening(lines, 6)).toBe(false)
    expect(isWholeLyricsOpening(lines, 0)).toBe(true)
  })

  it('keeps opening whitespace during a timed pause after the second sentence', () => {
    const paused = ['第一句', '第二句', '', '第三句'].map((text, index) => ({
      id: String(index),
      text,
      timeSeconds: index,
    }))
    expect(isWholeLyricsOpening(paused, 2)).toBe(true)
    expect(isWholeLyricsOpening(paused, 3)).toBe(false)
  })

  it('places the unstarted first sentence at the same focal center as the singing first sentence', () => {
    const metrics = [
      { offset: 90, height: 40 },
      { offset: 160, height: 40 },
    ]
    const before = resolveWholeLyricsWindow(metrics, 0, -1, 4, 500, 6, 150)
    const singing = resolveWholeLyricsWindow(metrics, 0, 0, 4, 500, 6, 150)
    expect(metrics[0].offset + before.offset + metrics[0].height / 2).toBe(150)
    expect(before.offset).toBe(singing.offset)
    expect(before.anchorTop).toBeGreaterThan(4)
  })
  it('keeps precisely two previous sentences, without counting timed pauses', () => {
    expect(resolveWholeLyricsStart(lines, 5)).toBe(2)
    expect(resolveWholeLyricsStart(lines, 6)).toBe(3)
  })

  it('uses available history at the beginning and advances on backward seeks', () => {
    expect(resolveWholeLyricsStart(lines, -1)).toBe(0)
    expect(resolveWholeLyricsStart(lines, 0)).toBe(0)
    expect(resolveWholeLyricsStart(lines, 2)).toBe(0)
    expect(resolveWholeLyricsStart(lines, 3)).toBe(0)
    expect(resolveWholeLyricsStart(lines, 1)).toBe(0)
    expect(resolveWholeLyricsStart([], 0)).toBe(-1)
  })

  it('aligns the first visible glyph to the artwork rather than the line box', () => {
    const metrics = [
      { offset: 500, height: 40 },
      { offset: 570, height: 40 },
    ]
    const layout = resolveWholeLyricsWindow(metrics, 0, 0, 24, 240, 9)
    expect(metrics[0].offset + layout.offset + 9).toBe(24)
    expect(layout.endIndex).toBe(1)
  })

  it('includes a wrapped last sentence only when its entire height and shadow fit', () => {
    const metrics = [
      { offset: 0, height: 40 },
      { offset: 70, height: 120 },
      { offset: 220, height: 40 },
    ]
    expect(resolveWholeLyricsWindow(metrics, 0, 0, 4, 198, 0).endIndex).toBe(1)
    expect(resolveWholeLyricsWindow(metrics, 0, 0, 4, 197, 0).endIndex).toBe(0)
    expect(resolveWholeLyricsWindow(metrics, 0, 0, 4, 267, 0).endIndex).toBe(1)
    expect(resolveWholeLyricsWindow(metrics, 0, 0, 4, 268, 0).endIndex).toBe(2)
  })

  it('keeps the first two current sentences at the same opening focal center', () => {
    const first = [
      { offset: 0, height: 50 },
      { offset: 80, height: 40 },
    ]
    const second = [
      { offset: 0, height: 40 },
      { offset: 70, height: 50 },
    ]
    const firstLayout = resolveWholeLyricsWindow(first, 0, 0, 4, 500, 6, 150)
    const secondLayout = resolveWholeLyricsWindow(second, 0, 1, 4, 500, 6, 150)
    expect(first[0].offset + firstLayout.offset + first[0].height / 2).toBe(150)
    expect(second[1].offset + secondLayout.offset + second[1].height / 2).toBe(150)
    expect(firstLayout.anchorTop).toBeGreaterThan(4)
    expect(secondLayout.anchorTop).toBeGreaterThan(4)
  })

  it('switches back to cover alignment at the third sentence and after backward seeks', () => {
    const metrics = [
      { offset: 0, height: 40 },
      { offset: 70, height: 40 },
      { offset: 140, height: 50 },
    ]
    const third = resolveWholeLyricsWindow(metrics, 0, 2, 4, 500, 6)
    expect(third.anchorTop).toBe(4)
    const backward = resolveWholeLyricsWindow(metrics, 0, 1, 4, 500, 6, 150)
    expect(backward.anchorTop).toBeGreaterThan(4)
  })

  it('preserves the opening focal center for oversized history so the viewport can fit its size', () => {
    const metrics = [
      { offset: 0, height: 180 },
      { offset: 210, height: 90 },
    ]
    const layout = resolveWholeLyricsWindow(metrics, 0, 1, 4, 500, 6, 150)
    expect(metrics[1].offset + layout.offset + metrics[1].height / 2).toBe(150)
    expect(layout.anchorTop).toBeLessThan(4)
    const fitted = metrics.map((metric) => ({
      offset: metric.offset / 2,
      height: metric.height / 2,
    }))
    const fittedLayout = resolveWholeLyricsWindow(fitted, 0, 1, 4, 500, 3, 150)
    expect(fittedLayout.anchorTop).toBeGreaterThan(20)
    expect(fitted[1].offset + fittedLayout.offset + fitted[1].height / 2).toBe(150)
    expect(layout.endIndex).toBe(1)
  })

  it('never skips an overflowing future sentence to display a later shorter one', () => {
    const metrics = [
      { offset: 0, height: 40 },
      { offset: 70, height: 300 },
      { offset: 400, height: 20 },
    ]
    expect(resolveWholeLyricsWindow(metrics, 0, 0, 4, 200, 0).endIndex).toBe(0)
  })

  it('reports the height needed by history and the current sentence for fitting', () => {
    const metrics = [
      { offset: 100, height: 60 },
      { offset: 190, height: 80 },
      { offset: 300, height: 120 },
    ]
    const layout = resolveWholeLyricsWindow(metrics, 0, 2, 4, 200, 8)
    expect(layout.requiredHeight).toBe(312)
  })
})
