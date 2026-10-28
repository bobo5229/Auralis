import { describe, expect, it } from 'vitest'
import {
  createLibraryIdentity,
  createPlaylistIdentity,
  createSmartPlaylistIdentity,
} from './libraryPageIdentity'

describe('library page identity factories', () => {
  it('creates a fixed all-songs identity without extra fields', () => {
    expect(createLibraryIdentity()).toEqual({ kind: 'library' })
  })

  it('marks regular playlists as manual membership', () => {
    expect(createPlaylistIdentity(12, '深夜选辑')).toEqual({
      kind: 'playlist',
      id: 12,
      name: '深夜选辑',
      membership: 'manual',
    })
  })

  it('marks smart playlists as rule-based membership', () => {
    expect(createSmartPlaylistIdentity(8, 'High Energy')).toEqual({
      kind: 'smart-playlist',
      id: 8,
      name: 'High Energy',
      membership: 'rule-based',
    })
  })
})
