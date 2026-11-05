import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'
import { resolveWatchRefreshPaths } from '../features/metadata/metadataFileChangeFilter'
import { TrackRepository } from './trackRepository'
import { resolveTagRecoveryTrackIds } from '../features/metadata/tagWriteRecovery'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, copyFile: vi.fn(actual.copyFile) }
})

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
const roots: string[] = []
const path = 'C:\\isolated\\song.flac'
function setup(filePath = path) {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  db.prepare(
    `INSERT INTO tracks (id, file_path, title, file_size, file_mtime_ms, metadata_checked_mtime_ms)
    VALUES (1, ?, 'Old', 10, 100, 100)`,
  ).run(filePath)
  return { db, repo: new MetadataRefreshRepository(db) }
}
function result(patch: Partial<RefreshedTrackMetadata> = {}): RefreshedTrackMetadata {
  return {
    trackId: 1,
    sourceFilePath: path,
    fileSize: 20,
    fileMtimeMs: 200.25,
    fileFingerprint: { size: 20, mtimeMs: 200.25, ctimeMs: 201, dev: 1, ino: 1 },
    title: 'New',
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
    durationSeconds: 10,
    year: 2026,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    genres: ['Pop'],
    genre: 'Pop',
    lyricsText: 'new lyrics',
    lyricsFormat: 'plain',
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'sig',
    ...patch,
  }
}
function stored(db: Database.Database) {
  return db
    .prepare(
      `SELECT title, file_size AS size, file_mtime_ms AS mtime,
    metadata_checked_mtime_ms AS metadataChecked, lyrics_checked_mtime_ms AS lyricsChecked,
    lyrics_text AS lyrics FROM tracks WHERE id = 1`,
    )
    .get() as {
    title: string
    size: number
    mtime: number
    metadataChecked: number | null
    lyricsChecked: number | null
    lyrics: string | null
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('persists recovery refresh for a mixed-case audio path until metadata commits', () => {
  const filePath = process.platform === 'win32' ? 'C:\\isolated\\song.Flac' : path
  const { db, repo } = setup(filePath)
  const tracks = new TrackRepository(db)
  const sidecar = filePath.slice(0, -5) + '.lrc'
  const ids = resolveTagRecoveryTrackIds(sidecar, (candidate) =>
    tracks.getTrackIdsByPlaybackPath(candidate),
  )
  expect(ids).toEqual([1])
  repo.queueTagRecoveryRefresh(ids)

  const restarted = new MetadataRefreshRepository(db)
  expect(restarted.listPendingTagRecoveryPaths()).toEqual([filePath])
  expect(() => restarted.updateTrackMetadata(result({ sourceFilePath: 'wrong-path' }))).toThrow()
  expect(restarted.listPendingTagRecoveryPaths()).toEqual([filePath])
  restarted.updateTrackMetadata(
    result({
      sourceFilePath: filePath,
      fileTags: {
        title: 'New',
        artistDisplay: 'Artist',
        albumTitle: 'Album',
        albumArtistDisplay: 'Artist',
        genreDisplay: 'Pop',
        year: 2026,
        releaseDate: '2026',
      },
    }),
  )
  expect(restarted.listPendingTagRecoveryPaths()).toEqual([])
})

describe('metadata fingerprint transactions', () => {
  it('commits B with tags, skips repeated B, processes C and sidecar intent', () => {
    const { db, repo } = setup()
    repo.updateTrackMetadata(result())
    expect(stored(db)).toMatchObject({
      title: 'New',
      size: 20,
      mtime: 200.25,
      metadataChecked: 200.25,
      lyricsChecked: 200.25,
    })
    expect(
      new TrackRepository(db).getFileFingerprintsByFilePaths([path]).get(path)?.fileFingerprint,
    ).toEqual(result().fileFingerprint)
    const fileFingerprint = { size: 20, mtimeMs: 200.25, ctimeMs: 100, dev: 1, ino: 1 }
    const fingerprints = new Map([[path, { fileSize: 20, fileMtimeMs: 200.25, fileFingerprint }]])
    const stats = [{ filePath: path, ...fileFingerprint }]
    expect(resolveWatchRefreshPaths({ stats, fingerprints })).toEqual([])
    expect(
      resolveWatchRefreshPaths({ stats: [{ ...stats[0], mtimeMs: 300 }], fingerprints }),
    ).toEqual([path])
    expect(resolveWatchRefreshPaths({ stats, fingerprints, lyricsIntentPaths: [path] })).toEqual([
      path,
    ])
  })
  it('rolls back metadata, fingerprints and related rows on a later SQL failure', () => {
    const { db, repo } = setup()
    db.exec(
      `CREATE TRIGGER reject_album BEFORE INSERT ON albums BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
    )
    expect(() => repo.updateTrackMetadata(result())).toThrow('injected failure')
    expect(stored(db)).toMatchObject({ title: 'Old', size: 10, mtime: 100, metadataChecked: 100 })
    expect(db.prepare('SELECT * FROM track_metadata').all()).toEqual([])
    expect(db.prepare('SELECT file_stat_fingerprint FROM tracks').pluck().get()).toBeNull()
  })
  it('rejects moved and deleted track identities without side effects', () => {
    const { db, repo } = setup()
    db.prepare('UPDATE tracks SET file_path = ?').run('C:\\isolated\\moved.flac')
    expect(() => repo.updateTrackMetadata(result())).toThrow('identity')
    expect(stored(db).mtime).toBe(100)
    db.exec('DELETE FROM tracks')
    expect(() => repo.updateTrackMetadata(result())).toThrow('identity')
    expect(db.prepare('SELECT * FROM track_metadata').all()).toEqual([])
  })
  it('lyrics-only preserves metadata checks and rejects changed audio', () => {
    const { db, repo } = setup()
    repo.updateTrackLyrics(result({ fileSize: 10, fileMtimeMs: 100 }))
    expect(stored(db)).toMatchObject({
      title: 'Old',
      metadataChecked: 100,
      lyricsChecked: 100,
      lyrics: 'new lyrics',
    })
    expect(() => repo.updateTrackLyrics(result())).toThrow('fingerprint changed')
    expect(stored(db)).toMatchObject({ title: 'Old', mtime: 100, metadataChecked: 100 })
  })
  it('rolls back both lyrics tables when the second write fails', () => {
    const { db, repo } = setup()
    repo.updateTrackMetadata(result())
    db.exec(
      `CREATE TRIGGER reject_lyrics BEFORE UPDATE ON track_metadata BEGIN SELECT RAISE(ABORT, 'lyrics failure'); END`,
    )
    expect(() => repo.updateTrackLyrics(result({ lyricsText: 'different' }))).toThrow(
      'lyrics failure',
    )
    expect(stored(db).lyrics).toBe('new lyrics')
  })
})
