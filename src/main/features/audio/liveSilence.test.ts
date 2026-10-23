import { describe, expect, it } from 'vitest'
import { hasLiveGenre, LiveSilenceEdges } from './liveSilence'

describe('Live genre policy', () => {
  it.each([['Live'], [' Pop;  LIVE '], ['Rock', ' live ']].map((genres) => ({ genres })))(
    'matches a complete Live item: $genres',
    ({ genres }) => {
      expect(hasLiveGenre(genres)).toBe(true)
    },
  )
  it.each(
    [undefined, [], ['Pop'], ['Live Electronic'], ['Olive'], ['Pop/Live']].map((genres) => ({
      genres,
    })),
  )('keeps other genre labels unchanged: $genres', ({ genres }) => {
    expect(hasLiveGenre(genres)).toBe(false)
  })
})

describe('Live silence edge selection', () => {
  it('selects both edges and preserves an internal pause', () => {
    const scan = new LiveSilenceEdges()
    scan.push(
      'silence_start: 0\nsilence_end: 2\nsilence_start: 4\nsilence_end: 6\nsilence_start: 8',
    )
    expect(scan.finish(480000, 48000)).toEqual({ leading: 96000, trailing: 96000 })
  })
  it('keeps an internal pause when there is sound at both edges', () => {
    const scan = new LiveSilenceEdges()
    scan.push('silence_start: 3\nsilence_end: 5')
    expect(scan.finish(480000, 48000)).toEqual({ leading: 0, trailing: 0 })
  })
  it.each([false, true])('handles entirely silent EOF with a final end record=%s', (end) => {
    const scan = new LiveSilenceEdges()
    scan.push('silence_start: 0')
    if (end) scan.push('silence_end: 10')
    expect(scan.finish(480000, 48000)).toEqual({ leading: 480000, trailing: 480000 })
  })
  it('accepts FFmpeg decimal rounding at EOF', () => {
    const scan = new LiveSilenceEdges()
    scan.push('silence_start: 8\nsilence_end: 10.000045')
    expect(scan.finish(441002, 44100)).toEqual({ leading: 0, trailing: 88202 })
  })
  it('preserves a non-silent last sample following an internal pause', () => {
    const scan = new LiveSilenceEdges()
    scan.push('silence_start: 3\nsilence_end: 5')
    expect(scan.finish(5 * 48000 + 1, 48000)).toEqual({ leading: 0, trailing: 0 })
  })
})
