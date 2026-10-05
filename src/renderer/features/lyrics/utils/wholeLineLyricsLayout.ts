import type { LyricLine } from '../types'

export interface WholeLyricMetric {
  offset: number
  height: number
}

export const WHOLE_LYRIC_SHADOW_GAP = 4
export const WHOLE_LYRIC_OPENING_GAP = 16
export const WHOLE_LYRIC_MOTION_EASING = 'cubic-bezier(0.22, 0.72, 0.18, 1)'

export function resolveWholeLyricsMotionDuration(
  lines: readonly LyricLine[],
  previousIndex: number,
  activeIndex: number,
  instant = false,
): number {
  if (instant) return 0
  if (activeIndex === previousIndex) return 360
  const nextSentence = lines.findIndex((line, index) => index > previousIndex && line.text.trim())
  return activeIndex === nextSentence ? 360 : 180
}

/** Opening includes the wait before the first sentence and ignores blank timed pauses. */
export function isWholeLyricsOpening(lines: readonly LyricLine[], activeIndex: number): boolean {
  let startedCount = 0
  for (let index = 0; index <= Math.min(activeIndex, lines.length - 1); index++) {
    if (lines[index].text.trim() && ++startedCount === 3) return false
  }
  return true
}

/** Blank timed entries are pauses, rather than additional history sentences. */
export function resolveWholeLyricsStart(lines: readonly LyricLine[], activeIndex: number): number {
  const past: number[] = []
  for (let index = Math.min(activeIndex - 1, lines.length - 1); index >= 0; index--) {
    if (!lines[index].text.trim()) continue
    past.unshift(index)
    if (past.length === 2) return index
  }
  if (past.length) return past[0]
  return lines.findIndex((line, index) => index >= Math.max(0, activeIndex) && line.text.trim())
}

export function resolveWholeLyricsWindow(
  metrics: readonly WholeLyricMetric[],
  startIndex: number,
  activeIndex: number,
  anchorTop: number,
  viewportHeight: number,
  firstInkOffset: number,
  openingFocalCenter?: number,
) {
  const first = metrics[startIndex]
  if (!first) return { offset: 0, endIndex: -1, requiredHeight: 0, anchorTop }
  const lastRequired = metrics[Math.max(startIndex, Math.min(activeIndex, metrics.length - 1))]
  // Opening uses the same focal center before and after singing starts. The viewport fits
  // oversized opening lines by reducing their size rather than moving them to the cover edge.
  const offset =
    openingFocalCenter === undefined
      ? anchorTop - first.offset - firstInkOffset
      : openingFocalCenter - lastRequired.offset - lastRequired.height / 2
  const actualAnchorTop = first.offset + firstInkOffset + offset
  const requiredHeight = lastRequired.offset + lastRequired.height - first.offset - firstInkOffset
  let endIndex = startIndex - 1
  for (let index = startIndex; index < metrics.length; index++) {
    const bottom = metrics[index].offset + metrics[index].height + offset + WHOLE_LYRIC_SHADOW_GAP
    if (bottom > viewportHeight) break
    endIndex = index
  }
  return { offset, endIndex, requiredHeight, anchorTop: actualAnchorTop }
}
