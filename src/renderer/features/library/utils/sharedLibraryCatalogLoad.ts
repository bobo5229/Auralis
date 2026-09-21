import {
  LibraryCatalogLoadStaleError,
  loadLibraryCatalogSnapshot,
  type LoadedLibraryCatalogSnapshot,
} from './loadLibraryCatalogSnapshot'

type SharedSnapshot = Omit<LoadedLibraryCatalogSnapshot, 'tracks'> & {
  readonly tracks: ReadonlyArray<Readonly<LoadedLibraryCatalogSnapshot['tracks'][number]>>
}

/** Shares execution only. UI priority/generation ownership stays in LibraryRequestCoordinator. */
export class SharedLibraryCatalogLoad {
  private revision = 0
  private active: Promise<SharedSnapshot> | null = null

  constructor(private readonly fetchPage: Parameters<typeof loadLibraryCatalogSnapshot>[0]) {}

  invalidate(): void {
    this.revision += 1
  }

  async load(isCurrent: () => boolean): Promise<SharedSnapshot> {
    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()
    if (!this.active) {
      const task = this.run()
      this.active = task
      // Install cleanup on both outcomes without creating an unhandled rejected promise.
      void task.then(
        () => {
          if (this.active === task) this.active = null
        },
        () => {
          if (this.active === task) this.active = null
        },
      )
    }
    const result = await this.active
    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()
    return result
  }

  private async run(): Promise<SharedSnapshot> {
    for (;;) {
      const revision = this.revision
      try {
        const result = await loadLibraryCatalogSnapshot(this.fetchPage, () => true)
        if (revision !== this.revision) continue
        for (const track of result.tracks) Object.freeze(track)
        return Object.freeze({ ...result, tracks: Object.freeze(result.tracks) })
      } catch (error) {
        if (revision !== this.revision) continue
        throw error
      }
    }
  }
}
