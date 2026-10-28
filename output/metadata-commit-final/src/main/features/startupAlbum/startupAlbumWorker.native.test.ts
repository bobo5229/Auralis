import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { basename, dirname, resolve, join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '@main/database/schema'
import { StartupAlbumWorkerHost } from './startupAlbumWorkerHost'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
let directory: string
let workerPath: string

beforeAll(async () => {
  const root = resolve('.electron-home')
  mkdirSync(root, { recursive: true })
  directory = mkdtempSync(join(root, 'startup-album-worker-native-'))
  workerPath = join(directory, 'startupAlbumWorker.cjs')
  await build({
    entryPoints: ['src/main/features/startupAlbum/startupAlbumWorker.ts'],
    outfile: workerPath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    tsconfig: 'tsconfig.node.json',
    external: ['better-sqlite3'],
  })
})
afterAll(() => {
  // Only remove this test's mkdtemp directory under the checked workspace root.
  if (!directory) return
  const target = resolve(directory)
  if (
    dirname(target) !== resolve('.electron-home') ||
    !basename(target).startsWith('startup-album-worker-native-')
  )
    throw new Error('Refusing to remove a startup album test directory outside its fixture scope')
  rmSync(target, { recursive: true, force: true })
})

it('queries the initialized WAL database on a real Electron worker and preserves cooldown and ordered playable tracks', async () => {
  const databasePath = join(directory, 'library.sqlite')
  const db = new DatabaseCtor(databasePath)
  const host = new StartupAlbumWorkerHost(databasePath, { workerPath })
  try {
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    db.pragma('wal_checkpoint(TRUNCATE)')
    // Deliberately leave these latest committed records in the WAL.
    db.exec(`INSERT INTO tracks (file_path, title, artist, album_artist, album, disc_no, track_no, availability)
      VALUES ('second.wav','Second','Artist','','A',1,2,'available'),
        ('first.wav','First','Artist','','A',1,1,'available'),
        ('disc2.wav','Disc two','Artist','','A',2,1,'available'),
        ('missing.wav','Missing','Artist','','A',1,3,'missing'),
        ('other.wav','Other','Band','Band','B',1,1,'available');`)
    const databaseBefore = readFileSync(databasePath)
    const walBefore = readFileSync(databasePath + '-wal')
    const selected = await host.getStartupAlbumTracks([{ albumArtist: 'Band', album: 'B' }])
    expect(selected?.album).toBe('A')
    expect(selected?.tracks.map((track) => track.title)).toEqual(['First', 'Second', 'Disc two'])
    expect(readFileSync(databasePath)).toEqual(databaseBefore)
    expect(readFileSync(databasePath + '-wal')).toEqual(walBefore)
    expect(
      (
        await host.getStartupAlbumTracks([
          { albumArtist: 'Artist', album: 'A' },
          { albumArtist: 'Band', album: 'B' },
        ])
      )?.album,
    ).toBe('B')
    db.exec("UPDATE tracks SET availability = 'missing'")
    expect(await host.getStartupAlbumTracks()).toBeNull()
  } finally {
    await host.shutdown()
    db.close()
  }
})

it('does not create a missing database or migrate an uninitialized database', async () => {
  const missingPath = join(directory, 'absent.sqlite')
  const missingHost = new StartupAlbumWorkerHost(missingPath, { workerPath })
  try {
    await expect(missingHost.getStartupAlbumTracks()).rejects.toThrow()
    expect(existsSync(missingPath)).toBe(false)
  } finally {
    await missingHost.shutdown()
  }
  const emptyPath = join(directory, 'uninitialized.sqlite')
  const db = new DatabaseCtor(emptyPath)
  db.close()
  const before = readFileSync(emptyPath)
  const emptyHost = new StartupAlbumWorkerHost(emptyPath, { workerPath })
  try {
    await expect(emptyHost.getStartupAlbumTracks()).rejects.toThrow('no such table')
    expect(readFileSync(emptyPath)).toEqual(before)
  } finally {
    await emptyHost.shutdown()
  }
})
