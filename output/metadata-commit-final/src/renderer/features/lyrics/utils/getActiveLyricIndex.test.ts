import { describe, expect, it } from 'vitest'
import type { LyricLine } from '../types'
import { getActiveLyricIndex } from './getActiveLyricIndex'

function line(id: string, timeSeconds: number): LyricLine {
  return { id, timeSeconds, text: id }
}

describe('getActiveLyricIndex', () => {
  it('returns -1 for an empty list', () => {
    expect(getActiveLyricIndex([], 0)).toBe(-1)
  })

  it('returns -1 when current time is before the first line', () => {
    const lines = [line('a', 1), line('b', 3)]
    expect(getActiveLyricIndex(lines, 0.5)).toBe(-1)
  })

  it('returns the matching line when current time equals a timestamp', () => {
    const lines = [line('a', 1), line('b', 3), line('c', 5)]
    expect(getActiveLyricIndex(lines, 3)).toBe(1)
  })

  it('returns the previous line when current time is between two timestamps', () => {
    const lines = [line('a', 1), line('b', 3), line('c', 5)]
    expect(getActiveLyricIndex(lines, 4)).toBe(1)
  })

  it('returns the last line when current time is past the last timestamp', () => {
    const lines = [line('a', 1), line('b', 3), line('c', 5)]
    expect(getActiveLyricIndex(lines, 10)).toBe(2)
  })

  it('returns the last matching index for duplicate timestamps', () => {
    const lines = [line('a', 1), line('b', 3), line('c', 3), line('d', 5)]
    expect(getActiveLyricIndex(lines, 3)).toBe(2)
  })
})
