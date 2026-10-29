import type { AuralisApi } from '@shared/ipc/api'
import {
  LibraryCatalogLoadStaleError,
  loadLibraryCatalogSnapshot,
  type LoadedLibraryCatalogSnapshot,
} from './loadLibraryCatalogSnapshot'

type SharedSnapshot = Omit<LoadedLibraryCatalogSnapshot, 'tracks'> & {
  readonly tracks: ReadonlyArray<Readonly<LoadedLibraryCatalogSnapshot['tracks'][number]>>
}

type CatalogFreshness = 'fresh' | 'snapshot' | 'current'

interface SharedExecution {
  readonly revision: number
  readonly strongRevision: number
  readonly promise: Promise<SharedSnapshot>
}

export class LibraryCatalogLoadInvalidatedError extends Error {
  constructor() {
    super('Library catalog kept changing during refresh')
    this.name = 'LibraryCatalogLoadInvalidatedError'
  }
}

/** Shares catalog results; UI priority/generation ownership stays in LibraryRequestCoordinator. */
export class SharedLibraryCatalogLoad {
  private revision = 0
  private strongRevision = 0
  private active: SharedExecution | null = null
  private completed: SharedExecution | null = null
  private libraryRevision: string | null = null
  private readonly snapshotExecutions = new WeakMap<SharedSnapshot, SharedExecution>()

  readonly observesChanges: boolean
  private stopObserving?: () => void

  constructor(
    private readonly fetchPage: Parameters<typeof loadLibraryCatalogSnapshot>[0],
    changes?: Pick<AuralisApi['library'], 'onChanged' | 'onScanProgress'>,
  ) {
    this.observesChanges = Boolean(changes)
    if (!changes) return
    const stopChanged = changes.onChanged((event) => {
      if (
        event.reason === 'track-added' ||
        event.reason === 'track-relocated' ||
        event.reason === 'play-stats-updated' ||
        event.reason === 'play-stats-reset'
      ) {
        this.invalidate('import')
      } else if (event.libraryRevision) this.invalidateForLibraryRevision(event.libraryRevision)
      else this.invalidate()
    })
    const stopScan = changes.onScanProgress((progress) => {
      if (progress.status === 'completed') this.invalidate()
    })
    this.stopObserving = () => {
      stopChanged()
      stopScan()
    }
  }

  dispose(): void {
    this.stopObserving?.()
    this.stopObserving = undefined
    this.invalidate()
  }

  get invalidationRevision(): number {
    return this.revision
  }

  invalidate(kind: 'strong' | 'import' = 'strong'): void {
    this.revision += 1
    if (kind === 'strong') this.strongRevision += 1
    this.libraryRevision = null
    this.completed = null
  }

  invalidateForLibraryRevision(revision: string): void {
    if (this.isLibraryRevisionCurrent(revision)) return
    this.invalidate()
    this.libraryRevision = revision
  }

  isLibraryRevisionCurrent(revision: string): boolean {
    return this.libraryRevision === revision
  }

  isSnapshotCurrent(snapshot: SharedSnapshot): boolean {
    return this.snapshotExecutions.get(snapshot)?.strongRevision === this.strongRevision
  }

  async load(
    isCurrent: () => boolean,
    freshness: CatalogFreshness = 'fresh',
    libraryRevision?: string,
  ): Promise<SharedSnapshot> {
    // A save/create must read a snapshot begun after its own invalidation. Later
    // imports do not move that boundary; missing/metadata changes always do.
    const requiredRevision = this.revision
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!isCurrent()) throw new LibraryCatalogLoadStaleError()
      const execution = this.getOrStart(freshness, libraryRevision)
      const result = await execution.promise
      if (!isCurrent()) throw new LibraryCatalogLoadStaleError()
      if (
        this.isSnapshotCurrent(result) &&
        (freshness === 'snapshot' || execution.revision >= requiredRevision)
      ) {
        return result
      }
    }
    // Repeated strong changes must not keep a strict caller pending forever.
    throw new LibraryCatalogLoadInvalidatedError()
  }

  private getOrStart(freshness: CatalogFreshness, libraryRevision?: string): SharedExecution {
    // Revisit consumers can reuse a completed generation. Unversioned explicit
    // fresh reads still establish a new execution after save/create boundaries.
    if (
      !this.active &&
      (freshness !== 'fresh' ||
        (libraryRevision !== undefined && this.isLibraryRevisionCurrent(libraryRevision))) &&
      this.completed?.revision === this.revision
    )
      return this.completed
    if (!this.active) {
      this.completed = null
      const revision = this.revision
      const strongRevision = this.strongRevision
      const task = this.run()
      const execution = {
        revision,
        strongRevision,
        promise: task,
      }
      this.active = execution
      // Install cleanup on both outcomes without creating an unhandled rejected promise.
      void task.then(
        (snapshot) => {
          this.snapshotExecutions.set(snapshot, execution)
          if (execution.revision === this.revision) this.completed = execution
          if (this.active === execution) this.active = null
        },
        () => {
          if (this.active === execution) this.active = null
        },
      )
    }
    return this.active
  }

  private async run(): Promise<SharedSnapshot> {
    const result = await loadLibraryCatalogSnapshot(this.fetchPage, () => true)
    for (const track of result.tracks) Object.freeze(track)
    return Object.freeze({ ...result, tracks: Object.freeze(result.tracks) })
  }
}
