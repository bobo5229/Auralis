import Database from 'better-sqlite3'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { logger } from '@main/logging/logger'
import type { DatabaseExportBackupResult, DatabaseRestoreBackupResult } from '@shared/ipc/contracts'

const SQLITE_HEADER_STRING = 'SQLite format 3'
const SQLITE_HEADER_BYTES = 16
const MAX_PRE_MIGRATION_BACKUPS = 5

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

      const hasSchemaMigrations = testDb
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .pluck()
        .get()
      const hasTracks = testDb
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tracks'")
        .pluck()
        .get()

      if (!hasSchemaMigrations && !hasTracks) {
        return { ok: false, error: 'Database does not contain expected Auralis tables.' }
      }
    } finally {
      testDb.close()
    }

    return { ok: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: errorMsg }
  }
}

export interface ExportBackupOptions {
  db: Database.Database
  databasePath: string
  showSaveDialog?: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
}

/**
 * Truncates WAL and exports a consistent .backup copy of the database.
 */
export async function exportDatabaseBackup(
  options: ExportBackupOptions,
): Promise<DatabaseExportBackupResult> {
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

    // Checkpoint active WAL to write all transactions into the primary db file before copying.
    db.pragma('wal_checkpoint(TRUNCATE)')

    const targetDir = dirname(targetPath)
    mkdirSync(targetDir, { recursive: true })

    const tempTargetPath = `${targetPath}.tmp-${Date.now()}`
    copyFileSync(databasePath, tempTargetPath)
    renameSync(tempTargetPath, targetPath)

    logger.info({ databasePath, targetPath }, 'Exported database backup successfully')
    return { status: 'saved', targetPath }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error({ error, databasePath: options.databasePath }, 'Failed to export database backup')
    return { status: 'failed', error: errorMsg }
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

/**
 * Applies a staged database restore during startup with atomic swap and rollback fallback.
 */
export function applyStagedRestoreIfExists(
  databasePath: string,
  options?: { databaseCtor?: DatabaseConstructor },
): boolean {
  const stagedPath = `${databasePath}.restore_staged`
  if (!existsSync(stagedPath)) {
    return false
  }

  const databaseCtor = options?.databaseCtor ?? Database
  const rollbackPath = `${databasePath}.rollback`
  const rollbackWalPath = `${databasePath}-wal.rollback`
  const rollbackShmPath = `${databasePath}-shm.rollback`
  const walPath = `${databasePath}-wal`
  const shmPath = `${databasePath}-shm`

  logger.info(
    { stagedPath, databasePath },
    'Detected staged database restore; applying atomic swap',
  )

  let hasOriginalDb = false
  let hasOriginalWal = false
  let hasOriginalShm = false

  try {
    // 1. Create rollback copies of active files
    if (existsSync(databasePath)) {
      copyFileSync(databasePath, rollbackPath)
      hasOriginalDb = true
    }
    if (existsSync(walPath)) {
      copyFileSync(walPath, rollbackWalPath)
      hasOriginalWal = true
    }
    if (existsSync(shmPath)) {
      copyFileSync(shmPath, rollbackShmPath)
      hasOriginalShm = true
    }

    // 2. Replace active db with staged file and clear previous wal/shm
    copyFileSync(stagedPath, databasePath)
    if (existsSync(walPath)) unlinkSync(walPath)
    if (existsSync(shmPath)) unlinkSync(shmPath)

    // 3. Verify the restored database file
    const testDb = new databaseCtor(databasePath, { fileMustExist: true })
    try {
      const checkResult = testDb.pragma('quick_check(1)', { simple: true })
      if (checkResult !== 'ok') {
        throw new Error(`Corrupt restored database quick_check: ${String(checkResult)}`)
      }
    } finally {
      testDb.close()
    }

    // 4. Success — clean up staged file and rollback backups
    if (existsSync(stagedPath)) unlinkSync(stagedPath)
    if (existsSync(rollbackPath)) unlinkSync(rollbackPath)
    if (existsSync(rollbackWalPath)) unlinkSync(rollbackWalPath)
    if (existsSync(rollbackShmPath)) unlinkSync(rollbackShmPath)

    logger.info({ databasePath }, 'Staged database restore applied and verified successfully')
    return true
  } catch (error) {
    logger.error(
      { error, databasePath },
      'Failed to apply staged database restore; executing rollback',
    )

    // Rollback to original files
    try {
      if (hasOriginalDb && existsSync(rollbackPath)) {
        copyFileSync(rollbackPath, databasePath)
        unlinkSync(rollbackPath)
      }
      if (hasOriginalWal && existsSync(rollbackWalPath)) {
        copyFileSync(rollbackWalPath, walPath)
        unlinkSync(rollbackWalPath)
      }
      if (hasOriginalShm && existsSync(rollbackShmPath)) {
        copyFileSync(rollbackShmPath, shmPath)
        unlinkSync(rollbackShmPath)
      }
      if (existsSync(stagedPath)) {
        unlinkSync(stagedPath)
      }
    } catch (rollbackError) {
      logger.error({ rollbackError }, 'Catastrophic error during database restore rollback')
    }

    throw new Error(
      `Failed to apply staged database restore: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
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
