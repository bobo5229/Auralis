import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as new (path: string) => Database.Database
const databases: Database.Database[] = []

function refreshed(patch: Partial<RefreshedTrackMetadata> = {}): RefreshedTrackMetadata {
  return {
    trackId: 1,
    sourceFilePath: 'C:\\isolated\\sample.flac',
    fileSize: 100,
    fileMtimeMs: 100,
    title: 'Original',
    artistDisplay: 'Original Artist',
    artists: ['Original Artist'],
    artist: 'Original Artist',
    albumTitle: 'Original Album',
    album: 'Original Album',
    albumArtistDisplay: 'Original Album Artist',
    albumArtists: ['Original Album Artist'],
    albumArtist: 'Original Album Artist',
    trackNo: 1,
    discNo: 1,
    bitrateBps: null,
    durationSeconds: 180,
    year: 2026,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    genres: ['Pop'],
    genre: 'Pop',
    lyricsText: 'Original lyrics',
    lyricsFormat: 'plain',
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'original',
    ...patch,
  }
}

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  db.prepare('INSERT INTO tracks(id,file_path,title,artist,album) VALUES(1,?,?,?,?)').run(
    refreshed().sourceFilePath,
    'Original',
    'Original Artist',
    'Original Album',
  )
  const repository = new MetadataRefreshRepository(db)
  repository.updateTrackMetadata(refreshed())
  return { db, repository }
}

function snapshot(db: Database.Database) {
  return ['tracks', 'track_metadata', 'artists', 'track_artists', 'albums'].map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('metadata repository writer transaction boundaries', () => {
  it('rolls back file metadata, albums and primary artists when album-artist insertion fails', () => {
    const { db, repository } = setup()
    const before = snapshot(db)
    db.exec(`CREATE TRIGGER reject_album_artist BEFORE INSERT ON track_artists
      WHEN NEW.role = 'album_artist' BEGIN SELECT RAISE(ABORT, 'late artist failure'); END`)

    expect(() =>
      repository.updateTrackMetadata(
        refreshed({
          title: 'Replacement',
          artists: ['Replacement Artist'],
          albumTitle: 'Replacement Album',
          albumArtists: ['Replacement Album Artist'],
          fileSize: 200,
          fileMtimeMs: 200,
        }),
      ),
    ).toThrow('late artist failure')
    expect(snapshot(db)).toEqual(before)
    expect(db.inTransaction).toBe(false)
  })
})

it('only replaces still-current legacy lyrics and preserves unrelated metadata', () => {
  const { db, repository } = setup()
  db.prepare("INSERT INTO library_roots(path) VALUES ('C:\\isolated')").run()
  db.prepare("UPDATE tracks SET lyrics_format = 'ttml', lyrics_text = '<tt />' WHERE id = 1").run()
  db.prepare(
    "UPDATE track_metadata SET lyrics_format = 'ttml', lyrics_text = '<tt />' WHERE track_id = 1",
  ).run()
  const beforeTitle = db.prepare('SELECT title FROM tracks WHERE id = 1').get()
  expect(repository.getLegacyTtmlTracks(0, 128)).toEqual([
    { trackId: 1, filePath: refreshed().sourceFilePath },
  ])
  expect(
    repository.updateLegacyTtmlLyrics(
      refreshed({ lyricsText: '[00:01]Fallback', lyricsFormat: 'lrc' }),
      '[null,null]',
    ),
  ).toBe(true)
  expect(
    db
      .prepare(
        'SELECT lyrics_text, lyrics_format, lyrics_sidecar_fingerprint FROM tracks WHERE id = 1',
      )
      .get(),
  ).toEqual({
    lyrics_text: '[00:01]Fallback',
    lyrics_format: 'lrc',
    lyrics_sidecar_fingerprint: '[null,null]',
  })
  expect(db.prepare('SELECT title FROM tracks WHERE id = 1').get()).toEqual(beforeTitle)
  expect(
    repository.updateLegacyTtmlLyrics(
      refreshed({ lyricsText: null, lyricsFormat: null }),
      '[null,null]',
    ),
  ).toBe(false)
  expect(repository.getLegacyTtmlTracks(0, 128)).toEqual([])
})

it('retries legacy lyrics for missing tracks without changing availability', () => {
  const { db, repository } = setup()
  db.prepare("INSERT INTO library_roots(path) VALUES ('C:\\isolated')").run()
  db.prepare(
    "UPDATE tracks SET availability = 'missing', lyrics_format = 'ttml', lyrics_text = '<tt />' WHERE id = 1",
  ).run()
  expect(repository.getLegacyTtmlTracks(0, 128)).toEqual([
    { trackId: 1, filePath: refreshed().sourceFilePath },
  ])
  expect(repository.getLegacyTtmlFilePath(1)).toBe(refreshed().sourceFilePath)
  expect(
    repository.updateLegacyTtmlLyrics(
      refreshed({ lyricsText: null, lyricsFormat: null }),
      '[null,null]',
    ),
  ).toBe(true)
  expect(db.prepare('SELECT availability, lyrics_format FROM tracks WHERE id = 1').get()).toEqual({
    availability: 'missing',
    lyrics_format: null,
  })
})

it('excludes legacy lyrics outside configured roots, including prefix siblings', () => {
  const { db, repository } = setup()
  db.prepare("INSERT INTO library_roots(path) VALUES ('C:\\isolate')").run()
  db.prepare(
    "UPDATE tracks SET availability = 'missing', lyrics_format = 'ttml' WHERE id = 1",
  ).run()
  expect(repository.getLegacyTtmlTracks(0, 128)).toEqual([])
  expect(repository.getLegacyTtmlFilePath(1)).toBeNull()
  expect(repository.updateLegacyTtmlLyrics(refreshed(), '[null,null]')).toBe(false)
})

it('prunes completed legacy retry records without touching other refresh jobs', () => {
  const { repository } = setup()
  const legacy = repository.createJob('legacy-lyrics', 1)
  repository.addFailure(legacy, 1, refreshed().sourceFilePath, 'unavailable')
  repository.completeJob(legacy)
  const other = repository.createJob('tracks', 1)
  repository.addFailure(other, 1, refreshed().sourceFilePath, 'other')
  repository.completeJob(other)
  repository.pruneLegacyLyricsJobs()
  expect(repository.getJobById(legacy)).toBeNull()
  expect(repository.getJobById(other)).not.toBeNull()
  expect(repository.listFailures()).toMatchObject([{ jobId: other, reason: 'other' }])
})

it('matches Windows roots with non-ASCII case differences without matching sibling folders', () => {
  const { db, repository } = setup()
  const root = process.platform === 'win32' ? 'C:\\MÜSIC' : '/müsic'
  const file = process.platform === 'win32' ? 'C:\\müsic\\song.flac' : '/müsic/song.flac'
  db.prepare('INSERT INTO library_roots(path) VALUES (?)').run(root)
  db.prepare("UPDATE tracks SET file_path = ?, lyrics_format = 'ttml' WHERE id = 1").run(file)
  expect(repository.getLegacyTtmlTracks(0, 128)).toEqual([{ trackId: 1, filePath: file }])
  expect(repository.getLegacyTtmlFilePath(1)).toBe(file)
})
