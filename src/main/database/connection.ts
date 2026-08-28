import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { migrateDatabase } from './schema'
import { applyStagedRestoreIfExists } from './databaseBackupService'
import { logger } from '@main/logging/logger'

let database: Database.Database | undefined
let databasePath = ''

function copyLegacyDevDatabaseIfNeeded(targetPath: string): void {
  if (app.isPackaged || existsSync(targetPath)) return

  const legacyPath = join(app.getAppPath(), 'data', 'auralis.sqlite')
  if (!existsSync(legacyPath)) return

  const files = ['', '-shm', '-wal']
  for (const suffix of files) {
    const source = `${legacyPath}${suffix}`
    if (existsSync(source)) {
      copyFileSync(source, `${targetPath}${suffix}`)
    }
  }

  logger.info({ legacyPath, databasePath: targetPath }, 'Copied legacy dev SQLite database')
}

export function getDatabasePath(): string {
  if (!databasePath) {
    const dataDirectory = join(app.getPath('userData'), 'data')
    mkdirSync(dataDirectory, { recursive: true })
    databasePath = join(dataDirectory, 'auralis.sqlite')
    copyLegacyDevDatabaseIfNeeded(databasePath)
  }

  return databasePath
}

export function initializeDatabase(): Database.Database {
  if (database) {
    return database
  }

  const dbPath = getDatabasePath()
  applyStagedRestoreIfExists(dbPath)

  database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  const healthCheck = database.pragma('quick_check(1)', { simple: true })
  if (healthCheck !== 'ok') {
    logger.fatal(
      { healthCheck, databasePath: dbPath },
      'Database quick_check failed with corruption',
    )
    database.close()
    database = undefined
    throw new Error(`Database quick_check failed: ${String(healthCheck)}`)
  }

  migrateDatabase(database, dbPath)

  logger.info({ databasePath: dbPath }, 'SQLite initialized')

  return database
}

export function getDatabase(): Database.Database {
  if (!database) {
    throw new Error('Database has not been initialized')
  }

  return database
}

export function closeDatabase(): void {
  if (database) {
    database.close()
    database = undefined
  }
}
