import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'

export interface PlaybackFileCoordinatorDependencies {
  getTrackFilePath: (trackId: number) => string | null
}

/** Tracks decoder ownership without reserving or mutating music files. */
export class PlaybackFileCoordinator {
  private readonly leases = new Map<string, { normalizedPath: string; sourceId: string }>()
  private nextLeaseSequence = 0

  constructor(private readonly dependencies: PlaybackFileCoordinatorDependencies) {}

  async acquireReadLease(
    filePath: string,
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<{ leaseId: string; version: number }> {
    if (signal?.aborted) throw new Error('Read lease request aborted')
    const normalizedPath = normalizeAudioFilePath(filePath)
    if (signal?.aborted) throw new Error('Read lease request aborted')
    const version = ++this.nextLeaseSequence
    const leaseId = `lease_read_${version}`
    this.leases.set(leaseId, { normalizedPath, sourceId })
    return { leaseId, version }
  }

  isReadLeaseForTrack(leaseId: string, trackId: number, filePath: string): boolean {
    const lease = this.leases.get(leaseId)
    if (!lease) return false
    const path = this.dependencies.getTrackFilePath(trackId)
    return (
      path !== null &&
      normalizeAudioFilePath(path) === lease.normalizedPath &&
      normalizeAudioFilePath(filePath) === lease.normalizedPath
    )
  }

  markReadLeaseCurrent(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (lease?.sourceId === 'mpv-next') lease.sourceId = 'mpv-current'
  }

  releaseReadLease(leaseId: string): void {
    this.leases.delete(leaseId)
  }

  releaseAllBySourceId(sourceId: string): void {
    for (const [id, lease] of this.leases) {
      if (lease.sourceId === sourceId) this.releaseReadLease(id)
    }
  }
}
