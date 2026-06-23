import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { migrateDatabase } from './schema'
import { logger } from '@main/logging/logger'

let database: Database.Database | undefined
let databasePath = ''

export function getDatabasePath(): string {
  if (!databasePath) {
    const dataRoot = app.isPackaged ? app.getPath('userData') : app.getAppPath()
    const dataDirectory = join(dataRoot, 'data')
    mkdirSync(dataDirectory, { recursive: true })
    databasePath = join(dataDirectory, 'auralis.sqlite')
  }

  return databasePath
}

export function initializeDatabase(): Database.Database {
  if (database) {
    return database
  }

  database = new Database(getDatabasePath())
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  migrateDatabase(database)

  logger.info({ databasePath }, 'SQLite initialized')

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
