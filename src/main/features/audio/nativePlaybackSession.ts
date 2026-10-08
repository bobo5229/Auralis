import type { MpvClient } from './mpvClient'
import type { PlaybackCoordinator } from './nativePlaybackTypes'

/** Owns the transport lifetime, one command queue, and decoder read leases. */
export class NativePlaybackSession {
  id = -1
  client: MpvClient | null = null
  private lifetime = new AbortController()
  private serial: Promise<unknown> = Promise.resolve()
  private currentReadLease: string | null = null
  private nextReadLease: string | null = null
  private loadedWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null

  constructor(private readonly coordinator?: PlaybackCoordinator) {}

  get signal(): AbortSignal {
    return this.lifetime.signal
  }

  get currentLeaseId(): string | null {
    return this.currentReadLease
  }

  get nextLeaseId(): string | null {
    return this.nextReadLease
  }

  begin(id: number): void {
    this.id = id
    this.lifetime = new AbortController()
  }

  isCurrent(id: number, client: MpvClient): boolean {
    return id === this.id && client === this.client
  }

  holdCurrentLease(leaseId: string | null): void {
    this.currentReadLease = leaseId
  }

  holdNextLease(leaseId: string | null): void {
    this.nextReadLease = leaseId
  }

  releaseCurrentLease(): void {
    if (this.currentReadLease) this.coordinator?.releaseReadLease(this.currentReadLease)
    this.currentReadLease = null
  }

  releaseNextLease(): void {
    if (this.nextReadLease) this.coordinator?.releaseReadLease(this.nextReadLease)
    this.nextReadLease = null
  }

  advanceLease(): void {
    this.releaseCurrentLease()
    this.currentReadLease = this.nextReadLease
    this.nextReadLease = null
  }

  releasePlaybackLeases(): void {
    this.releaseCurrentLease()
    this.releaseNextLease()
  }

  enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work)
    this.serial = result.catch(() => undefined)
    return result
  }

  load(client: MpvClient, path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('mpv file load timed out')), 15_000)
      const waiter = {
        resolve: () => {
          clearTimeout(timeout)
          resolve()
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        },
      }
      this.loadedWaiter = waiter
      void client.command('loadfile', path, 'replace').catch((error: Error) => waiter.reject(error))
    })
  }

  finishLoad(): void {
    this.loadedWaiter?.resolve()
    this.loadedWaiter = null
  }

  failLoad(error: Error): void {
    this.loadedWaiter?.reject(error)
    this.loadedWaiter = null
  }

  release(): Promise<void> {
    const leases = [this.currentReadLease, this.nextReadLease]
    this.currentReadLease = null
    this.nextReadLease = null
    const closed = this.client?.close()
    this.lifetime.abort()
    this.client = null
    this.failLoad(new Error('Playback replaced'))
    // Capture the old leases: a new session may start before this process exits.
    return Promise.resolve(closed).then(() => {
      for (const lease of leases) if (lease) this.coordinator?.releaseReadLease(lease)
    })
  }
}
