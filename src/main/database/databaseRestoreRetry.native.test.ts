import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
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

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    copyFileSync: vi.fn(actual.copyFileSync),
    renameSync: vi.fn(actual.renameSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  }
})

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as DatabaseConstructor

describe('database restore recovery across startup attempts', () => {
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
    db.exec("INSERT INTO tracks(file_path,title) VALUES('replacement.flac','Replacement')")
    db.close()
  }

  function originalWithWal(): { path: string; original: Map<string, Buffer> } {
    const path = join(directory, 'library.sqlite')
    const db = open(path)
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    db.pragma('wal_checkpoint(TRUNCATE)')
    const main = readFileSync(path)
    db.exec(`
      INSERT INTO tracks(id,file_path,title) VALUES(1,'original.flac','Original');
      INSERT INTO playlists(id,name) VALUES(1,'Original playlist');
      INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0);
      INSERT INTO track_play_stats(track_id,play_count) VALUES(1,17);
    `)
    const original = new Map([
      [path, main],
      [`${path}-wal`, readFileSync(`${path}-wal`)],
      [`${path}-shm`, readFileSync(`${path}-shm`)],
    ])
    db.close()
    for (const [file, content] of original) writeFileSync(file, content)
    createStaged(path)
    return { path, original }
  }

  function expectOriginal(path: string, original: Map<string, Buffer>): void {
    for (const [file, content] of original) expect(readFileSync(file)).toEqual(content)
    const db = open(path, { readonly: true })
    expect(db.prepare('SELECT title FROM tracks').pluck().all()).toEqual(['Original'])
    expect(db.prepare('SELECT name FROM playlists').pluck().all()).toEqual(['Original playlist'])
    expect(db.prepare('SELECT track_id FROM playlist_tracks').pluck().all()).toEqual([1])
    expect(db.prepare('SELECT play_count FROM track_play_stats').pluck().all()).toEqual([17])
  }

  function expectNoRecoveryFiles(path: string): void {
    for (const suffix of [
      '.restore_staged',
      '.restore_state',
      '.rollback',
      '-wal.rollback',
      '-shm.rollback',
    ])
      expect(existsSync(`${path}${suffix}`)).toBe(false)
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'auralis-restore-retry-'))
    vi.mocked(copyFileSync).mockReset().mockImplementation(actualFs.copyFileSync)
    vi.mocked(renameSync).mockReset().mockImplementation(actualFs.renameSync)
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
      !basename(directory).startsWith('auralis-restore-retry-')
    )
      throw new Error('Unsafe restore retry test directory')
    rmSync(directory, { recursive: true, force: true })
  })

  it.each(['', '-wal', '-shm'])(
    'preserves the entire original set when restoring %s fails across attempts',
    (suffix) => {
      const { path, original } = originalWithWal()
      const migrate = vi.fn(() => {
        throw new Error('migration failed')
      })
      vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
        if (String(source) === `${path}${suffix}.rollback`) throw new Error('rollback denied')
        actualFs.copyFileSync(source, target, mode)
      })
      expect(() =>
        applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor, migrate }),
      ).toThrow('migration failed')
      for (const [file, content] of original)
        expect(readFileSync(`${file}.rollback`)).toEqual(content)
      // A fresh invocation must use durable recovery state, without recapturing or migrating.
      expect(() =>
        applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor, migrate }),
      ).toThrow('rollback denied')
      for (const [file, content] of original)
        expect(readFileSync(`${file}.rollback`)).toEqual(content)
      vi.mocked(copyFileSync).mockImplementation(actualFs.copyFileSync)
      expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor, migrate })).toBe(false)
      expect(migrate).toHaveBeenCalledTimes(1)
      expectOriginal(path, original)
      expectNoRecoveryFiles(path)
    },
  )

  it('finishes removing a failed replacement on restart when no original existed', () => {
    const path = join(directory, 'new-library.sqlite')
    createStaged(path)
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (String(file) === path) throw new Error('replacement removal denied')
      actualFs.unlinkSync(file)
    })
    const migrate = vi.fn(() => {
      throw new Error('migration failed')
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor, migrate })).toThrow(
      'migration failed',
    )
    expect(existsSync(path)).toBe(true)
    vi.mocked(unlinkSync).mockImplementation(actualFs.unlinkSync)
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor, migrate })).toBe(false)
    expect(migrate).toHaveBeenCalledTimes(1)
    for (const suffix of ['', '-wal', '-shm']) expect(existsSync(`${path}${suffix}`)).toBe(false)
    expectNoRecoveryFiles(path)
  })

  it('cleans success leftovers without reverting the verified replacement', () => {
    const { path } = originalWithWal()
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (String(file) === `${path}.rollback`) throw new Error('cleanup denied')
      actualFs.unlinkSync(file)
    })
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(true)
    expect(existsSync(`${path}.restore_state`)).toBe(true)
    vi.mocked(unlinkSync).mockImplementation(actualFs.unlinkSync)
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(false)
    expect(open(path).prepare('SELECT title FROM tracks').pluck().all()).toEqual(['Replacement'])
    expectNoRecoveryFiles(path)
  })

  it.each([false, true])('refuses unidentified legacy recovery files (staged: %s)', (staged) => {
    const { path, original } = originalWithWal()
    for (const [file, content] of original) writeFileSync(`${file}.rollback`, content)
    if (!staged) actualFs.unlinkSync(`${path}.restore_staged`)
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'Unidentified database rollback files',
    )
    for (const [file, content] of original)
      expect(readFileSync(`${file}.rollback`)).toEqual(content)
    expectOriginal(path, original)
  })

  it.each([
    { phase: ['capturing'] },
    { phase: ['replacing'] },
    { phase: ['restored'] },
    { phase: ['verified'] },
    { phase: null },
    { phase: {} },
    { phase: 1 },
    { phase: true },
  ])('rejects a non-string JSON phase $phase without changing recovery files', ({ phase }) => {
    const { path, original } = originalWithWal()
    for (const [file, content] of original) writeFileSync(`${file}.rollback`, content)
    writeFileSync(path, 'partial replacement')
    writeFileSync(
      `${path}.restore_state`,
      JSON.stringify({ version: 1, phase, originalExists: [true, true, true] }),
    )
    const files = [
      ...original.keys(),
      ...[...original.keys()].map((file) => `${file}.rollback`),
      `${path}.restore_staged`,
      `${path}.restore_state`,
    ]
    const before = new Map(files.map((file) => [file, readFileSync(file)]))
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'Invalid database restore state',
    )
    for (const [file, content] of before) expect(readFileSync(file)).toEqual(content)
  })

  it('recovers all originals if persisting the completed rollback is denied', () => {
    const { path, original } = originalWithWal()
    vi.mocked(renameSync).mockImplementation((source, target) => {
      if (
        String(target) === `${path}.restore_state` &&
        readFileSync(source, 'utf8').includes('"restored"')
      )
        throw new Error('state rename denied')
      actualFs.renameSync(source, target)
    })
    expect(() =>
      applyStagedRestoreIfExists(path, {
        databaseCtor: DatabaseCtor,
        migrate: () => {
          throw new Error('migration failed')
        },
      }),
    ).toThrow('migration failed')
    for (const [file, content] of original)
      expect(readFileSync(`${file}.rollback`)).toEqual(content)
    vi.mocked(renameSync).mockImplementation(actualFs.renameSync)
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(false)
    expectOriginal(path, original)
    expectNoRecoveryFiles(path)
  })

  it.each(['capturing', 'replacing', 'verified'])(
    'preserves the original set if persisting %s is denied',
    (phase) => {
      const { path, original } = originalWithWal()
      vi.mocked(renameSync).mockImplementation((source, target) => {
        if (
          String(target) === `${path}.restore_state` &&
          readFileSync(source, 'utf8').includes(`"${phase}"`)
        )
          throw new Error('state rename denied')
        actualFs.renameSync(source, target)
      })
      expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
        'state rename denied',
      )
      expectOriginal(path, original)
      // Failed publication of the first state must not even begin capture.
      if (phase === 'capturing') {
        expect(existsSync(`${path}.restore_staged`)).toBe(true)
        expect(existsSync(`${path}.rollback`)).toBe(false)
      } else expectNoRecoveryFiles(path)
    },
  )

  it('does not discard a newly staged restore while verified cleanup remains denied', () => {
    const { path } = originalWithWal()
    vi.mocked(unlinkSync).mockImplementation((file) => {
      if (String(file) === `${path}.rollback`) throw new Error('cleanup denied')
      actualFs.unlinkSync(file)
    })
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(true)
    createStaged(path)
    const staged = readFileSync(`${path}.restore_staged`)
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'Previous verified database restore cleanup is incomplete',
    )
    expect(readFileSync(`${path}.restore_staged`)).toEqual(staged)
    expect(open(path).prepare('SELECT title FROM tracks').pluck().all()).toEqual(['Replacement'])
  })

  it('cleans an interrupted capture without copying its partial rollback into the original', () => {
    const { path, original } = originalWithWal()
    vi.mocked(copyFileSync).mockImplementation((source, target, mode) => {
      if (String(target) === `${path}-wal.rollback`) {
        writeFileSync(target, 'partial capture')
        throw new Error('capture denied')
      }
      actualFs.copyFileSync(source, target, mode)
    })
    expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
      'capture denied',
    )
    expect(readFileSync(`${path}-wal.rollback`, 'utf8')).toBe('partial capture')
    vi.mocked(copyFileSync).mockImplementation(actualFs.copyFileSync)
    expect(applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toBe(false)
    expectOriginal(path, original)
    expectNoRecoveryFiles(path)
  })
})
