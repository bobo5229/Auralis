/** Committed playlist mutations, independent of the UI that initiated them. */
export type PlaylistChangedEvent =
  | {
      kind: 'playlist'
      playlistId: number
      reason: 'created' | 'renamed' | 'deleted' | 'tracks-added' | 'view-mode-updated'
    }
  | {
      kind: 'smart'
      playlistId: number
      reason: 'created' | 'renamed' | 'deleted' | 'rule-updated' | 'view-mode-updated'
    }
  | { kind: 'collection'; reason: 'reordered' }
