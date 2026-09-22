import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { TrackRepository } from '../../repositories/trackRepository'
import { LibraryIncrementalImportService } from './libraryIncrementalImportService'

vi.mock('node:fs/promises', () => ({ stat: async () => ({ size: 100, mtimeMs: 100 }) }))
vi.mock('music-metadata', () => ({
  parseFile: async () => ({
    format: { duration: 120 },
    native: {},
    common: {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      track: { no: null, of: null },
      disk: { no: null, of: null },
    },
  }),
}))
vi.mock('../metadata/resolveLyricsForFile', () => ({ resolveLyricsForFile: async () => null }))
vi.mock('../artwork/resolveArtworkForFile', () => ({ resolveArtworkForFile: async () => null }))
vi.mock('../../logging/logger', () => ({ logger: { warn: vi.fn() } }))

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
let db: Database.Database
beforeEach(() => {
  vi.useFakeTimers()
  db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
})
afterEach(() => {
  db.close()
  vi.useRealTimers()
})

describe('incremental import transactions', () => {
  it('publishes only after all batch rows and their fingerprints are committed', async () => {
    const repo = new TrackRepository(db)
    const send = vi.fn(() => expect(repo.getAll()).toHaveLength(2))
    const service = new LibraryIncrementalImportService(repo, 'cache', send)
    const pending = service.importFiles(['a.flac', 'b.flac'])
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({ imported: ['a.flac', 'b.flac'], failed: [], unstable: [] })
    expect(send).toHaveBeenCalledOnce()
    expect(repo.getKnownFiles()).toEqual([
      expect.objectContaining({ filePath: 'a.flac', fileSize: 100, metadataCheckedMtimeMs: 100 }),
      expect.objectContaining({ filePath: 'b.flac', fileSize: 100, metadataCheckedMtimeMs: 100 }),
    ])
  })

  it('rolls back earlier rows when a later row fails and publishes no import event', async () => {
    db.exec(`CREATE TRIGGER reject_test_track BEFORE INSERT ON tracks
      WHEN NEW.file_path = 'b.flac' BEGIN SELECT RAISE(ABORT, 'test failure'); END`)
    const repo = new TrackRepository(db)
    const send = vi.fn()
    const service = new LibraryIncrementalImportService(repo, 'cache', send)
    const pending = service.importFiles(['a.flac', 'b.flac'])
    await vi.runAllTimersAsync()
    const result = await pending
    expect(result.imported).toEqual([])
    expect(result.failed).toEqual([
      { filePath: 'a.flac', reason: 'test failure' },
      { filePath: 'b.flac', reason: 'test failure' },
    ])
    expect(repo.getAll()).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })
})
