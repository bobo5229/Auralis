export interface SeasonMeshSnapshot {
  bitmap: ImageBitmap
  elapsed: number
  appearance: string
}

/** One in-memory frame; never retains a worker, a WebGL context or a running clock. */
export function createSeasonMeshSession() {
  let generation = 0
  let snapshot: SeasonMeshSnapshot | undefined
  let pending: Promise<void> | undefined
  return {
    begin: () => ++generation,
    read: () => snapshot,
    whenCaptured: () => pending ?? Promise.resolve(),
    beginCapture(owner: number) {
      if (owner !== generation) return () => {}
      let finish!: () => void
      const request = new Promise<void>((resolve) => {
        finish = resolve
      })
      pending = request
      return () => {
        if (pending === request) pending = undefined
        finish()
      }
    },
    save(owner: number, next: SeasonMeshSnapshot) {
      if (owner !== generation) {
        next.bitmap.close()
        return
      }
      snapshot?.bitmap.close()
      snapshot = next
    },
  }
}

export const seasonMeshSession = createSeasonMeshSession()
