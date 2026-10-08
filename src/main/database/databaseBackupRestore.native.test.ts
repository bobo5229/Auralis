import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { applyStagedRestoreIfExists, type DatabaseConstructor } from './databaseBackupService'
import { migrateDatabase } from './schema'
import { logger } from '@main/logging/logger'

// All file operations remain real except the one operation failed by each test.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    copyFileSync: vi.fn(actual.copyFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  }
})

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as DatabaseConstructor

describe('staged restore failure boundaries with isolated SQLite files', () => {
  let directory: string
  const connections = new Set<Database.Database>()

  function open(path: string, options?: Database.Options): Database.Database {
    const db = new DatabaseCtor(path, options)
    connections.add(db)
    return db
  }

  function createStaged(path: string): void {
    const db = open(`${path}.restore_staged`)
    migrateDatabase(db)
    db.exec("INSERT INTO tracks(file_path,title) VALUES('new.flac','New')")
    db.close()
  }

  function originalWithWal(): { path: string; original: Map<string, Buffer> } {
    const path = join(directory, 'library.sqlite')
    const db = open(path)
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    db.pragma('wal_checkpoint(TRUNCATE)')
    const main = readFileSync(path)
    db.exec("INSERT INTO tracks(file_path,title) VALUES('old.flac','Original')")
    const original = new Map([
      [path, main],
      [`${path}-wal`, readFileSync(`${path}-wal`)],
      [`${path}-shm`, readFileSync(`${path}-shm`)],
    ])
    db.close()
    // Recreate a closed, coherent file set with a committed row still only in WAL.
    for (const [file, content] of original) writeFileSync(file, content)
    createStaged(path)
    return { path, original }
  }

  function expectOriginal(path: string, original: Map<string, Buffer>): void {
    for (const [file, content] of original) expect(readFileSync(file)).toEqual(content)
    const db = open(path, { readonly: true })
    expect(db.prepare('SELECT title FROM tracks').pluck().all()).toEqual(['Original'])
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'auralis-restore-boundaries-'))
    vi.mocked(copyFileSync).mockReset().mockImplementation(actualFs.copyFileSync)
    vi.mocked(unlinkSync).mockReset().mockImplementation(actualFs.unlinkSync)
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const db of connections) if (db.open) db.close()
    connections.clear()
    vi.restoreAllMocks()
    if (
      resolve(dirname(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('auralis-restore-boundaries-')
    )
      throw new Error('Unsafe restore test directory')
    rmSync(directory, { recursive: true, force: true })
  })

  it.each(['', '-wal', '-shm'])('preserves the original set when capture of %s fails', (suffix) => {
    const { path, original } = originalWithWal()
    vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
      if (String(target) === `${path}${suffix}.rollback`) {
        writeFileSync(target, 'partial rollback copy')
        throw new Error('capture denied')
      }
      actualFs.copyFileSync(source, target, mode)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'capture denied',
    )
    expectOriginal(path, original)
    expect(readFileSync(`${path}${suffix}.rollback`)).toEqual(Buffer.from('partial rollback copy'))
    expect(existsSync(`${path}.restore_staged`)).toBe(false)
  })

  it('restores all original files after a partial replacement copy', () => {
    const { path, original } = originalWithWal()
    vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
      if (String(source) === `${path}.restore_staged` && String(target) === path) {
        writeFileSync(target, 'partial replacement')
        throw new Error('replacement failed')
      }
      actualFs.copyFileSync(source, target, mode)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'replacement failed',
    )
    expectOriginal(path, original)
    expect(existsSync(`${path}.rollback`)).toBe(false)
    expect(existsSync(`${path}.restore_staged`)).toBe(false)
  })

  it.each(['-wal', '-shm'])('restores the original set after removing %s fails once', (suffix) => {
    const { path, original } = originalWithWal()
    let denied = false
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (!denied && String(file) === `${path}${suffix}`) {
        denied = true
        throw new Error('sidecar denied')
      }
      actualFs.unlinkSync(file)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'sidecar denied',
    )
    expectOriginal(path, original)
  })

  it('rolls back a migrated replacement rejected by schema verification', () => {
    const { path, original } = originalWithWal()
    expect(() =>
      applyStagedRestoreIfExists(path, {
        databaseCtor: DatabaseCtor,
        migrate: (db) => db.exec('ALTER TABLE tracks DROP COLUMN lyrics_sidecar_fingerprint'),
      }),
    ).toThrow('Missing or incompatible Auralis column')
    expectOriginal(path, original)
  })

  it('removes a failed replacement and its WAL when no original database existed', () => {
    const path = join(directory, 'new-library.sqlite')
    createStaged(path)
    expect(() =>
      applyStagedRestoreIfExists(path, {
        databaseCtor: DatabaseCtor,
        migrate: (db) => {
          db.pragma('journal_mode = WAL')
          db.exec("INSERT INTO tracks(file_path,title) VALUES('partial.flac','Partial')")
          throw new Error('migration failed')
        },
      }),
    ).toThrow('migration failed')
    for (const suffix of ['', '-wal', '-shm', '.restore_staged', '.rollback'])
      expect(existsSync(`${path}${suffix}`)).toBe(false)
  })

  it('keeps the verified replacement if rollback-copy cleanup is denied', () => {
    const { path, original } = originalWithWal()
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (String(file) === `${path}.rollback`) throw new Error('cleanup denied')
      actualFs.unlinkSync(file)
    })
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(true)
    expect(open(path).prepare('SELECT title FROM tracks').pluck().all()).toEqual(['New'])
    expect(readFileSync(`${path}.rollback`)).toEqual(original.get(path))
    expect(existsSync(`${path}.restore_staged`)).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      { error: expect.any(Error), path: `${path}.rollback` },
      'Restore succeeded; rollback cleanup deferred',
    )
  })

  it('rolls back if consuming staging fails before original copies are discarded', () => {
    const { path, original } = originalWithWal()
    let denied = false
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (!denied && String(file) === `${path}.restore_staged`) {
        denied = true
        throw new Error('staging cleanup denied')
      }
      actualFs.unlinkSync(file)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'staging cleanup denied',
    )
    expectOriginal(path, original)
  })

  it('retains recovery material and the primary error when rollback itself fails', () => {
    const { path, original } = originalWithWal()
    vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
      if (String(target) === path && String(source) === `${path}.restore_staged`) {
        writeFileSync(target, 'partial replacement')
        throw new Error('primary replacement failed')
      }
      if (String(source) === `${path}.rollback`) throw new Error('rollback denied')
      actualFs.copyFileSync(source, target, mode)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'primary replacement failed',
    )
    for (const [file, content] of original)
      expect(readFileSync(`${file}.rollback`)).toEqual(content)
    expect(existsSync(`${path}.restore_staged`)).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(
      { rollbackError: expect.any(Error) },
      'Catastrophic error during database restore rollback',
    )
  })
})
