import { describe, expect, it } from 'vitest'
import { resolveAlbumPresentation } from './albumPresentation'

describe('resolveAlbumPresentation', () => {
  it('enables the shared manuscript preference on album catalog and detail routes', () => {
    expect(resolveAlbumPresentation('albums', 'manuscript')).toBe('manuscript')
    expect(resolveAlbumPresentation('album-detail', 'manuscript')).toBe('manuscript')
    expect(resolveAlbumPresentation('albums', 'modern')).toBe('modern')
    expect(resolveAlbumPresentation('album-detail', 'modern')).toBe('modern')
  })

  it('keeps every unrelated route modern', () => {
    expect(resolveAlbumPresentation('library', 'manuscript')).toBe('modern')
    expect(resolveAlbumPresentation('settings', 'manuscript')).toBe('modern')
    expect(resolveAlbumPresentation(undefined, 'manuscript')).toBe('modern')
  })
})
