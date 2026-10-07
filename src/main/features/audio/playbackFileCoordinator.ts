import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import { ipcChannels } from '@shared/ipc/channels'
import type {
  TrackEditStatus,
  TrackEditStateResult,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'

export function normalizeAudioFilePath(filePath: string): string {
  let normalized = resolve(filePath)
  try {
    normalized = realpathSync.native(normalized)
  } catch {
    // If realpath fails (e.g. file does not exist yet), keep the resolved path.
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

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
  kind: 'read' | 'write' | 'intent'
  sourceId: string
}

export interface PlaybackFileCoordinatorDependencies {
  getTrackFilePath: (trackId: number) => string | null
  getTrackIdsByFilePath: (filePath: string) => number[]
  sendToRenderer: RendererEventSender
}

export class PlaybackFileCoordinator {
  private bufferedWriteCapability: ((filePath: string) => boolean) | null = null
  private readonly entries = new Map<string, FileAccessEntry>()
  private readonly leases = new Map<string, LeaseMetadata>()
  private nextLeaseSequence = 0
  private stateVersion = 0

  constructor(private readonly dependencies: PlaybackFileCoordinatorDependencies) {}

  setBufferedWriteCapability(capability: (filePath: string) => boolean): void {
    this.bufferedWriteCapability = capability
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

  private computeStatus(entry: FileAccessEntry): TrackEditStatus {
    if (entry.writer !== null) return 'write-in-progress'
    if (entry.readers.size > 0)
      return this.canBuffer(entry) ? 'playback-editable' : 'playback-in-use'
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
      this.dependencies.sendToRenderer(ipcChannels.metadata.trackEditStateChanged, {
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

    if (entry.writer === null) {
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

    if (entry.writer !== null) {
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
    if (!lease || (lease.kind !== 'write' && lease.kind !== 'intent')) return
    this.leases.delete(leaseId)

    const entry = this.entries.get(lease.normalizedPath)
    if (!entry || entry.writer !== leaseId) return

    entry.writer = null
    entry.version = ++this.stateVersion

    // Drain all active waiters
    const pendingWaiters = [...entry.writeWaiters]
    entry.writeWaiters = []

    for (const waiter of pendingWaiters) {
      if (waiter.signal?.aborted) continue
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
