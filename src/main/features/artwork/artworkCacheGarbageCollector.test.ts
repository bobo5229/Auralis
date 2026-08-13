import { mkdtemp, readdir, rm, writeFile, chmod } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { ArtworkCacheGarbageCollector } from './artworkCacheGarbageCollector'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

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
  const dir = await mkdtemp(join(tmpdir(), 'auralis-artwork-gc-'))
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

function legacyKey(seed: string): string {
  return `${seed.repeat(64).slice(0, 64)}.jpg`
}

function v2Key(seed: string): string {
  return `v2-${seed.repeat(64).slice(0, 64)}.webp`
}

describe.skipIf(!sqliteAvailable)('ArtworkCacheGarbageCollector', () => {
  it('keeps files referenced by albums and track_metadata', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const albumKey = v2Key('a')
    const metadataKey = legacyKey('b')
    await writeFile(join(dir, albumKey), 'album-artwork')
    await writeFile(join(dir, metadataKey), 'metadata-artwork')

    db.prepare('INSERT INTO albums (title, artist, artwork_cache_key) VALUES (?, ?, ?)').run(
      'Album',
      'Artist',
      albumKey,
    )
    db.prepare('INSERT INTO tracks (id, file_path) VALUES (1, ?)').run('C:\\music\\a.mp3')
    db.prepare(
      `INSERT INTO track_metadata (track_id, artwork_cache_key, source)
       VALUES (1, ?, 'file_tag')`,
    ).run(metadataKey)

    const collector = new ArtworkCacheGarbageCollector(db, dir)
    const summary = await collector.collectGarbage()

    expect(summary.orphanFileCount).toBe(0)
    const files = await readdir(dir)
    expect(files).toContain(albumKey)
    expect(files).toContain(metadataKey)
  })

  it('deletes unreferenced legacy, v2 and stale temp files', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const kept = v2Key('c')
    const orphanLegacy = legacyKey('d')
    const orphanV2 = v2Key('e')
    const staleTemp = `v2-${'f'.repeat(64)}.webp.1234.5678.tmp`

    for (const name of [kept, orphanLegacy, orphanV2, staleTemp]) {
      await writeFile(join(dir, name), 'bytes')
    }
    db.prepare('INSERT INTO albums (title, artist, artwork_cache_key) VALUES (?, ?, ?)').run(
      'Album',
      'Artist',
      kept,
    )

    const collector = new ArtworkCacheGarbageCollector(db, dir)
    const summary = await collector.collectGarbage()

    const files = await readdir(dir)

    expect(summary.orphanFileCount).toBe(3)
    expect(summary.bytesReclaimed).toBe('bytes'.length * 3)
    expect(files).toEqual([kept])
  })

  it('never deletes unknown files and reports them as warnings', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const unknown = 'cover.jpg'
    await writeFile(join(dir, unknown), 'not a cache file')

    const collector = new ArtworkCacheGarbageCollector(db, dir)
    const summary = await collector.collectGarbage()

    expect(summary.orphanFileCount).toBe(0)
    expect(summary.warnedUnknownFileCount).toBe(1)
    expect(await readdir(dir)).toEqual([unknown])
  })

  it('collects referenced keys from both storage tables', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const albumKey = v2Key('a')
    const metadataKey = v2Key('b')
    db.prepare('INSERT INTO albums (title, artist, artwork_cache_key) VALUES (?, ?, ?)').run(
      'Album',
      'Artist',
      albumKey,
    )
    db.prepare('INSERT INTO tracks (id, file_path) VALUES (1, ?)').run('C:\\music\\b.mp3')
    db.prepare(
      `INSERT INTO track_metadata (track_id, artwork_cache_key, source)
       VALUES (1, ?, 'file_tag')`,
    ).run(metadataKey)

    const collector = new ArtworkCacheGarbageCollector(db, dir)
    const refs = collector.collectReferencedKeys()

    expect(refs).toContain(albumKey)
    expect(refs).toContain(metadataKey)
  })

  it('tolerates a single failing delete without aborting the sweep', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const blocked = legacyKey('b')
    const orphan = v2Key('c')
    await writeFile(join(dir, blocked), 'bytes')
    await writeFile(join(dir, orphan), 'bytes')
    // Make one file read-only so unlink fails on Windows (EPERM).
    await chmod(join(dir, blocked), 0o444)

    const collector = new ArtworkCacheGarbageCollector(db, dir)
    const summary = await collector.collectGarbage()

    const files = await readdir(dir)

    // Read-only file may still be deletable depending on the platform — either
    // outcome is acceptable as long as the sweep itself did not abort.
    expect(summary.orphanFileCount).toBeGreaterThanOrEqual(1)
    expect(files).not.toContain(orphan)
  })

  it('treats a missing cache directory as empty', async () => {
    const dir = await makeTempDir()
    const db = createDb()
    const missingDir = join(dir, 'does-not-exist')

    const collector = new ArtworkCacheGarbageCollector(db, missingDir)
    const summary = await collector.collectGarbage()

    expect(summary.orphanFileCount).toBe(0)
  })
})
