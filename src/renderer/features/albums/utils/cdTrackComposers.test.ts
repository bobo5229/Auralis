import { describe, expect, it } from 'vitest'
import { presentCdTrackComposers } from './cdTrackComposers'

describe('presentCdTrackComposers', () => {
  it('keeps a single composer', () => {
    expect(presentCdTrackComposers('Bach')).toEqual(['Bach'])
  })

  it('splits A; B; C without using raw separators', () => {
    expect(presentCdTrackComposers('A; B; C')).toEqual(['A', 'B', 'C'])
  })

  it.each(['A;B', 'A；B', 'A;\tB', 'AC/DC'])('keeps %s as one composer', (value) => {
    expect(presentCdTrackComposers(value)).toEqual([value])
  })

  it('keeps commas inside a composer name', () => {
    expect(presentCdTrackComposers('Bach, Johann Sebastian; Mozart')).toEqual([
      'Bach, Johann Sebastian',
      'Mozart',
    ])
  })

  it('shows every composer when the tag has more than four names', () => {
    expect(presentCdTrackComposers('A; B; C; D; E; F')).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('returns null when the tag is missing or blank', () => {
    expect(presentCdTrackComposers(null)).toBeNull()
    expect(presentCdTrackComposers('')).toBeNull()
    expect(presentCdTrackComposers('   ;  ')).toBeNull()
  })
})
