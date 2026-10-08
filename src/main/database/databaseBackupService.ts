import Database from 'better-sqlite3'
import { validateBackupFile, type DatabaseConstructor } from './databaseBackupValidation'
import { applyStagedDatabaseRestore } from './databaseBackupRestore'

import { migrateDatabase } from './schema'
import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { logger } from '@main/logging/logger'
import type { DatabaseExportBackupResult, DatabaseRestoreBackupResult } from '@shared/ipc/contracts'

export { validateBackupFile } from './databaseBackupValidation'
export type { DatabaseConstructor, ValidateBackupResult } from './databaseBackupValidation'

const MAX_PRE_MIGRATION_BACKUPS = 5

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
    const validation = validateBackupFile(selectedPath, databaseCtor)
    if (!validation.ok) {
      logger.warn({ selectedPath, error: validation.error }, 'Rejected invalid restore backup file')
      return { status: 'failed', error: validation.error ?? 'Validation failed' }
    }

    const stagedPath = `${currentDbPath}.restore_staged`
    const tempStagedPath = `${stagedPath}.tmp-${Date.now()}`

    mkdirSync(dirname(stagedPath), { recursive: true })
    copyFileSync(selectedPath, tempStagedPath)
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

export interface PreMigrationBackupOptions {
  db: Database.Database
  databasePath: string
  targetVersion: number
  backupsDir: string
  maxBackups?: number
}

/**
 * Creates an atomic consistent backup before database migrations and enforces retention policy.
 */
export function createPreMigrationBackup(options: PreMigrationBackupOptions): string | null {
  const {
    db,
    databasePath,
    targetVersion,
    backupsDir,
    maxBackups = MAX_PRE_MIGRATION_BACKUPS,
  } = options

  if (!databasePath || databasePath === ':memory:' || !existsSync(databasePath)) {
    return null
  }

  try {
    mkdirSync(backupsDir, { recursive: true })

    // Checkpoint WAL before copying
    db.pragma('wal_checkpoint(TRUNCATE)')

    const timestamp = Date.now()
    const backupFileName = `pre-migration-v${targetVersion}-${timestamp}.backup`
    const backupPath = join(backupsDir, backupFileName)
    const tempBackupPath = `${backupPath}.tmp`

    copyFileSync(databasePath, tempBackupPath)
    renameSync(tempBackupPath, backupPath)

    logger.info({ backupPath, targetVersion }, 'Created pre-migration database backup')

    prunePreMigrationBackups(backupsDir, maxBackups)

    return backupPath
  } catch (error) {
    logger.error({ error, databasePath, targetVersion }, 'Failed to create pre-migration backup')
    return null
  }
}

/**
 * Retains only the most recent N pre-migration backups, safely deleting older ones.
 */
export function prunePreMigrationBackups(
  backupsDir: string,
  maxBackups: number = MAX_PRE_MIGRATION_BACKUPS,
): void {
  if (!existsSync(backupsDir)) return

  try {
    const files = readdirSync(backupsDir)
    const migrationBackups = files
      .filter((file) => file.startsWith('pre-migration-') && file.endsWith('.backup'))
      .map((fileName) => {
        const fullPath = join(backupsDir, fileName)
        let mtimeMs = 0
        try {
          mtimeMs = statSync(fullPath).mtimeMs
        } catch {
          // ignore stat errors
        }
        return { fileName, fullPath, mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    if (migrationBackups.length > maxBackups) {
      const toDelete = migrationBackups.slice(maxBackups)
      for (const item of toDelete) {
        // Ensure path is strictly inside backupsDir and has expected filename pattern
        if (
          basename(item.fullPath).startsWith('pre-migration-') &&
          basename(item.fullPath).endsWith('.backup')
        ) {
          unlinkSync(item.fullPath)
          logger.info({ path: item.fullPath }, 'Pruned old pre-migration backup')
        }
      }
    }
  } catch (error) {
    logger.warn({ error, backupsDir }, 'Failed to prune pre-migration backups')
  }
}
