import type { LyricLine } from '../types'

export function getActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1

  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].timeSeconds) {
      return i
    }
  }

  return -1
}
