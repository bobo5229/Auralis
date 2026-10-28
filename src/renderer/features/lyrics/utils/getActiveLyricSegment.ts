import type { LyricLine } from '../types'

export function getActiveLyricSegment(line: LyricLine | undefined, timeSeconds: number) {
  const segments = line?.segments
  let startedIndex = -1
  if (segments && Number.isFinite(timeSeconds)) {
    let low = 0
    let high = segments.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (segments[middle].startTimeSeconds <= timeSeconds) low = middle + 1
      else high = middle
    }
    startedIndex = low - 1
  }
  const segment = segments?.[startedIndex]
  const activeIndex =
    segment && (segment.endTimeSeconds === null || timeSeconds < segment.endTimeSeconds)
      ? startedIndex
      : -1
  return { startedIndex, activeIndex }
}
