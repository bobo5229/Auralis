import Database from 'better-sqlite3'
import { validateBackupFile, type DatabaseConstructor } from './databaseBackupValidation'
import { applyStagedDatabaseRestore } from './databaseBackupRestore'
import { removeTemporarySnapshot } from './databaseBackupSnapshots'

import { migrateDatabase } from './schema'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/logging/logger'
import type { DatabaseExportBackupResult, DatabaseRestoreBackupResult } from '@shared/ipc/contracts'

export { validateBackupFile } from './databaseBackupValidation'
export type { DatabaseConstructor, ValidateBackupResult } from './databaseBackupValidation'
export { createPreMigrationBackup, prunePreMigrationBackups } from './databaseBackupSnapshots'
export type { PreMigrationBackupOptions } from './databaseBackupSnapshots'

export interface ExportBackupOptions {
  db: Database.Database
  databasePath: string
  showSaveDialog?: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
}

/**
 * Exports a consistent SQLite snapshot, including committed data still in WAL.
 */
export async function exportDatabaseBackup(
  options: ExportBackupOptions,
): Promise<DatabaseExportBackupResult> {
  let tempTargetPath: string | null = null
  try {
    const { db, databasePath, showSaveDialog } = options
    if (!showSaveDialog) {
      return { status: 'failed', error: 'Save dialog provider is unavailable.' }
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const dialogResult = await showSaveDialog({
      title: '导出数据库备份',
      defaultPath: `auralis-backup-${dateStr}.backup`,
      filters: [{ name: 'Auralis Database Backup (*.backup)', extensions: ['backup', 'sqlite'] }],
    })

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { status: 'cancelled' }
    }

    const targetPath = dialogResult.filePath

    const targetDir = dirname(targetPath)
    mkdirSync(targetDir, { recursive: true })

    tempTargetPath = `${targetPath}.tmp-${randomUUID()}`
    // A reader can prevent checkpoint completion without throwing. SQLite's
    // backup API reads a consistent database snapshot directly, including WAL.
    await db.backup(tempTargetPath)
    renameSync(tempTargetPath, targetPath)

    logger.info({ databasePath, targetPath }, 'Exported database backup successfully')
    return { status: 'saved', targetPath }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error({ error, databasePath: options.databasePath }, 'Failed to export database backup')
    return { status: 'failed', error: errorMsg }
  } finally {
    if (tempTargetPath && existsSync(tempTargetPath)) {
      try {
        unlinkSync(tempTargetPath)
      } catch (error) {
        logger.warn({ error, tempTargetPath }, 'Failed to remove incomplete export backup')
      }
    }
  }
}

export interface StageRestoreOptions {
  currentDbPath: string
  showOpenDialog?: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
  databaseCtor?: DatabaseConstructor
}

/**
 * Pre-checks and stages a verified backup file for restore on next startup.
 */
export async function stageDatabaseRestore(
  options: StageRestoreOptions,
): Promise<DatabaseRestoreBackupResult> {
  let tempStagedPath: string | null = null
  try {
    const { currentDbPath, showOpenDialog, databaseCtor } = options
    if (!showOpenDialog) {
      return { status: 'failed', error: 'Open dialog provider is unavailable.' }
    }

    const dialogResult = await showOpenDialog({
      title: '选择要恢复的数据库备份',
      properties: ['openFile'],
      filters: [
        {
          name: 'Auralis Database Backup (*.backup, *.sqlite)',
          extensions: ['backup', 'sqlite', 'db'],
        },
      ],
    })

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { status: 'cancelled' }
    }

    const selectedPath = dialogResult.filePaths[0]
    const stagedPath = `${currentDbPath}.restore_staged`
    tempStagedPath = `${stagedPath}.tmp-${randomUUID()}`
    mkdirSync(dirname(stagedPath), { recursive: true })

    const source = new (databaseCtor ?? Database)(selectedPath, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      // The selected file may be a live database whose committed rows are in WAL.
      await source.backup(tempStagedPath)
    } finally {
      source.close()
    }

    const validation = validateBackupFile(tempStagedPath, databaseCtor)
    if (!validation.ok) {
      logger.warn({ selectedPath, error: validation.error }, 'Rejected invalid restore backup file')
      return { status: 'failed', error: validation.error ?? 'Validation failed' }
    }

    renameSync(tempStagedPath, stagedPath)

    logger.info({ selectedPath, stagedPath }, 'Staged database restore file successfully')
    return { status: 'staged', requiresRestart: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(
      { error, currentDbPath: options.currentDbPath },
      'Failed to stage database restore',
    )
    return { status: 'failed', error: errorMsg }
  } finally {
    removeTemporarySnapshot(tempStagedPath)
  }
}

/** Applies a staged restore before the application opens its database. */
export function applyStagedRestoreIfExists(
  databasePath: string,
  options?: { databaseCtor?: DatabaseConstructor; migrate?: (db: Database.Database) => void },
): boolean {
  return applyStagedDatabaseRestore(databasePath, {
    databaseCtor: options?.databaseCtor ?? Database,
    migrate: options?.migrate ?? migrateDatabase,
  })
}
