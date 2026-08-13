import { describe, expect, it } from 'vitest'
import { resolveLibraryHeaderTitleSource } from './libraryHeaderTitle'

describe('resolveLibraryHeaderTitleSource', () => {
  it('uses the committed playlist name and ignores a previous loading state', () => {
    expect(
      resolveLibraryHeaderTitleSource(
        { kind: 'playlist', id: 1, name: '通勤选辑', membership: 'manual' },
        'playlist',
        true,
      ),
    ).toEqual({ kind: 'raw', value: '通勤选辑' })
  })

  it('does not keep a loading title after a failed or empty identity commit', () => {
    expect(resolveLibraryHeaderTitleSource(null, 'playlist', false)).toEqual({
      kind: 'localized',
      key: 'library.manuscript.header.playlistFallback',
    })
    expect(resolveLibraryHeaderTitleSource(null, 'smart-playlist', false)).toEqual({
      kind: 'localized',
      key: 'library.manuscript.header.smartPlaylistFallback',
    })
  })

  it('treats blank playlist names as untitled fallbacks', () => {
    expect(
      resolveLibraryHeaderTitleSource(
        { kind: 'smart-playlist', id: 2, name: '   ', membership: 'rule-based' },
        'smart-playlist',
        false,
      ),
    ).toEqual({
      kind: 'localized',
      key: 'library.manuscript.header.smartPlaylistFallback',
    })
  })
})
