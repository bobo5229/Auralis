import { describe, expect, it } from 'vitest'
import { CD_COMPOSER_VISIBLE_LIMIT, presentCdTrackComposers } from './cdTrackComposers'

describe('presentCdTrackComposers', () => {
  it('keeps a single composer', () => {
    expect(presentCdTrackComposers('Bach')).toEqual({
      names: ['Bach'],
      visible: ['Bach'],
      overflow: 0,
    })
  })

  it('splits A; B; C without using raw separators', () => {
    expect(presentCdTrackComposers('A; B; C')).toEqual({
      names: ['A', 'B', 'C'],
      visible: ['A', 'B', 'C'],
      overflow: 0,
    })
  })

  it('keeps commas inside a composer name', () => {
    expect(presentCdTrackComposers('Bach, Johann Sebastian; Mozart')).toEqual({
      names: ['Bach, Johann Sebastian', 'Mozart'],
      visible: ['Bach, Johann Sebastian', 'Mozart'],
      overflow: 0,
    })
  })

  it('shows the first four names and the remainder as overflow', () => {
    expect(CD_COMPOSER_VISIBLE_LIMIT).toBe(4)
    expect(presentCdTrackComposers('A; B; C; D; E; F')).toEqual({
      names: ['A', 'B', 'C', 'D', 'E', 'F'],
      visible: ['A', 'B', 'C', 'D'],
      overflow: 2,
    })
  })

  it('returns null when the tag is missing or blank', () => {
    expect(presentCdTrackComposers(null)).toBeNull()
    expect(presentCdTrackComposers('')).toBeNull()
    expect(presentCdTrackComposers('   ;  ')).toBeNull()
  })
})
