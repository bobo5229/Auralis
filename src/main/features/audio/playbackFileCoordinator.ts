import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'
import type {
  TrackEditStatus,
  TrackEditStateChangedEvent,
  TrackEditStateResult,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'

interface WriteWaiter {
  sourceId: string
  signal?: AbortSignal
  resolve: (lease: { leaseId: string; version: number }) => void
  reject: (error: Error) => void
}

interface FileAccessEntry {
  normalizedPath: string
  filePaths: Set<string>
  readers: Set<string>
  writer: string | null
  lastBroadcastStatus: TrackEditStatus
  writeWaiters: WriteWaiter[]
  version: number
}

interface LeaseMetadata {
  leaseId: string
  normalizedPath: string
  kind: 'read' | 'write' | 'intent' | 'replacement-intent'
  sourceId: string
}

export interface PlaybackFileCoordinatorDependencies {
  getTrackFilePath: (trackId: number) => string | null
  getTrackIdsByFilePath: (filePath: string) => number[]
  trackEditStateChanged: (event: TrackEditStateChangedEvent) => void
}

export class PlaybackFileCoordinator {
  private bufferedWriteCapability: ((filePath: string) => boolean) | null = null
  private fileReplacementCapability: ((filePath: string) => boolean) | null = null
  private metadataWriteActive: (normalizedPath: string) => boolean = () => false
  private readonly entries = new Map<string, FileAccessEntry>()
  private readonly leases = new Map<string, LeaseMetadata>()
  private nextLeaseSequence = 0
  private stateVersion = 0

  constructor(private readonly dependencies: PlaybackFileCoordinatorDependencies) {}

  setBufferedWriteCapability(capability: (filePath: string) => boolean): void {
    this.bufferedWriteCapability = capability
  }

  setFileReplacementCapability(capability: (filePath: string) => boolean): void {
    this.fileReplacementCapability = capability
  }

  setMetadataWriteActivity(isActive: (normalizedPath: string) => boolean): void {
    this.metadataWriteActive = isActive
  }

  private isPlaybackSource(sourceId: string): boolean {
    return sourceId === 'mpv-current' || sourceId === 'mpv-next'
  }

  private canReplace(entry: FileAccessEntry): boolean {
    return (
      !!this.fileReplacementCapability?.([...entry.filePaths][0]) &&
      [...entry.readers].every((id) =>
        ['mpv-current', 'mpv-next', 'spectrum-analysis'].includes(
          this.leases.get(id)?.sourceId ?? '',
        ),
      )
    )
  }

  /** Existing mpv handles keep their file version; all new opens wait for publication. */
  reserveFileReplacement(filePath: string): string | null {
    const entry = this.getOrCreateEntry(normalizeAudioFilePath(filePath), filePath)
    if (entry.writer !== null || !this.canReplace(entry)) return null
    const leaseId = `lease_replacement_${++this.nextLeaseSequence}`
    entry.writer = leaseId
    this.leases.set(leaseId, {
      leaseId,
      normalizedPath: entry.normalizedPath,
      kind: 'replacement-intent',
      sourceId: 'metadata-writer',
    })
    entry.version = ++this.stateVersion
    this.broadcastStatusIfChanged(entry)
    return leaseId
  }

  promoteFileReplacement(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    const entry = lease && this.entries.get(lease.normalizedPath)
    if (!lease || lease.kind !== 'replacement-intent' || !entry || entry.writer !== leaseId)
      throw new Error('File replacement intent expired')
    if (
      [...entry.readers].some(
        (id) => !['mpv-current', 'mpv-next'].includes(this.leases.get(id)?.sourceId ?? ''),
      )
    )
      throw new Error('Non-mpv audio readers have not released the file')
    lease.kind = 'write'
  }

  refreshPlaybackCapability(filePath: string): void {
    const entry = this.entries.get(normalizeAudioFilePath(filePath))
    if (!entry) return
    entry.version = ++this.stateVersion
    this.broadcastStatusIfChanged(entry)
  }

  private canBuffer(entry: FileAccessEntry): boolean {
    return (
      !!this.bufferedWriteCapability?.([...entry.filePaths][0]) &&
      [...entry.readers].every((id) =>
        ['mpv-current', 'mpv-next', 'spectrum-analysis'].includes(
          this.leases.get(id)?.sourceId ?? '',
        ),
      )
    )
  }

  /** Reserve the path before preparation, while existing readers continue playing. */
  reserveWriteIntent(filePath: string): string | null {
    const normalizedPath = normalizeAudioFilePath(filePath)
    const entry = this.getOrCreateEntry(normalizedPath, filePath)
    if (entry.writer !== null || !this.canBuffer(entry)) return null
    const leaseId = `lease_intent_${++this.nextLeaseSequence}`
    entry.writer = leaseId
    this.leases.set(leaseId, {
      leaseId,
      normalizedPath,
      kind: 'intent',
      sourceId: 'metadata-writer',
    })
    entry.version = ++this.stateVersion
    this.broadcastStatusIfChanged(entry)
    return leaseId
  }

  promoteWriteIntent(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    const entry = lease && this.entries.get(lease.normalizedPath)
    if (!lease || lease.kind !== 'intent' || !entry || entry.writer !== leaseId)
      throw new Error('Tag write intent expired')
    if (entry.readers.size > 0) throw new Error('Audio readers have not released the file')
    lease.kind = 'write'
  }

  private getOrCreateEntry(normalizedPath: string, filePath: string): FileAccessEntry {
    let entry = this.entries.get(normalizedPath)
    if (!entry) {
      entry = {
        normalizedPath,
        filePaths: new Set(),
        readers: new Set(),
        writer: null,
        lastBroadcastStatus: 'editable',
        writeWaiters: [],
        version: this.stateVersion,
      }
      this.entries.set(normalizedPath, entry)
    }
    entry.filePaths.add(filePath)
    return entry
  }

  private cleanEntryIfIdle(entry: FileAccessEntry): void {
    if (entry.readers.size === 0 && entry.writer === null && entry.writeWaiters.length === 0) {
      this.entries.delete(entry.normalizedPath)
    }
  }

  private grantReadWaiters(entry: FileAccessEntry): void {
    const pendingWaiters = [...entry.writeWaiters]
    entry.writeWaiters = []
    const blocked: WriteWaiter[] = []
    for (const waiter of pendingWaiters) {
      if (waiter.signal?.aborted) continue
      if (
        this.metadataWriteActive(entry.normalizedPath) &&
        !this.isPlaybackSource(waiter.sourceId)
      ) {
        blocked.push(waiter)
        continue
      }
      const nextReadLeaseId = `lease_read_${++this.nextLeaseSequence}`
      entry.readers.add(nextReadLeaseId)
      this.leases.set(nextReadLeaseId, {
        leaseId: nextReadLeaseId,
        normalizedPath: entry.normalizedPath,
        kind: 'read',
        sourceId: waiter.sourceId,
      })
      waiter.resolve({ leaseId: nextReadLeaseId, version: entry.version })
    }
    entry.writeWaiters = blocked
  }

  private computeStatus(entry: FileAccessEntry): TrackEditStatus {
    if (entry.writer !== null || this.metadataWriteActive(entry.normalizedPath))
      return 'write-in-progress'
    if (entry.readers.size > 0) {
      if (this.canBuffer(entry) || this.canReplace(entry)) return 'playback-editable'
      const isPreload = [...entry.readers].every(
        (id) => this.leases.get(id)?.sourceId === 'mpv-next',
      )
      return isPreload ? 'preload-in-use' : 'playback-in-use'
    }
    return 'editable'
  }

  private broadcastStatusIfChanged(entry: FileAccessEntry): void {
    const currentStatus = this.computeStatus(entry)
    if (currentStatus === entry.lastBroadcastStatus && entry.version > 0) {
      return
    }
    entry.lastBroadcastStatus = currentStatus
    // Database paths retain their original casing and spelling. Canonical keys
    // identify leases, but must not replace the paths used for catalog lookup.
    const trackIds = new Set(
      [...entry.filePaths].flatMap((path) => this.dependencies.getTrackIdsByFilePath(path)),
    )
    for (const trackId of trackIds) {
      this.dependencies.trackEditStateChanged({
        trackId,
        status: currentStatus,
        version: entry.version,
      })
    }
  }

  async acquireReadLease(
    filePath: string,
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<{ leaseId: string; version: number }> {
    if (signal?.aborted) {
      throw new Error('Read lease request aborted')
    }

    const normalizedPath = normalizeAudioFilePath(filePath)
    const entry = this.getOrCreateEntry(normalizedPath, filePath)

    const waitForWriter = entry.writer !== null
    const waitForActivity =
      this.metadataWriteActive(normalizedPath) && !this.isPlaybackSource(sourceId)
    if (!waitForWriter && !waitForActivity) {
      const leaseId = `lease_read_${++this.nextLeaseSequence}`
      entry.readers.add(leaseId)
      entry.version = ++this.stateVersion
      this.leases.set(leaseId, { leaseId, normalizedPath, kind: 'read', sourceId })
      this.broadcastStatusIfChanged(entry)
      return { leaseId, version: entry.version }
    }

    return new Promise<{ leaseId: string; version: number }>((resolve, reject) => {
      let onAbort: (() => void) | null = null

      const waiter: WriteWaiter = {
        sourceId,
        signal,
        resolve: (result) => {
          if (onAbort && signal) signal.removeEventListener('abort', onAbort)
          resolve(result)
        },
        reject: (error) => {
          if (onAbort && signal) signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      }

      if (signal) {
        onAbort = () => {
          const index = entry.writeWaiters.indexOf(waiter)
          if (index !== -1) {
            entry.writeWaiters.splice(index, 1)
          }
          this.cleanEntryIfIdle(entry)
          waiter.reject(new Error('Read lease request aborted while waiting for writer'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      entry.writeWaiters.push(waiter)
    })
  }

  isReadLeaseForTrack(leaseId: string, trackId: number, filePath: string): boolean {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.kind !== 'read') return false
    const path = this.dependencies.getTrackFilePath(trackId)
    // A root junction may move while its original spelling is reused. Check the
    // submitted spelling too, even when the new catalog alias retains the lease key.
    return (
      path !== null &&
      normalizeAudioFilePath(path) === lease.normalizedPath &&
      normalizeAudioFilePath(filePath) === lease.normalizedPath
    )
  }

  markReadLeaseCurrent(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.kind !== 'read' || lease.sourceId !== 'mpv-next') return
    lease.sourceId = 'mpv-current'
    const entry = this.entries.get(lease.normalizedPath)
    if (!entry) return
    entry.version = ++this.stateVersion
    this.broadcastStatusIfChanged(entry)
  }

  releaseReadLease(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.kind !== 'read') return
    this.leases.delete(leaseId)

    const entry = this.entries.get(lease.normalizedPath)
    if (!entry) return

    entry.readers.delete(leaseId)
    entry.version = ++this.stateVersion
    this.broadcastStatusIfChanged(entry)
    this.cleanEntryIfIdle(entry)
  }

  tryAcquireWriteLease(
    filePath: string,
    sourceId = 'metadata-writer',
  ): { ok: true; leaseId: string } | Extract<UpdateTrackMetadataResult, { ok: false }> {
    const normalizedPath = normalizeAudioFilePath(filePath)
    const entry = this.getOrCreateEntry(normalizedPath, filePath)

    if (entry.writer !== null || this.metadataWriteActive(normalizedPath)) {
      return { ok: false, reason: 'write-in-progress' }
    }

    if (entry.readers.size > 0) {
      return { ok: false, reason: 'playback-in-use' }
    }

    const leaseId = `lease_write_${++this.nextLeaseSequence}`
    entry.writer = leaseId
    entry.version = ++this.stateVersion
    this.leases.set(leaseId, { leaseId, normalizedPath, kind: 'write', sourceId })
    this.broadcastStatusIfChanged(entry)

    return { ok: true, leaseId }
  }

  releaseWriteLease(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (!lease || !['write', 'intent', 'replacement-intent'].includes(lease.kind)) return
    this.leases.delete(leaseId)

    const entry = this.entries.get(lease.normalizedPath)
    if (!entry || entry.writer !== leaseId) return

    entry.writer = null
    entry.version = ++this.stateVersion

    this.grantReadWaiters(entry)
    this.broadcastStatusIfChanged(entry)
    this.cleanEntryIfIdle(entry)
  }

  handoffWriteLeaseToRead(leaseId: string, sourceId: string): { leaseId: string; version: number } {
    const lease = this.leases.get(leaseId)
    const entry = lease && this.entries.get(lease.normalizedPath)
    if (
      !lease ||
      !entry ||
      entry.writer !== leaseId ||
      !['write', 'intent', 'replacement-intent'].includes(lease.kind)
    ) {
      throw new Error('File write handoff lease expired')
    }
    this.leases.delete(leaseId)
    entry.writer = null
    const readLeaseId = `lease_read_${++this.nextLeaseSequence}`
    entry.readers.add(readLeaseId)
    this.leases.set(readLeaseId, {
      leaseId: readLeaseId,
      normalizedPath: entry.normalizedPath,
      kind: 'read',
      sourceId,
    })
    entry.version = ++this.stateVersion
    this.grantReadWaiters(entry)
    this.broadcastStatusIfChanged(entry)
    return { leaseId: readLeaseId, version: entry.version }
  }

  finishMetadataWrite(filePath: string): void {
    const entry = this.entries.get(normalizeAudioFilePath(filePath))
    if (!entry) return
    entry.version = ++this.stateVersion
    if (entry.writer !== null) {
      this.broadcastStatusIfChanged(entry)
      return
    }
    this.grantReadWaiters(entry)
    this.broadcastStatusIfChanged(entry)
    this.cleanEntryIfIdle(entry)
  }

  getTrackState(trackId: number): TrackEditStateResult {
    const filePath = this.dependencies.getTrackFilePath(trackId)
    if (!filePath) {
      return { trackId, status: 'editable', version: this.stateVersion }
    }

    const normalizedPath = normalizeAudioFilePath(filePath)
    const entry = this.entries.get(normalizedPath)
    if (!entry) {
      return { trackId, status: 'editable', version: this.stateVersion }
    }

    entry.filePaths.add(filePath)
    return {
      trackId,
      status: this.computeStatus(entry),
      version: entry.version,
    }
  }

  releaseAllBySourceId(sourceId: string): void {
    const matchingLeases = [...this.leases.values()].filter((lease) => lease.sourceId === sourceId)
    for (const lease of matchingLeases) {
      if (lease.kind === 'read') {
        this.releaseReadLease(lease.leaseId)
      } else {
        this.releaseWriteLease(lease.leaseId)
      }
    }
  }
}
