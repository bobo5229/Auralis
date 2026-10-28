import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { logger } from '@main/logging/logger'

const MAX_PRE_MIGRATION_BACKUPS = 5

export function removeTemporarySnapshot(tempPath: string | null): void {
  if (!tempPath) return
  for (const path of [tempPath, `${tempPath}-wal`, `${tempPath}-shm`, `${tempPath}-journal`]) {
    try {
      if (existsSync(path)) unlinkSync(path)
    } catch (error) {
      logger.warn({ error, path }, 'Failed to remove temporary database snapshot')
    }
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

  let tempBackupPath: string | null = null
  try {
    mkdirSync(backupsDir, { recursive: true })

    const timestamp = Date.now()
    const backupFileName = `pre-migration-v${targetVersion}-${timestamp}-${randomUUID()}.backup`
    const backupPath = join(backupsDir, backupFileName)
    tempBackupPath = `${backupPath}.tmp`

    // Migrations are synchronous. VACUUM INTO creates a complete snapshot without
    // checkpointing, even when another connection's reader pins older WAL frames.
    db.prepare('VACUUM INTO ?').run(tempBackupPath)
    renameSync(tempBackupPath, backupPath)

    logger.info({ backupPath, targetVersion }, 'Created pre-migration database backup')

    prunePreMigrationBackups(backupsDir, maxBackups)

    return backupPath
  } catch (error) {
    logger.error({ error, databasePath, targetVersion }, 'Failed to create pre-migration backup')
    return null
  } finally {
    removeTemporarySnapshot(tempBackupPath)
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
