import { copyFileSync, existsSync, unlinkSync } from 'node:fs'

interface RestoreFile {
  readonly path: string
  readonly rollbackPath: string
  copied: boolean
}

function restoreFile(path: string): RestoreFile {
  return { path, rollbackPath: `${path}.rollback`, copied: false }
}

/** Owns the files and rollback progress of one synchronous startup restore. */
export class DatabaseRestoreFiles {
  readonly stagedPath: string
  private readonly database: RestoreFile
  private readonly sidecars: RestoreFile[]
  private readonly files: RestoreFile[]
  private replacementAttempted = false

  constructor(databasePath: string) {
    this.stagedPath = `${databasePath}.restore_staged`
    this.database = restoreFile(databasePath)
    this.sidecars = [restoreFile(`${databasePath}-wal`), restoreFile(`${databasePath}-shm`)]
    this.files = [this.database, ...this.sidecars]
  }

  hasStagedRestore(): boolean {
    return existsSync(this.stagedPath)
  }

  captureOriginal(): void {
    for (const file of this.files) {
      if (!existsSync(file.path)) continue
      copyFileSync(file.path, file.rollbackPath)
      // A failed copy is not a usable rollback file, even if a partial file exists.
      file.copied = true
    }
  }

  replaceFromStaged(): void {
    // Set before copying: a failed write can already have changed the destination.
    this.replacementAttempted = true
    copyFileSync(this.stagedPath, this.database.path)
    this.removeSidecars()
  }

  rollback(): void {
    if (this.replacementAttempted) {
      this.removeSidecars()
      if (!this.database.copied && existsSync(this.database.path)) unlinkSync(this.database.path)
    }
    for (const file of this.files) {
      if (!file.copied || !existsSync(file.rollbackPath)) continue
      copyFileSync(file.rollbackPath, file.path)
      // Retain the copy if restoration fails, so recovery material is not discarded.
      unlinkSync(file.rollbackPath)
    }
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath)
  }

  cleanupVerifiedRestore(onCleanupError: (error: unknown, path: string) => void): void {
    // Failure to consume staging still triggers rollback while all original copies remain.
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath)
    for (const file of this.files) {
      try {
        if (existsSync(file.rollbackPath)) unlinkSync(file.rollbackPath)
      } catch (error) {
        onCleanupError(error, file.rollbackPath)
      }
    }
  }

  private removeSidecars(): void {
    for (const file of this.sidecars) if (existsSync(file.path)) unlinkSync(file.path)
  }
}
