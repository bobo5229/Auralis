import {
  constants,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'

interface RestoreFile {
  readonly path: string
  readonly rollbackPath: string
  copied: boolean
}

type RestorePhase = 'capturing' | 'replacing' | 'restored' | 'verified'
interface RestoreState {
  version: 1
  phase: RestorePhase
  originalExists: boolean[]
}

function restoreFile(path: string): RestoreFile {
  return { path, rollbackPath: `${path}.rollback`, copied: false }
}

/** Persists recovery intent before changing the original SQLite file set. */
export class DatabaseRestoreFiles {
  readonly stagedPath: string
  private readonly statePath: string
  private readonly database: RestoreFile
  private readonly sidecars: RestoreFile[]
  private readonly files: RestoreFile[]
  private state: RestoreState | undefined

  constructor(databasePath: string) {
    this.stagedPath = `${databasePath}.restore_staged`
    this.statePath = `${databasePath}.restore_state`
    this.database = restoreFile(databasePath)
    this.sidecars = [restoreFile(`${databasePath}-wal`), restoreFile(`${databasePath}-shm`)]
    this.files = [this.database, ...this.sidecars]
  }

  hasStagedRestore(): boolean {
    return existsSync(this.stagedPath)
  }

  /** Returns true when an interrupted attempt was rolled back instead of retried. */
  recoverInterruptedRestore(onCleanupError: (error: unknown, path: string) => void): boolean {
    if (!existsSync(this.statePath)) {
      if (this.files.some((file) => existsSync(file.rollbackPath)))
        throw new Error('Unidentified database rollback files; preserve them for manual recovery')
      return false
    }
    const state: unknown = JSON.parse(readFileSync(this.statePath, 'utf8'))
    if (
      typeof state !== 'object' ||
      state === null ||
      !('version' in state) ||
      state.version !== 1 ||
      !('phase' in state) ||
      typeof state.phase !== 'string' ||
      !['capturing', 'replacing', 'restored', 'verified'].includes(state.phase) ||
      !('originalExists' in state) ||
      !Array.isArray(state.originalExists) ||
      state.originalExists.length !== this.files.length ||
      !state.originalExists.every((value) => typeof value === 'boolean')
    )
      throw new Error('Invalid database restore state; preserve recovery files')
    this.state = state as RestoreState
    if (this.state.phase === 'verified') {
      this.cleanupRollbackFiles(onCleanupError)
      // A new staged restore must not reuse paths whose cleanup is still denied.
      if (this.hasStagedRestore() && existsSync(this.statePath))
        throw new Error('Previous verified database restore cleanup is incomplete')
      return false
    }
    if (this.state.phase === 'capturing') {
      // Replacement never started, so even a partial capture can be discarded.
      for (const file of this.files) file.copied = true
    }
    this.rollback()
    return true
  }

  captureOriginal(): void {
    this.setState({
      version: 1,
      phase: 'capturing',
      originalExists: this.files.map((file) => existsSync(file.path)),
    })
    for (const [index, file] of this.files.entries()) {
      if (!this.state!.originalExists[index]) continue
      // Never overwrite recovery material, including files from older versions.
      copyFileSync(file.path, file.rollbackPath, constants.COPYFILE_EXCL)
      file.copied = true
    }
  }

  replaceFromStaged(): void {
    // Commit before copying: even a failed write may change the destination.
    this.setPhase('replacing')
    copyFileSync(this.stagedPath, this.database.path)
    this.removeSidecars()
  }

  rollback(): void {
    if (!this.state) return
    if (this.state.phase === 'replacing') {
      // Check the complete source set before mutating any destination.
      for (const [index, file] of this.files.entries())
        if (this.state.originalExists[index] && !existsSync(file.rollbackPath))
          throw new Error(`Missing database rollback file: ${file.rollbackPath}`)
      this.removeSidecars()
      for (const [index, file] of this.files.entries()) {
        if (this.state.originalExists[index]) copyFileSync(file.rollbackPath, file.path)
        else if (existsSync(file.path)) unlinkSync(file.path)
      }
      // Keep every original copy until the whole coherent set is restored.
      this.setPhase('restored')
    }
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath)
    for (const file of this.files) {
      // During a failed capture, leave its incomplete copy untouched this call.
      if (this.state.phase === 'capturing' && !file.copied) continue
      if (existsSync(file.rollbackPath)) unlinkSync(file.rollbackPath)
    }
    this.removeStateIfClean()
  }

  cleanupVerifiedRestore(onCleanupError: (error: unknown, path: string) => void): void {
    // Failure to consume staging still triggers rollback while all original copies remain.
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath)
    this.setPhase('verified')
    this.cleanupRollbackFiles(onCleanupError)
  }

  private cleanupRollbackFiles(onCleanupError: (error: unknown, path: string) => void): void {
    for (const file of this.files) {
      try {
        if (existsSync(file.rollbackPath)) unlinkSync(file.rollbackPath)
      } catch (error) {
        onCleanupError(error, file.rollbackPath)
      }
    }
    try {
      this.removeStateIfClean()
    } catch (error) {
      onCleanupError(error, this.statePath)
    }
  }

  private removeStateIfClean(): void {
    if (this.files.every((file) => !existsSync(file.rollbackPath))) {
      if (existsSync(this.statePath)) unlinkSync(this.statePath)
      this.state = undefined
    }
  }

  private setPhase(phase: RestorePhase): void {
    if (!this.state) throw new Error('Database restore state is missing')
    this.setState({ ...this.state, phase })
  }

  private setState(state: RestoreState): void {
    const temporaryPath = `${this.statePath}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(state), 'utf8')
    renameSync(temporaryPath, this.statePath)
    this.state = state
  }

  private removeSidecars(): void {
    for (const file of this.sidecars) if (existsSync(file.path)) unlinkSync(file.path)
  }
}
