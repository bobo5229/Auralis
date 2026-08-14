import { describe, expect, it } from 'vitest'
import { resolveLyricsFollowBehavior, shouldAnimateLyricsFollow } from './lyricsMotion'

describe('resolveLyricsFollowBehavior', () => {
  it('forces instant auto follow under reduced motion', () => {
    expect(resolveLyricsFollowBehavior(true)).toBe('auto')
  })

  it('keeps smooth follow when motion is allowed', () => {
    expect(resolveLyricsFollowBehavior(false)).toBe('smooth')
  })
})

describe('shouldAnimateLyricsFollow', () => {
  it('never creates a WAAPI animation under reduced motion', () => {
    expect(shouldAnimateLyricsFollow({ behavior: 'auto', distance: 200 })).toBe(false)
    expect(shouldAnimateLyricsFollow({ behavior: 'auto', distance: 0 })).toBe(false)
  })

  it('animates only meaningful smooth moves', () => {
    expect(shouldAnimateLyricsFollow({ behavior: 'smooth', distance: 200 })).toBe(true)
    expect(shouldAnimateLyricsFollow({ behavior: 'smooth', distance: 0.4 })).toBe(false)
  })
})
