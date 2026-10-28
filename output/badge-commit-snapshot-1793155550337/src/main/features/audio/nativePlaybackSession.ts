import type { MpvClient, MpvMessage } from './mpvClient'
import type { PlaybackCoordinator } from './nativePlaybackTypes'

/** Owns logical lifetimes, one transport command queue, and decoder read leases. */
export class NativePlaybackSession {
  id = -1
  client: MpvClient | null = null
  private lifetime = new AbortController()
  private serial: Promise<unknown> = Promise.resolve()
  private currentReadLease: string | null = null
  private nextReadLease: string | null = null
  private readonly retiredReadLeases = new Set<string>()
  private loadEvents: MpvMessage[] | null = null
  private expectedEntryId: number | null = null
  private eventSession = -1
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
    this.lifetime.abort()
    this.failLoad(new Error('Playback replaced'))
    for (const lease of [this.currentReadLease, this.nextReadLease]) {
      if (lease) this.retiredReadLeases.add(lease)
    }
    this.currentReadLease = null
    this.nextReadLease = null
    this.loadEvents = null
    this.expectedEntryId = null
    this.eventSession = -1
    this.id = id
    this.lifetime = new AbortController()
  }

  isCurrent(id: number, client: MpvClient): boolean {
    return !this.signal.aborted && id === this.id && client === this.client
  }

  /** Gate the first load by mpv's unique entry ID, including events before its reply. */
  routeEvent(event: MpvMessage, accept: (event: MpvMessage, session: number) => void): void {
    if (this.signal.aborted) return
    if (this.loadEvents) {
      this.loadEvents.push(event)
      return
    }
    if (this.expectedEntryId !== null) {
      if (event.event !== 'start-file' || event.playlist_entry_id !== this.expectedEntryId) return
      this.expectedEntryId = null
      this.eventSession = this.id
    }
    if (this.eventSession === this.id) accept(event, this.id)
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
    if (this.currentReadLease) this.coordinator?.markReadLeaseCurrent?.(this.currentReadLease)
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

  load(
    client: MpvClient,
    path: string,
    accept: (event: MpvMessage, session: number) => void,
  ): Promise<void> {
    const session = this.id
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => waiter.reject(new Error('mpv file load timed out')), 15_000)
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
      const events: MpvMessage[] = []
      this.loadEvents = events
      void (async () => {
        await client.command('loadfile', path, 'replace', -1, {})
        // loadfile only edits the playlist. Its acknowledgement is not an unload barrier.
        const entryId = await client.command('get_property', 'playlist/0/id')
        if (!this.isCurrent(session, client) || this.loadedWaiter !== waiter) return
        if (typeof entryId !== 'number') throw new Error('Invalid mpv replacement entry ID')
        this.expectedEntryId = entryId
        this.loadEvents = null
        for (const event of events) {
          if (!this.isCurrent(session, client)) return
          this.routeEvent(event, accept)
        }
      })().catch((error: Error) => waiter.reject(error))
    })
  }

  finishLoad(): void {
    // A matching file-loaded confirms that the previous decoder was unloaded.
    for (const lease of this.retiredReadLeases) this.coordinator?.releaseReadLease(lease)
    this.retiredReadLeases.clear()
    this.loadedWaiter?.resolve()
    this.loadedWaiter = null
  }

  failLoad(error: Error): void {
    this.loadedWaiter?.reject(error)
    this.loadedWaiter = null
  }

  release(): Promise<void> {
    const leases = [this.currentReadLease, this.nextReadLease, ...this.retiredReadLeases]
    this.retiredReadLeases.clear()
    this.currentReadLease = null
    this.nextReadLease = null
    const closed = this.client?.close()
    this.lifetime.abort()
    this.loadEvents = null
    this.expectedEntryId = null
    this.eventSession = -1
    this.client = null
    this.failLoad(new Error('Playback replaced'))
    // Capture the old leases: a new session may start before this process exits.
    return Promise.resolve(closed).then(() => {
      for (const lease of leases) if (lease) this.coordinator?.releaseReadLease(lease)
    })
  }
}
