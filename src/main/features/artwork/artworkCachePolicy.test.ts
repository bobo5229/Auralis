import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ARTWORK_CACHE_PROFILE,
  computeArtworkCacheKey,
  isArtworkTempFileName,
  isCacheFileName,
  isCurrentArtworkCacheKey,
  isLegacyArtworkCacheKey,
} from './artworkCachePolicy'

describe('computeArtworkCacheKey', () => {
  it('produces the same key for the same source bytes', () => {
    const data = Buffer.from('same artwork bytes')
    expect(computeArtworkCacheKey(data)).toBe(computeArtworkCacheKey(Buffer.from('same artwork bytes')))
  })

  it('produces a different key for different source bytes', () => {
    expect(computeArtworkCacheKey(Buffer.from('image A'))).not.toBe(
      computeArtworkCacheKey(Buffer.from('image B')),
    )
  })

  it('binds the key to the conversion profile', () => {
    const data = Buffer.from('profile-sensitive bytes')
    const key = computeArtworkCacheKey(data)
    // The hash input must be "profile + NUL + source bytes" so a profile change
    // (size/format/quality) produces a different key (TechDoc §5.1).
    const expectedHash = createHash('sha256')
      .update(ARTWORK_CACHE_PROFILE)
      .update('\0')
      .update(data)
      .digest('hex')
    expect(key).toBe(`v2-${expectedHash}.webp`)
  })

  it('matches the v2-<sha256>.webp layout', () => {
    expect(computeArtworkCacheKey(Buffer.from('any bytes'))).toMatch(/^v2-[a-f0-9]{64}\.webp$/)
  })
})

describe('isCurrentArtworkCacheKey', () => {
  it('accepts well-formed v2 keys', () => {
    expect(isCurrentArtworkCacheKey(`v2-${'a'.repeat(64)}.webp`)).toBe(true)
  })

  it('rejects legacy keys and malformed values', () => {
    expect(isCurrentArtworkCacheKey(`${'a'.repeat(64)}.jpg`)).toBe(false)
    expect(isCurrentArtworkCacheKey(`${'a'.repeat(64)}.png`)).toBe(false)
    expect(isCurrentArtworkCacheKey(`${'a'.repeat(64)}.webp`)).toBe(false)
    expect(isCurrentArtworkCacheKey('v2-abc.webp')).toBe(false)
    expect(isCurrentArtworkCacheKey(null)).toBe(false)
    expect(isCurrentArtworkCacheKey('')).toBe(false)
    expect(isCurrentArtworkCacheKey(`v2-${'A'.repeat(64)}.webp`)).toBe(false)
  })
})

describe('isLegacyArtworkCacheKey', () => {
  it('accepts legacy jpg/png/webp keys', () => {
    expect(isLegacyArtworkCacheKey(`${'b'.repeat(64)}.jpg`)).toBe(true)
    expect(isLegacyArtworkCacheKey(`${'b'.repeat(64)}.png`)).toBe(true)
    expect(isLegacyArtworkCacheKey(`${'b'.repeat(64)}.webp`)).toBe(true)
  })

  it('rejects v2 keys and malformed values', () => {
    expect(isLegacyArtworkCacheKey(`v2-${'b'.repeat(64)}.webp`)).toBe(false)
    expect(isLegacyArtworkCacheKey(`${'b'.repeat(63)}.jpg`)).toBe(false)
    expect(isLegacyArtworkCacheKey(`${'b'.repeat(64)}.gif`)).toBe(false)
    expect(isLegacyArtworkCacheKey(null)).toBe(false)
  })
})

describe('isCacheFileName / isArtworkTempFileName', () => {
  it('matches legacy, v2 and temp file names', () => {
    expect(isCacheFileName(`${'c'.repeat(64)}.jpg`)).toBe(true)
    expect(isCacheFileName(`${'c'.repeat(64)}.png`)).toBe(true)
    expect(isCacheFileName(`v2-${'c'.repeat(64)}.webp`)).toBe(true)
    expect(
      isCacheFileName(`v2-${'c'.repeat(64)}.webp.1234.5678.tmp`),
    ).toBe(true)
    expect(isArtworkTempFileName(`v2-${'c'.repeat(64)}.webp.1234.5678.tmp`)).toBe(true)
  })

  it('rejects unrelated files', () => {
    expect(isCacheFileName('cover.jpg')).toBe(false)
    expect(isCacheFileName('notes.txt')).toBe(false)
    expect(isCacheFileName(`v2-${'c'.repeat(63)}.webp.1.1.tmp`)).toBe(false)
    expect(isCacheFileName(`v2-${'c'.repeat(64)}.webp.abc.tmp`)).toBe(false)
  })
})
