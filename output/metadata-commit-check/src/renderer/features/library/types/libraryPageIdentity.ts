import type { SmartPlaylistRule } from '@shared/types/smartPlaylist'
import type { RecentAddedLibraryRange } from '../utils/recentAddedLibrary'

export type LibrarySurfaceKind = 'library' | 'playlist' | 'smart-playlist' | 'recent-added'

export type LibraryPageIdentity =
  | { kind: 'library' }
  | { kind: 'recent-added'; range: RecentAddedLibraryRange }
  | { kind: 'playlist'; id: number; name: string; membership: 'manual' }
  | {
      kind: 'smart-playlist'
      id: number
      name: string
      membership: 'rule-based'
      preset?: Extract<SmartPlaylistRule, { preset: string }>['preset']
    }
