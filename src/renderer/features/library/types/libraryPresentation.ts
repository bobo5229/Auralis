export type LibraryPresentation = 'modern' | 'manuscript'

export type LibrarySurfaceKind = 'library' | 'playlist' | 'smart-playlist'

export type LibraryPageIdentity =
  | { kind: 'library' }
  | { kind: 'playlist'; id: number; name: string; membership: 'manual' }
  | { kind: 'smart-playlist'; id: number; name: string; membership: 'rule-based' }
