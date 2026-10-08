import type Database from 'better-sqlite3'
import { logger } from '@main/logging/logger'
import {
  assertBackupSchema,
  validateBackupFile,
  type DatabaseConstructor,
} from './databaseBackupValidation'
import { DatabaseRestoreFiles } from './databaseRestoreFiles'

interface RestoreDependencies {
  databaseCtor: DatabaseConstructor
  migrate: (db: Database.Database) => void
}

function migrateAndVerifyRestore(databasePath: string, dependencies: RestoreDependencies): void {
  const { databaseCtor, migrate } = dependencies
  const db = new databaseCtor(databasePath, { fileMustExist: true })
  try {
    db.pragma('foreign_keys = ON')
    migrate(db)
    assertBackupSchema(db, databaseCtor)
    const result = db.pragma('quick_check(1)', { simple: true })
    if (result !== 'ok') throw new Error(`Corrupt restored database quick_check: ${String(result)}`)
  } finally {
    db.close()
  }
}

/** Runs before the application opens its database; original copies survive until verification. */
export function applyStagedDatabaseRestore(
  databasePath: string,
  dependencies: RestoreDependencies,
): boolean {
  const files = new DatabaseRestoreFiles(databasePath)
  if (!files.hasStagedRestore()) return false

  logger.info(
    { stagedPath: files.stagedPath, databasePath },
    'Detected staged database restore; applying atomic swap',
  )
  try {
    files.captureOriginal()
    const validation = validateBackupFile(files.stagedPath, dependencies.databaseCtor)
    if (!validation.ok) throw new Error(validation.error)

    files.replaceFromStaged()
    migrateAndVerifyRestore(databasePath, dependencies)
    files.cleanupVerifiedRestore((error, path) => {
      logger.warn({ error, path }, 'Restore succeeded; rollback cleanup deferred')
    })
    logger.info({ databasePath }, 'Staged database restore applied and verified successfully')
    return true
  } catch (error) {
    logger.error(
      { error, databasePath },
      'Failed to apply staged database restore; executing rollback',
    )
    try {
      files.rollback()
    } catch (rollbackError) {
      logger.error({ rollbackError }, 'Catastrophic error during database restore rollback')
    }
    throw new Error(
      `Failed to apply staged database restore: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
