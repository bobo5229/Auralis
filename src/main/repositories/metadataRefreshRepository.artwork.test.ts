import { describe, expect, it } from 'vitest'
import { resolveArtworkKeyForUserEdit } from './metadataRefreshRepository'

describe('resolveArtworkKeyForUserEdit', () => {
  it('keeps the track_metadata artwork key when present', () => {
    expect(resolveArtworkKeyForUserEdit('v2-track.webp', 'v2-album.webp')).toBe('v2-track.webp')
  })

  it('falls back to the album artwork key', () => {
    expect(resolveArtworkKeyForUserEdit(null, 'v2-album.webp')).toBe('v2-album.webp')
    expect(resolveArtworkKeyForUserEdit('', 'v2-album.webp')).toBe('v2-album.webp')
  })

  it('returns null when neither source has artwork', () => {
    expect(resolveArtworkKeyForUserEdit(null, null)).toBeNull()
    expect(resolveArtworkKeyForUserEdit('', '')).toBeNull()
  })
})
