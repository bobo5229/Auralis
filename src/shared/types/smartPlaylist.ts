import type { TrackListItem } from './libraryScan'

export type SmartPlaylistViewMode = 'flat' | 'cover'
export type SmartPlaylistRuleField = 'genre' | 'albumArtist'

export interface SmartPlaylistRuleCondition {
  field: SmartPlaylistRuleField
  value: string | null
}

export interface SmartPlaylistRule {
  conditions: SmartPlaylistRuleCondition[]
}

export interface SmartPlaylist {
  id: number
  name: string
  rule: SmartPlaylistRule
  viewMode: SmartPlaylistViewMode
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateSmartPlaylistResult {
  playlist: SmartPlaylist
  created: boolean
}

export interface SmartPlaylistDetail {
  playlist: SmartPlaylist
  tracks: TrackListItem[]
}
