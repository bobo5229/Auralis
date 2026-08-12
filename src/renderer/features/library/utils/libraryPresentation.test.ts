import { describe, expect, it } from 'vitest'
import { resolveLibraryPresentation } from './libraryPresentation'

describe('resolveLibraryPresentation', () => {
  it('allows manuscript only on the All Songs route', () => {
    expect(resolveLibraryPresentation('library', 'manuscript')).toBe('manuscript')
    expect(resolveLibraryPresentation('playlist', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('smart-playlist', 'manuscript')).toBe('modern')
  })

  it('keeps every route modern when the saved style is modern', () => {
    expect(resolveLibraryPresentation('library', 'modern')).toBe('modern')
    expect(resolveLibraryPresentation(undefined, 'modern')).toBe('modern')
  })
})
