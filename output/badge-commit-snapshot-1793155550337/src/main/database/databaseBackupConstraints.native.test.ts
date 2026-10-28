import { createRequire } from 'node:module'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrations } from './schemaMigrations'
import { migrateDatabase } from './schema'
import {
  applyStagedRestoreIfExists,
  validateBackupFile,
  type DatabaseConstructor,
} from './databaseBackupService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as DatabaseConstructor
let directory: string
const connections: Database.Database[] = []
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'auralis-backup-constraints-'))
})
afterEach(() => {
  for (const db of connections.splice(0)) if (db.open) db.close()
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('auralis-backup-constraints-')
  )
    throw new Error('Unsafe constraint fixture cleanup')
  rmSync(directory, { recursive: true, force: true })
})
function open(path: string) {
  const db = new DatabaseCtor(path)
  connections.push(db)
  return db
}
function backup(
  name: string,
  version: number = migrations.length,
  rewrite: (sql: string) => string = (sql) => sql,
  after?: string,
) {
  const path = join(directory, name + '.backup')
  const db = open(path)
  db.exec(
    'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  for (const migration of migrations.slice(0, version)) {
    db.exec(rewrite(migration.sql))
    db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
      migration.id,
      migration.name,
    )
  }
  if (after) db.exec(after)
  db.close()
  return path
}
it.each([1, 21, 28, migrations.length])(
  'accepts the real unique keys of schema version %i',
  (version) => {
    expect(validateBackupFile(backup(`version-${version}`, version), DatabaseCtor)).toEqual({
      ok: true,
    })
  },
)
it.each([
  [
    'file-path',
    (sql: string) => sql.replace('file_path TEXT NOT NULL UNIQUE', 'file_path TEXT NOT NULL'),
  ],
  ['album-identity', (sql: string) => sql.replace('UNIQUE(title, artist)', 'CHECK(1)')],
  [
    'root-path',
    (sql: string) =>
      sql.replace('\n        path TEXT NOT NULL UNIQUE', '\n        path TEXT NOT NULL'),
  ],
  [
    'collation',
    (sql: string) =>
      sql.replace(
        'file_path TEXT NOT NULL UNIQUE',
        'file_path TEXT NOT NULL COLLATE NOCASE UNIQUE',
      ),
  ],
] as const)('rejects incompatible %s uniqueness and keeps the original usable', (name, rewrite) => {
  const malformed = backup(name, migrations.length, rewrite)
  expect(validateBackupFile(malformed, DatabaseCtor)).toMatchObject({
    ok: false,
    error: expect.stringContaining('unique constraints'),
  })
  const path = join(directory, 'current.sqlite')
  const original = open(path)
  migrateDatabase(original)
  original.exec(
    "INSERT INTO tracks(file_path,title) VALUES('original.flac','Original'); INSERT INTO playlists(name) VALUES('Keep me')",
  )
  original.close()
  copyFileSync(malformed, `${path}.restore_staged`)
  expect(() => applyStagedRestoreIfExists(path, { databaseCtor: DatabaseCtor })).toThrow(
    'unique constraints',
  )
  const restored = open(path)
  expect(restored.prepare('SELECT title FROM tracks').pluck().all()).toEqual(['Original'])
  expect(restored.prepare('SELECT name FROM playlists').pluck().all()).toEqual(['Keep me'])
  restored
    .prepare(
      'INSERT INTO tracks(file_path,title) VALUES(?,?) ON CONFLICT(file_path) DO UPDATE SET title=excluded.title',
    )
    .run('original.flac', 'Still usable')
  expect(restored.prepare('SELECT title FROM tracks').pluck().get()).toBe('Still usable')
})
it('rejects a partial unique index that cannot satisfy the scan conflict target', () => {
  const path = backup(
    'partial-unique',
    migrations.length,
    (sql) => sql.replace('file_path TEXT NOT NULL UNIQUE', 'file_path TEXT NOT NULL'),
    'CREATE UNIQUE INDEX partial_file_path ON tracks(file_path) WHERE id > 1',
  )
  expect(validateBackupFile(path, DatabaseCtor)).toMatchObject({ ok: false })
})
it('rejects an extra unique constraint that would reject legal library data', () => {
  const path = backup(
    'extra-unique',
    migrations.length,
    undefined,
    'CREATE UNIQUE INDEX extra_artist ON tracks(artist)',
  )
  expect(validateBackupFile(path, DatabaseCtor)).toMatchObject({ ok: false })
})
it('rejects changed properties of an existing named index', () => {
  const path = backup(
    'partial-named-index',
    migrations.length,
    undefined,
    "DROP INDEX idx_tracks_album; CREATE INDEX idx_tracks_album ON tracks(album) WHERE availability = 'available'",
  )
  expect(validateBackupFile(path, DatabaseCtor)).toMatchObject({
    ok: false,
    error: expect.stringContaining('index'),
  })
})
it('allows an additional nonrestrictive performance index', () => {
  const path = backup(
    'extra-ordinary-index',
    migrations.length,
    undefined,
    'CREATE INDEX extra_title ON tracks(title)',
  )
  expect(validateBackupFile(path, DatabaseCtor)).toEqual({ ok: true })
})
