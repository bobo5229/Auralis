import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import type { PlaylistChangedEvent } from '@shared/types/playlistEvents'
import { migrateDatabase } from '../database/schema'
import { PlaylistRepository } from '../repositories/playlistRepository'
import { SmartPlaylistRepository } from '../repositories/smartPlaylistRepository'
import { TrackRepository } from '../repositories/trackRepository'
import { PlaylistService } from './playlistService'
import { SmartPlaylistService } from './smartPlaylistService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('publishes committed regular and smart playlist mutations without a renderer owner', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec("INSERT INTO tracks(id,file_path,title) VALUES(1,'one.flac','One')")
    const regularRepo = new PlaylistRepository(db)
    const smartRepo = new SmartPlaylistRepository(db)
    const changes: PlaylistChangedEvent[] = []
    const publish = (event: PlaylistChangedEvent) => {
      // A notification observes the completed write, never an uncommitted operation.
      expect(db.inTransaction).toBe(false)
      if (event.kind !== 'collection') {
        const playlist = (event.kind === 'playlist' ? regularRepo : smartRepo).getById(
          event.playlistId,
        )
        expect(Boolean(playlist)).toBe(event.reason !== 'deleted')
      }
      changes.push(event)
    }
    const regular = new PlaylistService(regularRepo, smartRepo, publish)
    const smart = new SmartPlaylistService(smartRepo, new TrackRepository(db), publish)
    const list = regular.create('Fixture')
    regular.rename(list.id, 'Renamed')
    regular.addTracks(list.id, [1])
    regular.updateViewMode(list.id, 'flat')
    const preset = smart.create('Recently played', { preset: 'recentPlayed', days: 7 }).playlist
    smart.rename(preset.id, 'Smart renamed')
    smart.updateViewMode(preset.id, 'flat')
    regular.reorderSidebarItems([
      { kind: 'smart', id: preset.id },
      { kind: 'playlist', id: list.id },
    ])
    regular.delete(list.id)
    smart.delete(preset.id)
    expect(changes.map(({ kind, reason }) => [kind, reason])).toEqual([
      ['playlist', 'created'],
      ['playlist', 'renamed'],
      ['playlist', 'tracks-added'],
      ['playlist', 'view-mode-updated'],
      ['smart', 'created'],
      ['smart', 'renamed'],
      ['smart', 'view-mode-updated'],
      ['collection', 'reordered'],
      ['playlist', 'deleted'],
      ['smart', 'deleted'],
    ])
    const count = changes.length
    regular.delete(list.id)
    regular.rename(list.id, 'Missing')
    regular.addTracks(list.id, [1])
    smart.delete(preset.id)
    smart.rename(preset.id, 'Missing')
    expect(changes).toHaveLength(count)
  } finally {
    db.close()
  }
})

it('does not publish failed or deduplicated writes and publishes committed smart rule edits', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    const regularRepo = new PlaylistRepository(db)
    const smartRepo = new SmartPlaylistRepository(db)
    const changes: PlaylistChangedEvent[] = []
    const publish = (event: PlaylistChangedEvent) => changes.push(event)
    const regular = new PlaylistService(regularRepo, smartRepo, publish)
    const smart = new SmartPlaylistService(smartRepo, new TrackRepository(db), publish)
    const created = smart.createRecentAdded(7)
    expect(smart.createRecentAdded(7).created).toBe(false)
    expect(changes).toHaveLength(1)
    smart.updateRecentAddedDays(created.playlist.id, 30)
    expect(changes[1]).toEqual({
      kind: 'smart',
      playlistId: created.playlist.id,
      reason: 'rule-updated',
    })
    regular.reorderSidebarItems([])
    smart.reorder([]) // Invalid collection order is rejected before writing.
    expect(changes).toHaveLength(2)
    db.exec(
      "CREATE TRIGGER reject_playlist BEFORE INSERT ON playlists BEGIN SELECT RAISE(ABORT,'fixture rejection'); END",
    )
    expect(() => regular.create()).toThrow('fixture rejection')
    expect(changes).toHaveLength(2)
    expect(() => smart.create('Invalid', { conditions: [] })).toThrow()
    expect(changes).toHaveLength(2)
  } finally {
    db.close()
  }
})
