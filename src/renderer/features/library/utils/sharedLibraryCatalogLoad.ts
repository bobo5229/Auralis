import {
  LibraryCatalogLoadStaleError,
  loadLibraryCatalogSnapshot,
  type LoadedLibraryCatalogSnapshot,
} from './loadLibraryCatalogSnapshot'

type SharedSnapshot = Omit<LoadedLibraryCatalogSnapshot, 'tracks'> & {
  readonly tracks: ReadonlyArray<Readonly<LoadedLibraryCatalogSnapshot['tracks'][number]>>
}

type CatalogFreshness = 'fresh' | 'snapshot'

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

/** Shares execution only. UI priority/generation ownership stays in LibraryRequestCoordinator. */
export class SharedLibraryCatalogLoad {
  private revision = 0
  private strongRevision = 0
  private active: SharedExecution | null = null
  private readonly snapshotExecutions = new WeakMap<SharedSnapshot, SharedExecution>()

  constructor(private readonly fetchPage: Parameters<typeof loadLibraryCatalogSnapshot>[0]) {}

  invalidate(kind: 'strong' | 'import' = 'strong'): void {
    this.revision += 1
    if (kind === 'strong') this.strongRevision += 1
  }

  isSnapshotCurrent(snapshot: SharedSnapshot): boolean {
    return this.snapshotExecutions.get(snapshot)?.strongRevision === this.strongRevision
  }

  async load(
    isCurrent: () => boolean,
    freshness: CatalogFreshness = 'fresh',
  ): Promise<SharedSnapshot> {
    // A save/create must read a snapshot begun after its own invalidation. Later
    // imports do not move that boundary; missing/metadata changes always do.
    const requiredRevision = this.revision
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!isCurrent()) throw new LibraryCatalogLoadStaleError()
      const execution = this.getOrStart()
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

  private getOrStart(): SharedExecution {
    if (!this.active) {
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
