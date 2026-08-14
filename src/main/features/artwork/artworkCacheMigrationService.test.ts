import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { writeArtworkToCache } from './artworkCache'
import { isCurrentArtworkCacheKey } from './artworkCachePolicy'
import { ArtworkCacheMigrationService } from './artworkCacheMigrationService'
import { TrackRepository } from '../../repositories/trackRepository'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { RefreshedTrackMetadata } from '../../repositories/metadataRefreshRepository'
import type { AlbumArtworkPatch } from '@shared/types/libraryScan'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

// better-sqlite3 is rebuilt for the Electron ABI in this repo; under plain Node
// the native binding may not load. Skip DB-backed suites when it does not.
let sqliteAvailable = false
try {
  const probe = new DatabaseCtor(':memory:')
  probe.close()
  sqliteAvailable = true
} catch {
  sqliteAvailable = false
}

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'auralis-artwork-migrate-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function createDb(): Database.Database {
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  return db
}

async function createLegacyArtwork(seed = 0): Promise<{ data: Buffer; legacyKey: string }> {
  const data = await sharp({
    create: {
      width: 800 + seed,
      height: 600 + seed,
      channels: 3,
      background: { r: 90 + seed, g: 140, b: 200 },
    },
  })
    .jpeg()
    .toBuffer()
  // Legacy v1 cache keys are "<sha256>.<ext>" — the file and the DB share the key.
  const legacyKey = `${createHash('sha256').update(data).digest('hex')}.jpg`
  return { data, legacyKey }
}

function insertAlbumRef(db: Database.Database, title: string, artist: string, key: string): void {
  db.prepare('INSERT INTO albums (title, artist, artwork_cache_key) VALUES (?, ?, ?)').run(
    title,
    artist,
    key,
  )
}

function insertTrack(db: Database.Database, trackId: number, filePath: string): void {
  db.prepare('INSERT INTO tracks (id, file_path) VALUES (?, ?)').run(trackId, filePath)
}

function insertMetadataRef(db: Database.Database, trackId: number, key: string): void {
  db.prepare(
    `INSERT INTO track_metadata (track_id, artwork_cache_key, source)
     VALUES (?, ?, 'file_tag')`,
  ).run(trackId, key)
}

function getAlbumKey(db: Database.Database, title = 'Album', artist = 'Artist'): string | null {
  const row = db
    .prepare('SELECT artwork_cache_key AS k FROM albums WHERE title = ? AND artist = ?')
    .get(title, artist) as { k: string | null } | undefined
  return row?.k ?? null
}

describe.skipIf(!sqliteAvailable)('ArtworkCacheMigrationService', () => {
  it('reports no legacy keys on an empty database', () => {
    const db = createDb()
    const service = new ArtworkCacheMigrationService(db, 'C:\\tmp\\cache')
    expect(service.hasLegacyKeys()).toBe(false)
  })

  it('migrates a legacy key and updates all its references', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const { data, legacyKey } = await createLegacyArtwork()
    await writeFile(join(dir, legacyKey), data)
    insertAlbumRef(db, 'Album A', 'Artist A', legacyKey)
    insertAlbumRef(db, 'Album B', 'Artist B', legacyKey)
    insertTrack(db, 1, 'C:\\music\\a.mp3')
    insertMetadataRef(db, 1, legacyKey)

    const service = new ArtworkCacheMigrationService(db, dir)
    expect(service.hasLegacyKeys()).toBe(true)

    const summary = await service.runMigration()

    expect(summary.legacyKeyCount).toBe(1)
    expect(summary.migratedKeyCount).toBe(1)
    expect(summary.failedKeyCount).toBe(0)

    const v2Keys = new Set<string>([
      ...(
        db.prepare('SELECT artwork_cache_key AS k FROM albums').all() as Array<{ k: string }>
      ).map((row) => row.k),
      ...(
        db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').all() as Array<{
          k: string
        }>
      ).map((row) => row.k),
    ])
    expect(v2Keys.size).toBe(1)
    const v2Key = [...v2Keys][0]
    expect(isCurrentArtworkCacheKey(v2Key)).toBe(true)

    const files = await readdir(dir)
    expect(files).toContain(legacyKey)
    expect(files).toContain(v2Key)
  })

  it('converts each distinct legacy image only once', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const first = await createLegacyArtwork(1)
    const second = await createLegacyArtwork(2)
    const secondKey = `${second.legacyKey.replace(/\.jpg$/, '')}.png`
    await writeFile(join(dir, first.legacyKey), first.data)
    await writeFile(join(dir, secondKey), second.data)

    insertAlbumRef(db, 'Album A', 'Artist A', first.legacyKey)
    insertAlbumRef(db, 'Album B', 'Artist B', first.legacyKey)
    insertAlbumRef(db, 'Album C', 'Artist C', secondKey)

    const service = new ArtworkCacheMigrationService(db, dir)
    const summary = await service.runMigration()

    expect(summary.migratedKeyCount).toBe(2)
    expect(summary.failedKeyCount).toBe(0)

    const v2Files = (await readdir(dir)).filter((name) => isCurrentArtworkCacheKey(name))
    expect(v2Files).toHaveLength(2)
    expect(db.prepare('SELECT artwork_cache_key AS k FROM albums').all()).toHaveLength(3)
    const distinct = new Set(
      (
        db.prepare('SELECT DISTINCT artwork_cache_key AS k FROM albums').all() as Array<{
          k: string
        }>
      ).map((row) => row.k),
    )
    expect(distinct.size).toBe(2)
    expect([...distinct].every((key) => isCurrentArtworkCacheKey(key))).toBe(true)
  })

  it('is idempotent when re-run after a successful migration', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const { data, legacyKey } = await createLegacyArtwork()
    await writeFile(join(dir, legacyKey), data)
    insertAlbumRef(db, 'Album', 'Artist', legacyKey)

    const service = new ArtworkCacheMigrationService(db, dir)
    await service.runMigration()
    expect(service.hasLegacyKeys()).toBe(false)

    const second = await service.runMigration()
    expect(second.legacyKeyCount).toBe(0)
    expect(second.migratedKeyCount).toBe(0)
  })

  it('recovers when the v2 file exists but the database was not updated', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const { data, legacyKey } = await createLegacyArtwork()
    // Simulate a crash after the v2 file was written but before the DB commit:
    // the legacy file is still on disk, and the v2 file already exists.
    await writeFile(join(dir, legacyKey), data)
    const v2Key = await writeArtworkToCache(dir, { data, mimeType: 'image/jpeg' }, 'setup')
    insertAlbumRef(db, 'Album', 'Artist', legacyKey)
    const v2StatsBefore = await stat(join(dir, v2Key!))

    const service = new ArtworkCacheMigrationService(db, dir)
    const summary = await service.runMigration()

    expect(summary.migratedKeyCount).toBe(1)
    expect(getAlbumKey(db)).toBe(v2Key)
    const v2StatsAfter = await stat(join(dir, v2Key!))
    expect(v2StatsAfter.mtimeMs).toBe(v2StatsBefore.mtimeMs)
  })

  it('falls back to a representative track when the legacy cache file is missing', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const { data, legacyKey } = await createLegacyArtwork()
    insertTrack(db, 5, 'C:\\music\\representative.mp3')
    insertMetadataRef(db, 5, legacyKey)

    const service = new ArtworkCacheMigrationService(db, dir, async () => ({
      data,
      mimeType: 'image/jpeg',
    }))
    const summary = await service.runMigration()

    expect(summary.migratedKeyCount).toBe(1)
    const row = db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as {
      k: string
    }
    expect(isCurrentArtworkCacheKey(row.k)).toBe(true)
  })

  it('keeps legacy references when recovery fails', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const { legacyKey } = await createLegacyArtwork()
    insertTrack(db, 6, 'C:\\music\\unrecoverable.mp3')
    insertMetadataRef(db, 6, legacyKey)

    const service = new ArtworkCacheMigrationService(db, dir, async () => null)
    const summary = await service.runMigration()

    expect(summary.failedKeyCount).toBe(1)
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(legacyKey)
    expect(await readdir(dir)).toEqual([])
  })
})

describe.skipIf(!sqliteAvailable)('trackRepository artwork upsert rules', () => {
  const legacy = `${'a'.repeat(64)}.jpg`
  const v2a = `v2-${'b'.repeat(64)}.webp`
  const v2b = `v2-${'c'.repeat(64)}.webp`

  it('allows v2 to replace legacy but never the reverse', () => {
    const db = createDb()
    const repo = new TrackRepository(db)
    const patch = (artworkCacheKey: string | null): AlbumArtworkPatch => ({
      album: 'Album',
      artist: 'Artist',
      // AlbumArtworkPatch types a non-null key; null is exercised here to prove
      // the upsert rule never clears an established key.
      artworkCacheKey: artworkCacheKey as string,
    })

    repo.patchAlbumArtwork([patch(legacy)])
    expect(getAlbumKey(db)).toBe(legacy)

    repo.patchAlbumArtwork([patch(v2a)])
    expect(getAlbumKey(db)).toBe(v2a)

    repo.patchAlbumArtwork([patch(legacy)])
    expect(getAlbumKey(db)).toBe(v2a)
  })

  it('never clears an established v2 key with null or another v2', () => {
    const db = createDb()
    const repo = new TrackRepository(db)
    const patch = (artworkCacheKey: string | null): AlbumArtworkPatch => ({
      album: 'Album',
      artist: 'Artist',
      // AlbumArtworkPatch types a non-null key; null is exercised here to prove
      // the upsert rule never clears an established key.
      artworkCacheKey: artworkCacheKey as string,
    })

    repo.patchAlbumArtwork([patch(v2a)])
    expect(getAlbumKey(db)).toBe(v2a)

    repo.patchAlbumArtwork([patch(null)])
    expect(getAlbumKey(db)).toBe(v2a)

    repo.patchAlbumArtwork([patch(v2b)])
    expect(getAlbumKey(db)).toBe(v2a)
  })

  it('accepts a v2 key for a fresh album', () => {
    const db = createDb()
    const repo = new TrackRepository(db)

    repo.patchAlbumArtwork([{ album: 'Album', artist: 'Artist', artworkCacheKey: v2a }])
    expect(getAlbumKey(db)).toBe(v2a)
  })
})

describe.skipIf(!sqliteAvailable)('metadataRefreshRepository artwork upsert rules', () => {
  const legacy = `${'d'.repeat(64)}.jpg`
  const v2a = `v2-${'e'.repeat(64)}.webp`
  const v2b = `v2-${'f'.repeat(64)}.webp`

  function refreshedTrack(artworkCacheKey: string | null, trackId = 1): RefreshedTrackMetadata {
    return {
      trackId,
      title: 'Title',
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
      durationSeconds: 200,
      year: 2026,
      releaseDate: '2026',
      copyright: null,
      genres: [],
      genre: null,
      lyricsText: null,
      lyricsFormat: null,
      artworkCacheKey,
      isrc: null,
      metadataSignature: 'sig',
      rawCommonJson: '{}',
      rawNativeJson: null,
    }
  }

  it('v2 replaces legacy, and legacy/null/different-v2 never overwrite established v2', () => {
    const db = createDb()
    const repo = new MetadataRefreshRepository(db)
    insertTrack(db, 1, 'C:\\music\\x.mp3')

    repo.updateTrackMetadata(refreshedTrack(legacy))
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(legacy)
    expect(getAlbumKey(db)).toBe(legacy)

    repo.updateTrackMetadata(refreshedTrack(v2a))
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(v2a)
    expect(getAlbumKey(db)).toBe(v2a)

    repo.updateTrackMetadata(refreshedTrack(legacy))
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(v2a)
    expect(getAlbumKey(db)).toBe(v2a)

    repo.updateTrackMetadata(refreshedTrack(null))
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(v2a)
    expect(getAlbumKey(db)).toBe(v2a)

    repo.updateTrackMetadata(refreshedTrack(v2b))
    expect(
      (db.prepare('SELECT artwork_cache_key AS k FROM track_metadata').get() as { k: string }).k,
    ).toBe(v2a)
    expect(getAlbumKey(db)).toBe(v2a)
  })

  it('protects an established v2 key under user-edited metadata', () => {
    const db = createDb()
    const repo = new MetadataRefreshRepository(db)
    insertTrack(db, 2, 'C:\\music\\y.mp3')

    repo.updateTrackMetadata(refreshedTrack(v2a, 2))
    db.prepare(`UPDATE track_metadata SET source = 'user_edit' WHERE track_id = 2`).run()

    repo.updateTrackMetadata(refreshedTrack(legacy, 2))
    repo.updateTrackMetadata(refreshedTrack(null, 2))
    repo.updateTrackMetadata(refreshedTrack(v2b, 2))

    const row = db
      .prepare('SELECT artwork_cache_key AS k, source AS s FROM track_metadata WHERE track_id = 2')
      .get() as { k: string; s: string }
    expect(row.k).toBe(v2a)
    expect(row.s).toBe('user_edit')
  })
})
