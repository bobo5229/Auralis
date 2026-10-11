import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'
import { PlaylistRepository } from './playlistRepository'
import { migrations } from '../database/schemaMigrations'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

const databases: Database.Database[] = []

function setup(): {
  db: Database.Database
  tracks: TrackRepository
  refresh: MetadataRefreshRepository
} {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  return {
    db,
    tracks: new TrackRepository(db),
    refresh: new MetadataRefreshRepository(db),
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function scanned(patch: Partial<ScannedTrack> = {}): ScannedTrack {
  return {
    filePath: 'C:\\Music\\song.flac',
    fileSize: 100,
    fileMtimeMs: 100,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: 1,
    discNo: 1,
    bitrateBps: null,
    durationSeconds: 180,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'sig',
    ...patch,
  }
}

function refreshed(
  trackId: number,
  filePath: string,
  patch: Partial<RefreshedTrackMetadata> = {},
): RefreshedTrackMetadata {
  return {
    trackId,
    sourceFilePath: filePath,
    fileSize: 120,
    fileMtimeMs: 200,
    title: 'Song',
    artistDisplay: 'Artist',
    artists: ['Artist'],
    artist: 'Artist',
    albumTitle: 'Album',
    album: 'Album',
    albumArtistDisplay: 'Artist',
    albumArtists: ['Artist'],
    albumArtist: 'Artist',
    trackNo: 1,
    discNo: 1,
    bitrateBps: null,
    durationSeconds: 180,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genres: [],
    genre: null,
    lyricsText: null,
    lyricsFormat: null,
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'sig',
    ...patch,
  }
}

describe('track bitrate persistence', () => {
  it('stores, replaces and clears bitrate, including playlist queries', () => {
    const { db, tracks } = setup()
    tracks.upsertMany([scanned({ bitrateBps: 320000 })])
    const id = tracks.getAll()[0].id
    db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Bitrate')").run()
    db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,0)').run(id)
    expect(new PlaylistRepository(db).getTracks(1)[0].bitrateBps).toBe(320000)
    tracks.upsertMany([scanned({ bitrateBps: 1411200 })])
    expect(tracks.getAll()[0]).toMatchObject({ id, bitrateBps: 1411200 })
    tracks.upsertMany([scanned({ bitrateBps: null })])
    expect(tracks.getAll()[0].bitrateBps).toBeNull()
  })

  it.each([false, true])('refreshes bitrate while preserving user edits: %s', (userEdited) => {
    const { db, tracks, refresh } = setup()
    tracks.upsertMany([scanned({ bitrateBps: 320000 })])
    const id = tracks.getAll()[0].id
    if (userEdited)
      db.prepare(
        "INSERT INTO track_metadata(track_id,title,source) VALUES(?,'My title','user_edit')",
      ).run(id)
    refresh.updateTrackMetadata(refreshed(id, scanned().filePath, { bitrateBps: 1411200 }))
    expect(tracks.getAll()[0]).toMatchObject({
      id,
      bitrateBps: 1411200,
      title: userEdited ? 'My title' : 'Song',
    })
    refresh.updateTrackMetadata(refreshed(id, scanned().filePath, { bitrateBps: null }))
    expect(tracks.getAll()[0].bitrateBps).toBeNull()
  })

  it('updates bitrate when relocating a track without changing its ID', () => {
    const { tracks } = setup()
    tracks.upsertMany([scanned({ bitrateBps: 320000 })])
    const id = tracks.getAll()[0].id
    expect(
      tracks.relocateTrack(
        id,
        scanned({ filePath: 'C:\\Music\\moved.flac', bitrateBps: 1411200 }),
        scanned().filePath,
      ),
    ).toBe(true)
    expect(tracks.getAll()[0]).toMatchObject({ id, bitrateBps: 1411200 })
  })

  it('upgrades version 24 once while preserving edited metadata, playlists and listening views', () => {
    const db = new DatabaseCtor(':memory:')
    databases.push(db)
    db.exec(
      'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    )
    for (const migration of migrations.filter((m) => m.id <= 24)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
        migration.id,
        migration.name,
      )
    }
    db.exec(`
      INSERT INTO tracks(id,file_path,title,metadata_checked_mtime_ms) VALUES(7,'old.flac','Original',123);
      INSERT INTO track_metadata(track_id,title,source) VALUES(7,'My title','user_edit');
      INSERT INTO track_play_stats(track_id,play_count) VALUES(7,4);
      INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-10',7,4,720);
      INSERT INTO playlists(id,name) VALUES(1,'Favorites');
      INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,7,0);
      INSERT INTO removed_track_history(id,title,source_file_path,play_count,recovery_json) VALUES(8,'Removed','removed.flac',2,'{}');
      INSERT INTO removed_daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-10',8,2,360);
    `)
    const beforeListening = db.prepare('SELECT * FROM listening_track_display ORDER BY id').all()
    const beforeDaily = db
      .prepare('SELECT * FROM listening_daily_track_play_stats ORDER BY track_id')
      .all()
    migrateDatabase(db)
    expect(new TrackRepository(db).getAll()[0]).toMatchObject({
      id: 7,
      title: 'My title',
      bitrateBps: null,
      playCount: 4,
    })
    expect(db.prepare('SELECT metadata_checked_mtime_ms FROM tracks').pluck().get()).toBeNull()
    expect(new PlaylistRepository(db).getTracks(1)[0]).toMatchObject({
      id: 7,
      title: 'My title',
      bitrateBps: null,
    })
    expect(db.prepare('SELECT * FROM listening_track_display ORDER BY id').all()).toEqual(
      beforeListening,
    )
    expect(
      db.prepare('SELECT * FROM listening_daily_track_play_stats ORDER BY track_id').all(),
    ).toEqual(beforeDaily)
    db.exec('UPDATE tracks SET metadata_checked_mtime_ms=123,bitrate_bps=320000 WHERE id=7')
    migrateDatabase(db)
    expect(db.prepare('SELECT metadata_checked_mtime_ms,bitrate_bps FROM tracks').get()).toEqual({
      metadata_checked_mtime_ms: 123,
      bitrate_bps: 320000,
    })
    expect(db.pragma('foreign_key_check')).toEqual([])
  })
})
