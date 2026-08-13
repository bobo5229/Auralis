import { describe, expect, it } from 'vitest'
import { resolveLibraryPresentation, resolveLibrarySurfaceKind } from './libraryPresentation'

describe('resolveLibrarySurfaceKind', () => {
  it('recognizes the three explicit Library route names', () => {
    expect(resolveLibrarySurfaceKind('library')).toBe('library')
    expect(resolveLibrarySurfaceKind('playlist')).toBe('playlist')
    expect(resolveLibrarySurfaceKind('smart-playlist')).toBe('smart-playlist')
  })

  it('rejects similar strings, other product routes, and missing names', () => {
    expect(resolveLibrarySurfaceKind('Library')).toBeNull()
    expect(resolveLibrarySurfaceKind('libraries')).toBeNull()
    expect(resolveLibrarySurfaceKind('playlists')).toBeNull()
    expect(resolveLibrarySurfaceKind('smart-playlists')).toBeNull()
    expect(resolveLibrarySurfaceKind('albums')).toBeNull()
    expect(resolveLibrarySurfaceKind('album-detail')).toBeNull()
    expect(resolveLibrarySurfaceKind('archive')).toBeNull()
    expect(resolveLibrarySurfaceKind('settings')).toBeNull()
    expect(resolveLibrarySurfaceKind(null)).toBeNull()
    expect(resolveLibrarySurfaceKind(undefined)).toBeNull()
    expect(resolveLibrarySurfaceKind(0)).toBeNull()
  })
})

describe('resolveLibraryPresentation', () => {
  it('allows manuscript on the three explicit Library routes', () => {
    expect(resolveLibraryPresentation('library', 'manuscript')).toBe('manuscript')
    expect(resolveLibraryPresentation('playlist', 'manuscript')).toBe('manuscript')
    expect(resolveLibraryPresentation('smart-playlist', 'manuscript')).toBe('manuscript')
  })

  it('never enables manuscript through this resolver on other routes', () => {
    expect(resolveLibraryPresentation('albums', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('album-detail', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('archive', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('settings', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('playlists', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation('Library', 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation(null, 'manuscript')).toBe('modern')
    expect(resolveLibraryPresentation(undefined, 'manuscript')).toBe('modern')
  })

  it('keeps every route modern when the saved style is modern', () => {
    expect(resolveLibraryPresentation('library', 'modern')).toBe('modern')
    expect(resolveLibraryPresentation('playlist', 'modern')).toBe('modern')
    expect(resolveLibraryPresentation('smart-playlist', 'modern')).toBe('modern')
    expect(resolveLibraryPresentation('albums', 'modern')).toBe('modern')
    expect(resolveLibraryPresentation(undefined, 'modern')).toBe('modern')
    expect(resolveLibraryPresentation(null, 'modern')).toBe('modern')
  })
})
