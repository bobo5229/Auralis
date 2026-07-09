import type { TrackListItem } from './libraryScan'

export type SmartPlaylistViewMode = 'flat' | 'cover'
export type SmartPlaylistRuleField = 'genre' | 'albumArtist'
export type SmartPlaylistQueryField = 'genre' | 'artist' | 'albumArtist'

export interface SmartPlaylistRuleCondition {
  field: SmartPlaylistRuleField
  value: string | null
}

export interface LegacySmartPlaylistRule {
  conditions: SmartPlaylistRuleCondition[]
}

export interface SmartPlaylistPredicate {
  type: 'predicate'
  field: SmartPlaylistQueryField
  operator: 'has' | 'isEmpty'
  value?: string
}

export interface SmartPlaylistBooleanExpression {
  type: 'and' | 'or'
  operands: SmartPlaylistExpression[]
}

export type SmartPlaylistExpression = SmartPlaylistPredicate | SmartPlaylistBooleanExpression

export interface SmartPlaylistExpressionRule {
  expression: SmartPlaylistExpression
}

export type SmartPlaylistRule = LegacySmartPlaylistRule | SmartPlaylistExpressionRule

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
