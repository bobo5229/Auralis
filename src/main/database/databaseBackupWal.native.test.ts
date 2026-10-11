import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyStagedRestoreIfExists,
  createPreMigrationBackup,
  stageDatabaseRestore,
  validateBackupFile,
} from './databaseBackupService'
import { migrateDatabase } from './schema'
import { migrations } from './schemaMigrations'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
let tempDir: string
const connections: Database.Database[] = []

function open(path: string, options?: Database.Options): Database.Database {
  const db = new DatabaseCtor(path, options)
  connections.push(db)
  return db
}

function createWalDatabase(path: string, version: number = migrations.length): Database.Database {
  const db = open(path)
  db.pragma('journal_mode = WAL')
  db.pragma('wal_autocheckpoint = 0')
  db.pragma('busy_timeout = 0')
  db.exec(`CREATE TABLE schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  for (const migration of migrations.slice(0, version)) {
    db.exec(migration.sql)
    db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
      migration.id,
      migration.name,
    )
  }
  db.exec("INSERT INTO tracks(id,file_path,title) VALUES(1,'base.flac','Base track')")
  db.pragma('wal_checkpoint(TRUNCATE)')
  return db
}

function addCommittedWalData(db: Database.Database): void {
  db.exec(`
    INSERT INTO playlists(id,name) VALUES(1,'Keep my playlist');
    INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0);
    INSERT INTO track_play_stats(track_id,play_count,last_played_at)
      VALUES(1,9,'2026-10-09T00:00:00Z');
  `)
}

function userData(db: Database.Database) {
  return {
    playlists: db.prepare('SELECT COUNT(*) FROM playlists').pluck().get(),
    members: db.prepare('SELECT COUNT(*) FROM playlist_tracks').pluck().get(),
    plays: db.prepare('SELECT COALESCE(SUM(play_count),0) FROM track_play_stats').pluck().get(),
  }
}

function holdOldReader(path: string): Database.Database {
  const reader = open(path, { readonly: true })
  reader.exec('BEGIN')
  expect(userData(reader)).toEqual({ playlists: 0, members: 0, plays: 0 })
  return reader
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'auralis-backup-wal-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const db of connections) if (db.open) db.close()
  connections.length = 0
  rmSync(tempDir, { recursive: true, force: true })
})

describe('complete WAL backup snapshots', () => {
  it.each(['current', 'other'])(
    'stages committed WAL from a live %s database and restores it',
    async (selection) => {
      const sourcePath = join(tempDir, 'source.sqlite')
      const currentDbPath = selection === 'current' ? sourcePath : join(tempDir, 'current.sqlite')
      const db = createWalDatabase(sourcePath)
      const reader = holdOldReader(sourcePath)
      addCommittedWalData(db)
      expect(db.pragma('wal_checkpoint(TRUNCATE)')).toMatchObject([{ busy: 1 }])

      const result = await stageDatabaseRestore({
        currentDbPath,
        databaseCtor: DatabaseCtor,
        showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePath] }),
      })

      expect(result).toEqual({ status: 'staged', requiresRestart: true })
      const stagedPath = `${currentDbPath}.restore_staged`
      expect(validateBackupFile(stagedPath, DatabaseCtor)).toEqual({ ok: true })
      expect(userData(open(stagedPath, { readonly: true }))).toEqual({
        playlists: 1,
        members: 1,
        plays: 9,
      })
      expect(userData(db)).toEqual({ playlists: 1, members: 1, plays: 9 })
      expect(userData(reader)).toEqual({ playlists: 0, members: 0, plays: 0 })
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      db.exec('UPDATE track_play_stats SET play_count = 10 WHERE track_id = 1')
      reader.exec('ROLLBACK')
      for (const connection of connections) if (connection.open) connection.close()

      expect(applyStagedRestoreIfExists(currentDbPath, { databaseCtor: DatabaseCtor })).toBe(true)
      expect(userData(open(currentDbPath, { readonly: true }))).toEqual({
        playlists: 1,
        members: 1,
        plays: 9,
      })
      if (selection === 'other') {
        expect(userData(open(sourcePath, { readonly: true }))).toEqual({
          playlists: 1,
          members: 1,
          plays: 10,
        })
      }
      expect(readdirSync(tempDir).filter((name) => name.includes('.tmp-'))).toEqual([])
    },
  )

  it('validates the actual staged snapshot and retains previous staging on rejection', async () => {
    const path = join(tempDir, 'source.sqlite')
    const source = createWalDatabase(path)
    const stagedPath = `${path}.restore_staged`
    writeFileSync(stagedPath, 'previous staging')
    vi.spyOn(DatabaseCtor.prototype, 'backup').mockImplementationOnce(async (target) => {
      const invalidSnapshot = open(target)
      invalidSnapshot.exec('CREATE TABLE unrelated(value TEXT)')
      invalidSnapshot.close()
      return { totalPages: 2, remainingPages: 0 }
    })

    expect(validateBackupFile(path, DatabaseCtor)).toEqual({ ok: true })
    const result = await stageDatabaseRestore({
      currentDbPath: path,
      databaseCtor: DatabaseCtor,
      showOpenDialog: async () => ({ canceled: false, filePaths: [path] }),
    })
    expect(result.status).toBe('failed')
    expect(readFileSync(stagedPath, 'utf8')).toBe('previous staging')
    expect(userData(source)).toEqual({ playlists: 0, members: 0, plays: 0 })
    expect(readdirSync(tempDir).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('cleans failed snapshot files and sidecars without replacing previous staging', async () => {
    const path = join(tempDir, 'source.sqlite')
    createWalDatabase(path)
    writeFileSync(`${path}.restore_staged`, 'previous staging')
    vi.spyOn(DatabaseCtor.prototype, 'backup').mockImplementationOnce(async (target) => {
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        writeFileSync(`${target}${suffix}`, 'partial')
      throw new Error('snapshot interrupted')
    })

    const result = await stageDatabaseRestore({
      currentDbPath: path,
      databaseCtor: DatabaseCtor,
      showOpenDialog: async () => ({ canceled: false, filePaths: [path] }),
    })
    expect(result).toMatchObject({ status: 'failed', error: 'snapshot interrupted' })
    expect(readFileSync(`${path}.restore_staged`, 'utf8')).toBe('previous staging')
    expect(readdirSync(tempDir).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('backs up the complete older schema and committed WAL before synchronous migration', () => {
    const path = join(tempDir, 'source.sqlite')
    const db = createWalDatabase(path, migrations.length - 1)
    const reader = holdOldReader(path)
    addCommittedWalData(db)
    expect(db.pragma('wal_checkpoint(TRUNCATE)')).toMatchObject([{ busy: 1 }])
    const backupsDir = join(tempDir, 'backups')

    migrateDatabase(db, path, backupsDir)

    const files = readdirSync(backupsDir)
    expect(files).toHaveLength(1)
    const backupPath = join(backupsDir, files[0])
    expect(backupPath).toMatch(/\.backup$/)
    expect(validateBackupFile(backupPath, DatabaseCtor)).toEqual({ ok: true })
    const backup = open(backupPath, { readonly: true })
    expect(backup.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(
      migrations.length - 1,
    )
    expect(userData(backup)).toEqual({ playlists: 1, members: 1, plays: 9 })
    expect(userData(db)).toEqual({ playlists: 1, members: 1, plays: 9 })
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(
      migrations.length,
    )
    expect(userData(reader)).toEqual({ playlists: 0, members: 0, plays: 0 })
    reader.exec('ROLLBACK')
  })

  it('does not report or retain an incomplete migration backup when snapshot creation fails', () => {
    const path = join(tempDir, 'source.sqlite')
    const db = createWalDatabase(path)
    const backupsDir = join(tempDir, 'backups')
    mkdirSync(backupsDir)
    const previousPath = join(backupsDir, 'pre-migration-v1-previous.backup')
    writeFileSync(previousPath, 'keep previous backup')
    db.exec('BEGIN')

    const result = createPreMigrationBackup({
      db,
      databasePath: path,
      targetVersion: 2,
      backupsDir,
      maxBackups: 0,
    })

    expect(result).toBeNull()
    expect(readFileSync(previousPath, 'utf8')).toBe('keep previous backup')
    expect(readdirSync(backupsDir)).toEqual(['pre-migration-v1-previous.backup'])
    db.exec('ROLLBACK')
    expect(existsSync(path)).toBe(true)
  })
})
