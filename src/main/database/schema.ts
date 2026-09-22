import type Database from 'better-sqlite3'
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { createPreMigrationBackup } from './databaseBackupService'

import { migrations } from './schemaMigrations'

function resolveBackupsDir(databasePath?: string, customBackupsDir?: string): string | undefined {
  if (customBackupsDir) return customBackupsDir
  try {
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'backups')
    }
  } catch {
    // app is not available in standalone tests
  }
  if (databasePath && databasePath !== ':memory:') {
    return join(dirname(databasePath), '..', 'backups')
  }
  return undefined
}

export function migrateDatabase(
  db: Database.Database,
  databasePath?: string,
  backupsDir?: string,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const hasMigration = db
    .prepare('SELECT 1 FROM schema_migrations WHERE id = ?')
    .pluck() as Database.Statement<[number], 1 | undefined>

  const pendingMigrations = migrations.filter((migration) => !hasMigration.get(migration.id))

  if (pendingMigrations.length > 0 && databasePath && databasePath !== ':memory:') {
    const resolvedBackupsDir = resolveBackupsDir(databasePath, backupsDir)
    if (resolvedBackupsDir) {
      createPreMigrationBackup({
        db,
        databasePath,
        targetVersion: pendingMigrations[0].id,
        backupsDir: resolvedBackupsDir,
      })
    }
  }

  const insertMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)')

  const runMigration = db.transaction((migration: (typeof migrations)[number]) => {
    db.exec(migration.sql)
    insertMigration.run(migration.id, migration.name)
  })

  for (const migration of pendingMigrations) {
    runMigration(migration)
  }
}
