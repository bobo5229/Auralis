import Database from 'better-sqlite3'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { migrations } from './schemaMigrations'

const SQLITE_HEADER_STRING = 'SQLite format 3'
const SQLITE_HEADER_BYTES = 16

export interface ValidateBackupResult {
  ok: boolean
  error?: string
}

export type DatabaseConstructor = new (
  path: string,
  options?: Database.Options,
) => Database.Database

/**
 * Validates whether the given file is an authentic, non-corrupt, and schema-compatible Auralis SQLite backup.
 */
export function validateBackupFile(
  filePath: string,
  databaseCtor: DatabaseConstructor = Database,
): ValidateBackupResult {
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: 'Backup file does not exist.' }
    }

    const stats = statSync(filePath)
    if (!stats.isFile()) {
      return { ok: false, error: 'Selected path is not a file.' }
    }

    if (stats.size < 100) {
      return { ok: false, error: 'File size is too small to be a valid SQLite database.' }
    }

    const fd = openSync(filePath, 'r')
    const headerBuf = Buffer.alloc(SQLITE_HEADER_BYTES)
    try {
      readSync(fd, headerBuf, 0, SQLITE_HEADER_BYTES, 0)
    } finally {
      closeSync(fd)
    }

    const headerStr = headerBuf.toString('utf8', 0, 15)
    if (headerStr !== SQLITE_HEADER_STRING) {
      return { ok: false, error: 'Invalid SQLite file header signature.' }
    }

    const testDb = new databaseCtor(filePath, { readonly: true, fileMustExist: true })
    try {
      const checkResult = testDb.pragma('quick_check(1)', { simple: true })
      if (checkResult !== 'ok') {
        return { ok: false, error: `SQLite quick_check failed: ${String(checkResult)}` }
      }

      assertBackupSchema(testDb, databaseCtor)
    } finally {
      testDb.close()
    }

    return { ok: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: errorMsg }
  }
}

export function assertBackupSchema(
  db: Database.Database,
  DatabaseCtor: new (path: string, options?: Database.Options) => Database.Database,
): void {
  const hasHistory = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get()
  if (!hasHistory) throw new Error('Database does not contain expected Auralis tables.')
  const history = db
    .prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id')
    .all() as {
    id: number
    name: string
  }[]
  if (
    !history.length ||
    history.length > migrations.length ||
    history.some(
      (entry, index) =>
        entry.id !== migrations[index]?.id || entry.name !== migrations[index]?.name,
    )
  ) {
    throw new Error('Unsupported or incomplete Auralis migration history.')
  }
  const expected = new DatabaseCtor(':memory:')
  try {
    for (const migration of migrations.slice(0, history.length)) expected.exec(migration.sql)
    const objects = expected
      .prepare("SELECT name, type, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
      .all() as { name: string; type: string; tbl_name: string }[]
    const lookup = db.prepare('SELECT type, tbl_name FROM sqlite_master WHERE name = ?')
    const columns = (connection: Database.Database, name: string) =>
      connection
        .prepare('SELECT name, type, "notnull", pk FROM pragma_table_info(?)')
        .all(name) as { name: string; type: string; notnull: number; pk: number }[]
    for (const object of objects) {
      const actual = lookup.get(object.name) as { type: string; tbl_name: string } | undefined
      if (actual?.type !== object.type || actual.tbl_name !== object.tbl_name)
        throw new Error('Missing or incompatible Auralis schema object: ' + object.name)
      if (object.type === 'table' || object.type === 'view') {
        const actualColumns = new Map(
          columns(db, object.name).map((column) => [column.name, column]),
        )
        for (const column of columns(expected, object.name)) {
          if (JSON.stringify(actualColumns.get(column.name)) !== JSON.stringify(column))
            throw new Error(
              'Missing or incompatible Auralis column: ' + object.name + '.' + column.name,
            )
        }
      }
      if (object.type === 'table') {
        const references = (connection: Database.Database) =>
          connection.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(object.name)
        if (JSON.stringify(references(db)) !== JSON.stringify(references(expected)))
          throw new Error('Incompatible Auralis foreign keys: ' + object.name)
      }
      if (object.type === 'index') {
        const index = (connection: Database.Database) =>
          connection
            .prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno')
            .all(object.name)
        if (JSON.stringify(index(db)) !== JSON.stringify(index(expected)))
          throw new Error('Incompatible Auralis index: ' + object.name)
      }
    }
    if (db.prepare('SELECT * FROM pragma_foreign_key_check LIMIT 1').get())
      throw new Error('Auralis backup contains broken foreign key references.')
  } finally {
    expected.close()
  }
}
