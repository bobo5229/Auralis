import { createRequire } from 'node:module'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { migrations } from '../../database/schemaMigrations'
import { TrackRepository } from '../../repositories/trackRepository'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'
import { readStableMetadata } from '../metadata/readStableMetadata'
import { LibraryScanArtwork } from './libraryScanArtwork'
import { LibraryScanTrackReader, type ReadTrackResult } from './libraryScanTrackReader'
import { encodeScanFileFingerprint, scanFileFingerprint } from './libraryScanFileFingerprint'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
const roots: string[] = []
const artworkKey = `v2-${'a'.repeat(64)}.webp`

afterEach(async () => {
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function database(legacy = false): Database.Database {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  if (!legacy) migrateDatabase(db)
  else {
    db.exec('CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)')
    for (const migration of migrations.filter((m) => m.id <= 25)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(migration.id, migration.name)
    }
  }
  return db
}

function mp3(date: string | null): Buffer {
  const frames = [
    ['TIT2', 'Song'],
    ['TPE1', 'Artist'],
    ['TALB', 'Album'],
  ]
  if (date !== null) frames.push(['TYER', date])
  const body = Buffer.concat(
    frames.map(([id, value]) => {
      const text = Buffer.concat([Buffer.from([0]), Buffer.from(value!, 'latin1')])
      const header = Buffer.alloc(10)
      header.write(id!)
      header.writeUInt32BE(text.length, 4)
      return Buffer.concat([header, text])
    }),
  )
  const header = Buffer.from([
    73,
    68,
    51,
    3,
    0,
    0,
    (body.length >>> 21) & 127,
    (body.length >>> 14) & 127,
    (body.length >>> 7) & 127,
    body.length & 127,
  ])
  const audio = Buffer.alloc(417 * 3)
  for (let i = 0; i < 3; i++) Buffer.from([255, 251, 144, 0]).copy(audio, 417 * i)
  return Buffer.concat([header, body, audio])
}

async function setup(date: string | null = '2012-09-30') {
  const root = await mkdtemp(join(tmpdir(), 'auralis-parser-backfill-'))
  roots.push(root)
  const path = join(root, 'song.MP3')
  await writeFile(path, mp3(date))
  const fingerprint = await stat(path)
  const db = database(true)
  db.prepare(
    `INSERT INTO tracks(id,file_path,file_size,file_mtime_ms,metadata_checked_mtime_ms,
    lyrics_checked_mtime_ms,lyrics_sidecar_fingerprint,title,artist,album,album_artist)
    VALUES(1,?,?,?,?,?,'[null,null]','Song','Artist','Album','Artist')`,
  ).run(path, fingerprint.size, fingerprint.mtimeMs, fingerprint.mtimeMs, fingerprint.mtimeMs)
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Album',
    'Artist',
    artworkKey,
  )
  db.exec("INSERT INTO track_metadata(track_id,title,source) VALUES(1,'Old file title','file_tag')")
  migrateDatabase(db)
  db.prepare('UPDATE tracks SET file_stat_fingerprint=? WHERE id=1').run(
    encodeScanFileFingerprint(scanFileFingerprint(fingerprint)),
  )
  const tracks = new TrackRepository(db)
  const failures: string[] = []
  const read = () =>
    new LibraryScanTrackReader(
      tracks.getKnownFiles(),
      new LibraryScanArtwork(root),
      (_path, reason) => failures.push(reason),
    ).read(path)
  return { db, tracks, path, root, fingerprint, read, failures }
}

function commitTags(tracks: TrackRepository, result: ReadTrackResult): void {
  if (result.kind !== 'tags') throw new Error('Expected tag backfill')
  tracks.patchTrackTags([result.patch])
  if (result.lyricsPatch) tracks.patchLyrics([result.lyricsPatch])
}

describe('parser version migration and automatic backfill', () => {
  it('upgrades version 25 once without changing user data or existing fingerprints', () => {
    const db = database(true)
    db.exec(`INSERT INTO tracks(id,file_path,title,metadata_checked_mtime_ms) VALUES(1,'song.mp3','Song',123);
      INSERT INTO track_metadata(track_id,title,source) VALUES(1,'My title','user_edit');
      INSERT INTO playlists(id,name) VALUES(1,'Favorites');
      INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0);
      INSERT INTO track_play_stats(track_id,play_count) VALUES(1,7);`)
    const tables = ['tracks', 'track_metadata', 'playlists', 'playlist_tracks', 'track_play_stats']
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    migrateDatabase(db)
    const after = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    expect(after).toEqual(
      before.map((rows, i) =>
        i === 0
          ? rows.map((row) => ({
              ...(row as object),
              metadata_parser_version: 'metadata:1',
              codec: null,
              file_stat_fingerprint: null,
            }))
          : rows,
      ),
    )
    expect(getMetadataParserVersion('song.mp3')).not.toBe('metadata:1')
    expect(getMetadataParserVersion('song.flac')).not.toBe('metadata:1')
    db.exec("UPDATE tracks SET metadata_parser_version='completed'")
    migrateDatabase(db)
    expect(db.prepare('SELECT metadata_parser_version FROM tracks').pluck().get()).toBe('completed')
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it.each(['2012-09-30', null])(
    'backfills unchanged MP3 dates %s once through the real parser and database',
    async (date) => {
      const { db, tracks, read, path, failures } = await setup(date)
      const result = await read()
      expect(result.kind).toBe('tags')
      if (result.kind !== 'tags') throw new Error('Expected tag backfill')
      expect(result.patch.releaseDate).toBe(date)
      // Reading without committing (e.g. cancellation) leaves the old version retryable.
      expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe('metadata:1')
      commitTags(tracks, result)
      expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe(getMetadataParserVersion(path))
      expect(tracks.getAll()[0]).toMatchObject({ id: 1, title: 'Song', releaseDate: date })
      expect(
        db.prepare('SELECT duration_seconds, bitrate_bps, codec FROM tracks WHERE id=1').get(),
      ).toEqual({ duration_seconds: null, bitrate_bps: null, codec: null })
      expect((await read()).kind).toBe('skip')
      expect(failures).toEqual([])
    },
  )

  it('keeps user-edited display fields while completing the backfill', async () => {
    const { db, tracks, read, path } = await setup()
    db.exec(
      "UPDATE track_metadata SET title='My title',release_date='2000-01-02',source='user_edit'",
    )
    const before = db.prepare('SELECT * FROM track_metadata').get()
    const result = await read()
    if (result.kind !== 'tags') throw new Error('Expected tag backfill')
    tracks.patchTrackTags([result.patch])
    expect(db.prepare('SELECT * FROM track_metadata').get()).toEqual(before)
    expect(tracks.getAll()[0]).toMatchObject({ title: 'My title', releaseDate: '2000-01-02' })
    expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe(getMetadataParserVersion(path))
  })

  it('keeps unchanged files at the current parser version on the fast path', async () => {
    const { db, tracks, root } = await setup()
    const path = join(root, 'unchanged.flac')
    // Deliberately unparseable: the current fingerprint/version must skip decoding.
    await writeFile(path, 'not audio')
    const fingerprint = await stat(path)
    db.prepare(
      `INSERT INTO tracks(file_path,file_size,file_mtime_ms,metadata_checked_mtime_ms,
      lyrics_checked_mtime_ms,lyrics_sidecar_fingerprint,album,album_artist,metadata_parser_version)
      VALUES(?,?,?,?,?,'[null,null,null,null]','Album','Artist',?)`,
    ).run(
      path,
      fingerprint.size,
      fingerprint.mtimeMs,
      fingerprint.mtimeMs,
      fingerprint.mtimeMs,
      getMetadataParserVersion(path),
    )
    db.prepare('UPDATE tracks SET file_stat_fingerprint=? WHERE file_path=?').run(
      encodeScanFileFingerprint(scanFileFingerprint(fingerprint)),
      path,
    )
    const failures: string[] = []
    const reader = new LibraryScanTrackReader(
      tracks.getKnownFiles(),
      new LibraryScanArtwork(root),
      (_path, reason) => failures.push(reason),
    )
    expect((await reader.read(path)).kind).toBe('skip')
    expect(failures).toEqual([])
  })

  it('keeps an unchanged two-slot LRC fingerprint on the fast path', async () => {
    const { db, tracks, path, read, failures } = await setup()
    db.prepare('UPDATE tracks SET metadata_parser_version=? WHERE id=1').run(
      getMetadataParserVersion(path),
    )
    const before = db.prepare('SELECT * FROM tracks WHERE id=1').get()
    expect(await read()).toEqual({ kind: 'skip' })
    expect(await read()).toEqual({ kind: 'skip' })
    expect(tracks.getKnownFiles()[0].lyricsSidecarFingerprint).toBe('[null,null]')
    expect(db.prepare('SELECT * FROM tracks WHERE id=1').get()).toEqual(before)
    expect(failures).toEqual([])
  })

  it.each([undefined, 'outdated'])(
    'does not stamp unversioned or stale worker output as current: %s',
    async (version) => {
      const { tracks, read, path } = await setup()
      const result = await read()
      if (result.kind !== 'tags') throw new Error('Expected tag backfill')
      tracks.patchTrackTags([{ ...result.patch, metadataParserVersion: version }])
      expect(tracks.getKnownFiles()[0].metadataParserVersion).not.toBe(
        getMetadataParserVersion(path),
      )
      expect((await read()).kind).toBe('tags')
    },
  )

  it('rolls back the version and dates together on a late display write failure, then retries', async () => {
    const { db, tracks, read } = await setup()
    const result = await read()
    if (result.kind !== 'tags') throw new Error('Expected tag backfill')
    db.exec(`CREATE TRIGGER reject_display BEFORE UPDATE ON track_metadata
      BEGIN SELECT RAISE(ABORT, 'display failure'); END`)
    expect(() => tracks.patchTrackTags([result.patch])).toThrow('display failure')
    expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe('metadata:1')
    expect(tracks.getAll()[0].releaseDate).toBeNull()
    db.exec('DROP TRIGGER reject_display')
    const retry = await read()
    if (retry.kind !== 'tags') throw new Error('Expected retry')
    commitTags(tracks, retry)
    expect(tracks.getAll()[0].releaseDate).toBe('2012-09-30')
    expect((await read()).kind).toBe('skip')
  })

  it('stamps full refreshes but not lyrics-only writes, and carries versions through relocation', async () => {
    const { db, tracks, read, path, root } = await setup()
    const refreshed = await readStableMetadata(1, path, root)
    const refresh = new MetadataRefreshRepository(db)
    refresh.updateTrackLyrics(refreshed)
    expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe('metadata:1')
    refresh.updateTrackMetadata(refreshed)
    expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe(getMetadataParserVersion(path))
    db.exec("UPDATE tracks SET metadata_parser_version='old'")
    const result = await read()
    if (result.kind !== 'tags') throw new Error('Expected tag backfill')
    commitTags(tracks, result)
    expect(tracks.getKnownFiles()[0].metadataParserVersion).toBe(getMetadataParserVersion(path))
    const newPath = join(root, 'moved.mp3')
    expect(
      tracks.relocateTrack(
        1,
        {
          filePath: newPath,
          fileSize: refreshed.fileSize,
          fileMtimeMs: refreshed.fileMtimeMs,
          title: refreshed.title,
          artist: refreshed.artist,
          album: refreshed.album,
          albumArtist: refreshed.albumArtist,
          trackNo: refreshed.trackNo,
          discNo: refreshed.discNo,
          durationSeconds: refreshed.durationSeconds,
          bitrateBps: refreshed.bitrateBps,
          codec: refreshed.codec ?? null,
          year: refreshed.year,
          releaseDate: refreshed.releaseDate,
          copyright: refreshed.copyright,
          composer: refreshed.composer,
          genre: refreshed.genre,
          artworkCacheKey: refreshed.artworkCacheKey,
          lyricsText: refreshed.lyricsText,
          lyricsFormat: null,
          isrc: refreshed.isrc,
          metadataSignature: refreshed.metadataSignature,
          metadataParserVersion: refreshed.metadataParserVersion,
        },
        path,
      ),
    ).toBe(true)
    expect(tracks.getKnownFiles()[0]).toMatchObject({
      filePath: newPath,
      metadataParserVersion: getMetadataParserVersion(newPath),
    })
    expect(tracks.getAll()[0]).toMatchObject({ title: 'Song', releaseDate: '2012-09-30' })
  })
})
