import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import {
  applyStagedRestoreIfExists,
  exportDatabaseBackup,
  prunePreMigrationBackups,
  stageDatabaseRestore,
  validateBackupFile,
} from './databaseBackupService'
import { migrateDatabase } from './schema'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
  options?: Database.Options,
) => Database.Database

describe('databaseBackupService', () => {
  let tempDir: string
  let openDatabases: Database.Database[] = []

  function openDb(path: string, options?: Database.Options): Database.Database {
    const db = new DatabaseCtor(path, options)
    openDatabases.push(db)
    return db
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'auralis-backup-test-'))
    openDatabases = []
  })

  afterEach(() => {
    for (const db of openDatabases) {
      try {
        db.close()
      } catch {
        // already closed
      }
    }
    openDatabases = []
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('validateBackupFile', () => {
    it('returns error for non-existent file', () => {
      const result = validateBackupFile(join(tempDir, 'does-not-exist.backup'), DatabaseCtor)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('does not exist')
    })

    it('rejects files smaller than minimum SQLite size', () => {
      const filePath = join(tempDir, 'too-small.backup')
      writeFileSync(filePath, Buffer.from('too short'))
      const result = validateBackupFile(filePath, DatabaseCtor)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('File size is too small to be a valid SQLite database')
    })

    it('rejects files without SQLite header signature', () => {
      const filePath = join(tempDir, 'invalid-header.backup')
      const buffer = Buffer.alloc(256)
      buffer.write('This is definitely not a SQLite database header, but long enough!')
      writeFileSync(filePath, buffer)
      const result = validateBackupFile(filePath, DatabaseCtor)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Invalid SQLite file header signature')
    })

    it('rejects unrelated SQLite database without Auralis tables', () => {
      const filePath = join(tempDir, 'unrelated.sqlite')
      const db = openDb(filePath)
      db.exec('CREATE TABLE some_random_table (id INTEGER PRIMARY KEY, content TEXT);')
      db.close()

      const result = validateBackupFile(filePath, DatabaseCtor)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Database does not contain expected Auralis tables')
    })

    it('accepts valid Auralis database backup', () => {
      const filePath = join(tempDir, 'valid.backup')
      const db = openDb(filePath)
      migrateDatabase(db)
      db.close()

      const result = validateBackupFile(filePath, DatabaseCtor)
      expect(result.ok).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('exportDatabaseBackup', () => {
    it('checkpoints WAL and exports consistent backup file to selected location', async () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const db = openDb(dbPath)
      db.pragma('journal_mode = WAL')
      migrateDatabase(db)

      db.prepare(
        "INSERT INTO tracks (id, file_path, title) VALUES (1, 'path/a.flac', 'Track A')",
      ).run()

      const targetBackupPath = join(tempDir, 'exports', 'my-backup.backup')

      const result = await exportDatabaseBackup({
        db,
        databasePath: dbPath,
        showSaveDialog: async () => ({
          canceled: false,
          filePath: targetBackupPath,
        }),
      })

      expect(result.status).toBe('saved')
      expect(result.targetPath).toBe(targetBackupPath)
      expect(existsSync(targetBackupPath)).toBe(true)

      const validation = validateBackupFile(targetBackupPath, DatabaseCtor)
      expect(validation.ok).toBe(true)

      const backupDb = openDb(targetBackupPath, { readonly: true })
      const track = backupDb.prepare('SELECT title FROM tracks WHERE id = 1').get() as {
        title: string
      }
      expect(track.title).toBe('Track A')
    })

    it('returns cancelled status when user cancels dialog', async () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const db = openDb(dbPath)

      const result = await exportDatabaseBackup({
        db,
        databasePath: dbPath,
        showSaveDialog: async () => ({
          canceled: true,
          filePath: '',
        }),
      })

      expect(result.status).toBe('cancelled')
    })
  })

  describe('stageDatabaseRestore', () => {
    it('stages a verified backup file into .restore_staged', async () => {
      const validBackupPath = join(tempDir, 'source-valid.backup')
      const sourceDb = openDb(validBackupPath)
      migrateDatabase(sourceDb)
      sourceDb
        .prepare("INSERT INTO tracks (id, file_path, title) VALUES (99, 'p/99.flac', 'Staged 99')")
        .run()
      sourceDb.close()

      const currentDbPath = join(tempDir, 'auralis.sqlite')

      const result = await stageDatabaseRestore({
        currentDbPath,
        databaseCtor: DatabaseCtor,
        showOpenDialog: async () => ({
          canceled: false,
          filePaths: [validBackupPath],
        }),
      })

      expect(result.status).toBe('staged')
      expect(result.requiresRestart).toBe(true)

      const stagedPath = `${currentDbPath}.restore_staged`
      expect(existsSync(stagedPath)).toBe(true)

      const validation = validateBackupFile(stagedPath, DatabaseCtor)
      expect(validation.ok).toBe(true)
    })

    it('rejects invalid backup and does not create staged file', async () => {
      const invalidPath = join(tempDir, 'bad.backup')
      writeFileSync(invalidPath, 'corrupted file content')

      const currentDbPath = join(tempDir, 'auralis.sqlite')

      const result = await stageDatabaseRestore({
        currentDbPath,
        databaseCtor: DatabaseCtor,
        showOpenDialog: async () => ({
          canceled: false,
          filePaths: [invalidPath],
        }),
      })

      expect(result.status).toBe('failed')
      expect(existsSync(`${currentDbPath}.restore_staged`)).toBe(false)
    })
  })

  describe('applyStagedRestoreIfExists', () => {
    it('returns false when no staged restore exists', () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const applied = applyStagedRestoreIfExists(dbPath, { databaseCtor: DatabaseCtor })
      expect(applied).toBe(false)
    })

    it('atomically swaps staged restore and verifies data with rollback cleanup', () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const oldDb = openDb(dbPath)
      migrateDatabase(oldDb)
      oldDb
        .prepare("INSERT INTO tracks (id, file_path, title) VALUES (1, 'p/1.flac', 'Old Track')")
        .run()
      oldDb.close()

      // Create a valid staged file with different data
      const stagedSourcePath = join(tempDir, 'new.backup')
      const newDb = openDb(stagedSourcePath)
      migrateDatabase(newDb)
      newDb
        .prepare("INSERT INTO tracks (id, file_path, title) VALUES (2, 'p/2.flac', 'New Track')")
        .run()
      newDb.close()

      copyFileSync(stagedSourcePath, `${dbPath}.restore_staged`)

      const applied = applyStagedRestoreIfExists(dbPath, { databaseCtor: DatabaseCtor })
      expect(applied).toBe(true)
      expect(existsSync(`${dbPath}.restore_staged`)).toBe(false)
      expect(existsSync(`${dbPath}.rollback`)).toBe(false)

      const restoredDb = openDb(dbPath)
      const row = restoredDb.prepare('SELECT title FROM tracks WHERE id = 2').get() as {
        title: string
      }
      expect(row.title).toBe('New Track')
      expect(restoredDb.prepare('SELECT id FROM tracks WHERE id = 1').get()).toBeUndefined()
    })

    it('rolls back to original database if staged file fails quick_check verification', () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const originalDb = openDb(dbPath)
      migrateDatabase(originalDb)
      originalDb
        .prepare("INSERT INTO tracks (id, file_path, title) VALUES (10, 'p/10.flac', 'Original')")
        .run()
      originalDb.close()

      // Create a corrupted staged file (header valid but body corrupted)
      const corruptedStagedPath = `${dbPath}.restore_staged`
      const corruptedBuf = Buffer.alloc(1024)
      corruptedBuf.write('SQLite format 3\0', 0, 'utf8')
      writeFileSync(corruptedStagedPath, corruptedBuf)

      expect(() => {
        applyStagedRestoreIfExists(dbPath, { databaseCtor: DatabaseCtor })
      }).toThrow()

      // Original database must be preserved via rollback
      const currentDb = openDb(dbPath)
      const row = currentDb.prepare('SELECT title FROM tracks WHERE id = 10').get() as {
        title: string
      }
      expect(row.title).toBe('Original')
      expect(existsSync(`${dbPath}.rollback`)).toBe(false)
      expect(existsSync(corruptedStagedPath)).toBe(false)
    })
  })

  describe('createPreMigrationBackup and retention policy', () => {
    it('creates pre-migration backup before pending migrations run', () => {
      const dbPath = join(tempDir, 'auralis.sqlite')
      const backupsDir = join(tempDir, 'backups')

      const db = openDb(dbPath)
      db.pragma('journal_mode = WAL')
      // Run partial schema (migration 1)
      db.exec(`
        CREATE TABLE tracks (
          id INTEGER PRIMARY KEY,
          file_path TEXT NOT NULL UNIQUE,
          title TEXT,
          artist TEXT,
          album TEXT,
          duration_seconds REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO schema_migrations (id, name) VALUES (1, 'initial_library_schema');
      `)

      migrateDatabase(db, dbPath, backupsDir)

      const files = readdirSync(backupsDir)
      const preMigrationFiles = files.filter(
        (f) => f.startsWith('pre-migration-v') && f.endsWith('.backup'),
      )
      expect(preMigrationFiles.length).toBe(1)
      expect(preMigrationFiles[0]).toContain('pre-migration-v2')
    })

    it('enforces retention policy keeping at most 5 recent backups', () => {
      const backupsDir = join(tempDir, 'backups')
      mkdirSync(backupsDir, { recursive: true })

      // Create 8 dummy pre-migration backup files with stepped modification timestamps
      const baseTime = Date.now() - 100000
      for (let i = 1; i <= 8; i++) {
        const filePath = join(backupsDir, `pre-migration-v${i}-${baseTime + i * 1000}.backup`)
        writeFileSync(filePath, `backup-data-${i}`)
        const timeSec = (baseTime + i * 1000) / 1000
        utimesSync(filePath, timeSec, timeSec)
      }

      expect(readdirSync(backupsDir).length).toBe(8)

      prunePreMigrationBackups(backupsDir, 5)

      const remainingFiles = readdirSync(backupsDir).sort()
      expect(remainingFiles.length).toBe(5)

      // The oldest 3 (v1, v2, v3) should be pruned, v4-v8 kept
      expect(remainingFiles.some((f) => f.includes('pre-migration-v1-'))).toBe(false)
      expect(remainingFiles.some((f) => f.includes('pre-migration-v2-'))).toBe(false)
      expect(remainingFiles.some((f) => f.includes('pre-migration-v3-'))).toBe(false)
      expect(remainingFiles.some((f) => f.includes('pre-migration-v8-'))).toBe(true)
    })
  })
})
