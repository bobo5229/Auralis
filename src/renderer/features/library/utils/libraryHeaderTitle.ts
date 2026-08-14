import type { LibraryPageIdentity, LibrarySurfaceKind } from '../types/libraryPresentation'

export type LibraryHeaderTitleSource =
  | { kind: 'loading' }
  | { kind: 'localized'; key: string }
  | { kind: 'raw'; value: string }

export function resolveLibraryHeaderTitleSource(
  identity: LibraryPageIdentity | null,
  surfaceKind: LibrarySurfaceKind | null,
  isLoading: boolean,
): LibraryHeaderTitleSource {
  if (identity?.kind === 'library') {
    return { kind: 'localized', key: 'library.manuscript.header.title' }
  }

  if (identity?.kind === 'playlist' || identity?.kind === 'smart-playlist') {
    const name = identity.name.trim()
    return name
      ? { kind: 'raw', value: name }
      : {
          kind: 'localized',
          key:
            identity.kind === 'playlist'
              ? 'library.manuscript.header.playlistFallback'
              : 'library.manuscript.header.smartPlaylistFallback',
        }
  }

  if (isLoading || !surfaceKind) {
    return { kind: 'loading' }
  }

  if (surfaceKind === 'playlist') {
    return { kind: 'localized', key: 'library.manuscript.header.playlistFallback' }
  }

  if (surfaceKind === 'smart-playlist') {
    return { kind: 'localized', key: 'library.manuscript.header.smartPlaylistFallback' }
  }

  return { kind: 'localized', key: 'library.manuscript.header.title' }
}
