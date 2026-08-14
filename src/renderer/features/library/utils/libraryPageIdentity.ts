import type { LibraryPageIdentity } from '../types/libraryPresentation'

export function createLibraryIdentity(): LibraryPageIdentity {
  return { kind: 'library' }
}

export function createPlaylistIdentity(id: number, name: string): LibraryPageIdentity {
  return { kind: 'playlist', id, name, membership: 'manual' }
}

export function createSmartPlaylistIdentity(id: number, name: string): LibraryPageIdentity {
  return { kind: 'smart-playlist', id, name, membership: 'rule-based' }
}
