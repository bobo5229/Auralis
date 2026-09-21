import { createRequire } from 'node:module'
import { mkdtemp, rm, stat, writeFile, readFile } from 'node:fs/promises'
import * as fileOperations from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'
import { resolveWatchRefreshPaths } from '../features/metadata/metadataFileChangeFilter'
import { MetadataRefreshService } from '../features/metadata/metadataRefreshService'
import { readStableMetadata } from '../features/metadata/readStableMetadata'

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
    durationSeconds: 10,
    year: 2026,
    releaseDate: '2026',
    copyright: null,
    genres: ['Pop'],
    genre: 'Pop',
    lyricsText: 'new lyrics',
    lyricsFormat: 'plain',
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'sig',
    rawCommonJson: '{}',
    rawNativeJson: null,
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
const edit = {
  trackId: 1,
  title: 'User title',
  artistDisplay: 'Artist',
  albumTitle: 'Album',
  albumArtistDisplay: 'Artist',
  genreDisplay: 'Pop',
  year: 2026,
  releaseDate: '2026',
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
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
    const fingerprints = new Map([[path, { fileSize: 20, fileMtimeMs: 200.25 }]])
    const stats = [{ filePath: path, size: 20, mtimeMs: 200.25 }]
    expect(resolveWatchRefreshPaths({ stats, fingerprints })).toEqual([])
    expect(
      resolveWatchRefreshPaths({ stats: [{ ...stats[0], mtimeMs: 300 }], fingerprints }),
    ).toEqual([path])
    expect(resolveWatchRefreshPaths({ stats, fingerprints, lyricsIntentPaths: [path] })).toEqual([
      path,
    ])
  })
  it('preserves user display/source while advancing technical fields and fingerprint', () => {
    const { db, repo } = setup()
    repo.updateUserEditedMetadata(edit)
    repo.updateTrackMetadata(result())
    expect(stored(db)).toMatchObject({
      title: edit.title,
      size: 20,
      mtime: 200.25,
      metadataChecked: 200.25,
    })
    expect(db.prepare('SELECT source, title FROM track_metadata').get()).toEqual({
      source: 'user_edit',
      title: edit.title,
    })
  })
  it('rolls back metadata, fingerprints and related rows on a later SQL failure', () => {
    const { db, repo } = setup()
    db.exec(
      `CREATE TRIGGER reject_album BEFORE INSERT ON albums BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
    )
    expect(() => repo.updateTrackMetadata(result())).toThrow('injected failure')
    expect(stored(db)).toMatchObject({ title: 'Old', size: 10, mtime: 100, metadataChecked: 100 })
    expect(db.prepare('SELECT * FROM track_metadata').all()).toEqual([])
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
  it('lyrics-only preserves full metadata checks when unchanged, but upgrades changed audio', () => {
    const { db, repo } = setup()
    repo.updateTrackLyrics(result({ fileSize: 10, fileMtimeMs: 100 }))
    expect(stored(db)).toMatchObject({
      title: 'Old',
      metadataChecked: 100,
      lyricsChecked: 100,
      lyrics: 'new lyrics',
    })
    repo.updateTrackLyrics(result())
    expect(stored(db)).toMatchObject({ title: 'New', mtime: 200.25, metadataChecked: 200.25 })
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
  it('rolls back user edits if fingerprint/technical commit fails', () => {
    const { db, repo } = setup()
    db.exec(
      `CREATE TRIGGER reject_fingerprint BEFORE UPDATE OF file_size ON tracks BEGIN SELECT RAISE(ABORT, 'fingerprint failure'); END`,
    )
    expect(() => repo.commitVerifiedUserEdit(edit, result())).toThrow('fingerprint failure')
    expect(stored(db)).toMatchObject({ title: 'Old', size: 10, mtime: 100 })
    expect(db.prepare('SELECT * FROM track_metadata').all()).toEqual([])
  })
})

describe('isolated FFmpeg tag write and stable readback', () => {
  it('preserves an external update made while FFmpeg was preparing replacement tags', async () => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-tag-external-'))
    roots.push(root)
    const filePath = join(root, 'sample.flac')
    await promisify(execFile)(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.1',
        '-c:a',
        'flac',
        filePath,
      ],
      { windowsHide: true },
    )
    const originalCopy = fileOperations.copyFile
    vi.spyOn(fileOperations, 'copyFile').mockImplementation(async (source, target, mode) => {
      if (String(target).includes('.auralis-replacement-'))
        await writeFile(filePath, 'external replacement', 'utf8')
      await originalCopy(source, target, mode)
    })
    const { db, repo } = setup(filePath)
    const service = new MetadataRefreshService(repo, root, vi.fn())
    vi.spyOn(service, 'refreshTracksFromFileChanges').mockReturnValue({ jobId: 999 })
    await expect(service.updateTrackMetadata(edit)).rejects.toThrow('changed during tag writing')
    expect(await readFile(filePath, 'utf8')).toBe('external replacement')
    expect(stored(db)).toMatchObject({ title: 'Old', size: 10, mtime: 100 })
  }, 20000)
  it.each(['flac', 'mp3', 'm4a'])(
    'writes actual %s tags, verifies readback and atomically commits user_edit with its fingerprint',
    async (extension) => {
      const root = await mkdtemp(join(tmpdir(), 'auralis-tag-fingerprint-'))
      roots.push(root)
      const filePath = join(root, `sample.${extension}`)
      await promisify(execFile)(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.1',
          filePath,
        ],
        { windowsHide: true },
      )
      const { db, repo } = setup(filePath)
      const service = new MetadataRefreshService(repo, root, vi.fn())
      const suppress = vi.fn()
      service.setTagWriteSuccessHandler(suppress)
      const reconcile = vi
        .spyOn(service, 'refreshTracksFromFileChanges')
        .mockReturnValue({ jobId: 999 })
      const datedEdit = { ...edit, releaseDate: '2026-09-21' }
      expect(await service.updateTrackMetadata(datedEdit)).toEqual({ ok: true })
      const fingerprint = await stat(filePath)
      expect(stored(db)).toMatchObject({
        title: edit.title,
        size: fingerprint.size,
        mtime: fingerprint.mtimeMs,
        metadataChecked: fingerprint.mtimeMs,
        lyricsChecked: fingerprint.mtimeMs,
      })
      const parsed = await readStableMetadata(1, filePath, root)
      expect(parsed.title).toBe(edit.title)
      if (extension === 'flac') {
        // Sidecar changes carry lyrics intent even though the audio fingerprint stays identical.
        await writeFile(join(root, 'sample.lrc'), '[00:00.00]Updated sidecar', 'utf8')
        const lyrics = await readStableMetadata(1, filePath, root)
        expect(lyrics.fileMtimeMs).toBe(fingerprint.mtimeMs)
        repo.updateTrackLyrics(lyrics)
        expect(stored(db)).toMatchObject({
          lyrics: '[00:00.00]Updated sidecar',
          metadataChecked: fingerprint.mtimeMs,
        })
      }
      expect(suppress).toHaveBeenCalledWith(filePath)
      expect(reconcile).not.toHaveBeenCalled()
    },
    20000,
  )
  it('does not mark a failed real write as checked and requests reconciliation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-tag-failure-'))
    roots.push(root)
    const filePath = join(root, 'corrupt.flac')
    await writeFile(filePath, 'invalid audio', 'utf8')
    const { db, repo } = setup(filePath)
    const service = new MetadataRefreshService(repo, root, vi.fn())
    const reconcile = vi
      .spyOn(service, 'refreshTracksFromFileChanges')
      .mockReturnValue({ jobId: 999 })
    await expect(service.updateTrackMetadata(edit)).rejects.toThrow()
    expect(stored(db)).toMatchObject({ title: 'Old', size: 10, mtime: 100, metadataChecked: 100 })
    expect(await readFile(filePath, 'utf8')).toBe('invalid audio')
    expect(reconcile).toHaveBeenCalledWith([1])
  }, 20000)
})
