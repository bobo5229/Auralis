import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { LibraryRootRepository } from '../../repositories/libraryRootRepository'
import { TrackRepository } from '../../repositories/trackRepository'
import { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from './metadataWatchService'
import type { MetadataRefreshService } from './metadataRefreshService'

const DB = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

it('automatically imports files present when an offline root returns and keeps watching later additions', async () => {
  const parent = resolve('.cache')
  mkdirSync(parent, { recursive: true })
  const fixture = mkdtempSync(join(parent, 'watch-recovery-native-'))
  const root = join(fixture, 'music')
  const db = new DB(':memory:')
  let service: MetadataWatchService | undefined
  try {
    migrateDatabase(db)
    const roots = new LibraryRootRepository(db)
    roots.upsertByPath(root)
    const tracks = new TrackRepository(db)
    const refresh = vi.fn()
    service = new MetadataWatchService(
      roots,
      tracks,
      { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
      new LibraryIncrementalImportService(tracks, join(fixture, 'artwork'), () => {}),
      () => {},
    )
    service.start() // The configured root does not exist yet: real fs.watch fails.
    mkdirSync(join(root, 'nested'), { recursive: true })
    const make = (directory: string, title: string) => {
      const path = join(directory, title + '.flac')
      execFileSync(
        resolve('resources/audio/ffmpeg.exe'),
        [
          '-nostdin',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=duration=0.1',
          '-metadata',
          'title=' + title,
          '-metadata',
          'artist=Artist',
          path,
        ],
        { windowsHide: true, timeout: 15000 },
      )
      return path
    }
    const beforeReconnect = [make(root, 'Before'), make(join(root, 'nested'), 'Nested')]
    await vi.waitFor(
      () =>
        expect(
          tracks
            .getAll()
            .map(({ title }) => title)
            .sort(),
        ).toEqual(['Before', 'Nested']),
      { timeout: 10000 },
    )
    expect(tracks.getExistingFilePaths(beforeReconnect).size).toBe(2)
    const later = make(root, 'Later')
    await vi.waitFor(() => expect(tracks.getExistingFilePaths([later]).size).toBe(1), {
      timeout: 10000,
    })
    expect(tracks.getAll()).toHaveLength(3)
    // Existing fingerprints remain current, so duplicate native events do not
    // turn recovery into an unconditional full metadata reparse.
    expect(refresh).not.toHaveBeenCalled()
  } finally {
    await service?.stop()
    db.close()
    if (
      dirname(resolve(fixture)) !== parent ||
      !basename(fixture).startsWith('watch-recovery-native-')
    )
      throw new Error('Unexpected fixture path')
    rmSync(fixture, { recursive: true, force: true })
  }
}, 25000)
