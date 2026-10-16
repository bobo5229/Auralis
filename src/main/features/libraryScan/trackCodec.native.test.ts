import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { migrations } from '../../database/schemaMigrations'
import { TrackRepository } from '../../repositories/trackRepository'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { LibraryIncrementalImportService } from './libraryIncrementalImportService'
import { LibraryScanArtwork } from './libraryScanArtwork'
import { LibraryScanTrackReader } from './libraryScanTrackReader'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'
import { readStableMetadata } from '../metadata/readStableMetadata'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
let root: string
const formats = [
  { name: 'pcm.wav', encoder: 'pcm_s16le', codec: /PCM/ },
  { name: 'lossless.flac', encoder: 'flac', codec: /^FLAC$/ },
  { name: 'mpeg.mp3', encoder: 'libmp3lame', codec: /^MPEG 1 Layer 3$/ },
  { name: 'aac.m4a', encoder: 'aac', codec: /AAC/ },
  { name: 'alac.m4a', encoder: 'alac', codec: /ALAC/ },
  { name: 'adts.aac', encoder: 'aac', codec: /^AAC$/ },
  { name: 'vorbis.ogg', encoder: 'libvorbis', codec: /^Vorbis I$/ },
  { name: 'opus.opus', encoder: 'libopus', codec: /^Opus$/ },
]

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'auralis-codec-'))
  const ffmpeg = fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url))
  for (const format of formats) {
    await promisify(execFile)(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.12:sample_rate=44100',
        '-c:a',
        format.encoder,
        '-metadata',
        'title=Song',
        '-metadata',
        'artist=Artist',
        '-metadata',
        'album=Album',
        join(root, format.name),
      ],
      { windowsHide: true },
    )
  }
}, 30000)

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

function setup(legacy = false) {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  if (legacy) {
    db.exec('CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)')
    for (const migration of migrations.filter((m) => m.id <= 26)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(migration.id, migration.name)
    }
  } else migrateDatabase(db)
  return { db, tracks: new TrackRepository(db), refresh: new MetadataRefreshRepository(db) }
}

describe('audio codec persistence', () => {
  it('adds a nullable codec column to version 26 without changing existing data, once', () => {
    const { db } = setup(true)
    db.exec(`
      INSERT INTO tracks(id,file_path,title,metadata_checked_mtime_ms,metadata_parser_version)
      VALUES(7,'song.flac','Song',123,'metadata:1');
      INSERT INTO track_metadata(track_id,title,source) VALUES(7,'My title','user_edit');
      INSERT INTO playlists(id,name) VALUES(1,'Favorites');
      INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,7,0);
      INSERT INTO track_play_stats(track_id,play_count) VALUES(7,9);
    `)
    const tables = ['tracks', 'track_metadata', 'playlists', 'playlist_tracks', 'track_play_stats']
    const before = tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all())
    migrateDatabase(db)
    expect(tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all())).toEqual(
      before.map((rows, i) =>
        i === 0 ? rows.map((row) => ({ ...(row as object), codec: null })) : rows,
      ),
    )
    db.exec("UPDATE tracks SET codec='FLAC'")
    migrateDatabase(db)
    expect(db.prepare('SELECT codec FROM tracks').pluck().get()).toBe('FLAC')
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('persists codecs on import and keeps stored codec and duration when unchanged files reread tags', async () => {
    const { db, tracks } = setup()
    const files = formats.map((f) => join(root, f.name))
    const importer = new LibraryIncrementalImportService(tracks, join(root, 'artwork'), () => {})
    expect(await importer.importFiles(files)).toEqual({ imported: files, failed: [], unstable: [] })
    const readCodec = db.prepare('SELECT codec FROM tracks WHERE file_path=?').pluck()
    const readDuration = db.prepare('SELECT duration_seconds FROM tracks WHERE file_path=?').pluck()
    for (const format of formats)
      expect(readCodec.get(join(root, format.name))).toMatch(format.codec)
    expect(readCodec.get(join(root, 'aac.m4a'))).not.toBe(readCodec.get(join(root, 'alac.m4a')))
    // An unchanged file with an old parser version rereads text tags and keeps the stored codec.
    db.exec("UPDATE tracks SET codec=NULL,metadata_parser_version='metadata:1'")
    const failures: string[] = []
    const reader = () =>
      new LibraryScanTrackReader(
        tracks.getKnownFiles(),
        new LibraryScanArtwork(join(root, 'artwork')),
        (_path, reason) => failures.push(reason),
      )
    for (const format of formats) {
      const path = join(root, format.name)
      const duration = readDuration.get(path)
      const result = await reader().read(path)
      if (result.kind !== 'tags') {
        throw new Error(`Expected tag backfill for ${path}: ${failures.join('; ') || result.kind}`)
      }
      // ffmpeg -metadata does not land in raw ADTS. Full import and this text
      // reread both resolve that title from the file name.
      expect(result.patch.title).toBe(format.name === 'adts.aac' ? 'adts' : 'Song')
      expect(readCodec.get(path)).toBeNull()
      expect(tracks.getKnownFiles().find((x) => x.filePath === path)?.metadataParserVersion).toBe(
        'metadata:1',
      )
      tracks.patchTrackTags([result.patch])
      if (result.lyricsPatch) tracks.patchLyrics([result.lyricsPatch])
      expect(readCodec.get(path)).toBeNull()
      expect(readDuration.get(path)).toBe(duration)
      expect(tracks.getKnownFiles().find((x) => x.filePath === path)?.metadataParserVersion).toBe(
        getMetadataParserVersion(path),
      )
      const next = await reader().read(path)
      expect(next.kind).not.toBe('tags')
      expect(next.kind).not.toBe('track')
    }
    expect(failures).toEqual([])
  })

  it.each([false, true])(
    'refreshes technical codec data while preserving user edits: %s',
    async (userEdit) => {
      const { db, tracks, refresh } = setup()
      const path = join(root, 'lossless.flac')
      const result = await new LibraryScanTrackReader(
        [],
        new LibraryScanArtwork(join(root, 'artwork')),
        () => {},
      ).read(path)
      if (result.kind !== 'track') throw new Error('Expected track')
      tracks.upsertMany([result.track])
      const id = tracks.getAll()[0].id
      if (userEdit)
        db.prepare(
          "INSERT INTO track_metadata(track_id,title,source) VALUES(?,'My title','user_edit')",
        ).run(id)
      const metadata = await readStableMetadata(id, path, join(root, 'artwork'))
      expect(metadata.codec).toBe('FLAC')
      db.exec("UPDATE tracks SET codec='previous',metadata_parser_version='old'")
      refresh.updateTrackLyrics(metadata)
      expect(db.prepare('SELECT codec,metadata_parser_version FROM tracks').get()).toEqual({
        codec: 'previous',
        metadata_parser_version: 'old',
      })
      refresh.updateTrackMetadata(metadata)
      expect(db.prepare('SELECT codec FROM tracks').pluck().get()).toBe('FLAC')
      expect(tracks.getAll()[0].title).toBe(userEdit ? 'My title' : 'Song')
      refresh.updateTrackMetadata({ ...metadata, codec: null })
      expect(db.prepare('SELECT codec FROM tracks').pluck().get()).toBeNull()
      expect(
        tracks.relocateTrack(id, { ...result.track, filePath: join(root, 'moved.flac') }, path),
      ).toBe(true)
      expect(db.prepare('SELECT id,codec FROM tracks').get()).toEqual({ id, codec: 'FLAC' })
      tracks.upsertMany([{ ...result.track, filePath: join(root, 'moved.flac'), codec: null }])
      expect(db.prepare('SELECT codec FROM tracks').pluck().get()).toBeNull()
    },
  )

  it('rolls codec and parser version back together on a failed scan write', async () => {
    const { db, tracks } = setup()
    const result = await new LibraryScanTrackReader(
      [],
      new LibraryScanArtwork(join(root, 'artwork')),
      () => {},
    ).read(join(root, 'lossless.flac'))
    if (result.kind !== 'track') throw new Error('Expected track')
    tracks.upsertMany([{ ...result.track, codec: null, metadataParserVersion: 'old' }])
    db.exec(
      "CREATE TRIGGER reject_codec BEFORE UPDATE ON tracks WHEN NEW.codec IS NOT NULL BEGIN SELECT RAISE(ABORT,'reject codec'); END",
    )
    expect(() => tracks.upsertMany([result.track])).toThrow('reject codec')
    expect(db.prepare('SELECT codec,metadata_parser_version FROM tracks').get()).toEqual({
      codec: null,
      metadata_parser_version: 'old',
    })
    db.exec('DROP TRIGGER reject_codec')
    tracks.upsertMany([result.track])
    expect(db.prepare('SELECT codec,metadata_parser_version FROM tracks').get()).toEqual({
      codec: 'FLAC',
      metadata_parser_version: getMetadataParserVersion(result.track.filePath),
    })
  })
})
