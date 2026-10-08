import type {
  NativePlaybackCommand,
  NativePlaybackEvent,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'
import type { SpectrumSource } from './playbackSpectrumService'
import { BufferedTagPlayback } from './bufferedTagPlayback'
import { NativeNextTrackScheduler } from './nativeNextTrackScheduler'
import { NativePlaybackSession } from './nativePlaybackSession'
import type { LogicalPlaybackView, NativePlaybackOptions } from './nativePlaybackTypes'

export type { PlaybackCoordinator } from './nativePlaybackTypes'

/** Main-process facade: owns the logical song and publishes its single playback snapshot. */
export class NativePlaybackService {
  private readonly runtime: NativePlaybackSession
  private readonly tags: BufferedTagPlayback
  private readonly scheduler: NativeNextTrackScheduler
  private loaded = false
  private path = ''
  private paused = false
  private buffering = false
  private snapshot: NativePlaybackEvent = {
    session: 0,
    kind: 'state',
    trackId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    buffering: false,
  }

  constructor(private readonly options: NativePlaybackOptions) {
    this.runtime = new NativePlaybackSession(options.coordinator)
    const read = (): LogicalPlaybackView => ({
      loaded: this.loaded,
      path: this.path,
      paused: this.paused,
      currentTime: this.snapshot.currentTime,
      duration: this.snapshot.duration,
    })
    this.tags = new BufferedTagPlayback(
      options,
      this.runtime,
      read,
      {
        canBeginTagWrite: () => this.scheduler.canBeginTagWrite(),
        suspendPreparation: () => this.scheduler.suspendPreparation(),
        cancelNext: (client) => this.scheduler.cancelNext(client),
        deferPrevious: (request) => this.scheduler.deferPrevious(request),
        drainAnalysis: () => this.scheduler.drainAnalysis(),
        restoreDeferredNext: () => this.scheduler.restoreDeferredNext(),
      },
      (time) => {
        this.loaded = true
        this.snapshot.currentTime = time
        this.publish()
      },
      (error) => this.failure(error),
    )
    this.scheduler = new NativeNextTrackScheduler(options, this.runtime, read, this.tags)
  }

  canWriteMetadata(filePath: string): boolean {
    return this.tags.canWriteMetadata(filePath)
  }

  writeMetadata(
    filePath: string,
    metadata: EditableTrackMetadata,
    commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
  ): Promise<UpdateTrackMetadataResult> {
    return this.tags.writeMetadata(filePath, metadata, commitAndReconcile)
  }

  /** Read-only view of the actual decoder source, including transition bridges. */
  getSpectrumSource(): SpectrumSource | null {
    if (!this.loaded || this.snapshot.trackId === null) return null
    const bridge = this.scheduler.bridge
    const tag = this.tags.spectrumBuffer
    return {
      trackId: this.snapshot.trackId,
      path: tag?.path ?? bridge?.path ?? this.tags.fallbackPath ?? this.path,
      currentTime: this.snapshot.currentTime,
      isPlaying: this.snapshot.isPlaying,
      timelineOffset: tag?.start ?? bridge?.incomingStart ?? 0,
    }
  }

  private publish(kind: NativePlaybackEvent['kind'] = 'state', detail?: string): void {
    this.snapshot = {
      ...this.snapshot,
      session: this.runtime.id,
      kind,
      detail,
      isPlaying: this.loaded && !this.paused && !this.buffering,
      buffering: this.buffering,
    }
    this.options.emit({ ...this.snapshot })
  }

  private failure(error: Error): void {
    this.loaded = false
    this.runtime.failLoad(error)
    this.publish('error', error.message)
    this.release()
  }

  private release(): Promise<void> {
    this.tags.reset()
    const closed = this.runtime.release()
    this.scheduler.reset()
    this.loaded = false
    return closed.then(() => this.tags.cleanup())
  }

  dispose(): Promise<void> {
    const closed = this.release()
    this.runtime.id = -1
    return closed
  }

  async command(request: NativePlaybackCommand): Promise<{ accepted: boolean }> {
    if (request.action === 'start') return this.start(request)
    if (request.action === 'stop') {
      if (request.session < this.runtime.id) return { accepted: false }
      const closed = this.release()
      this.runtime.id = request.session
      await closed
      return { accepted: true }
    }
    if (request.session !== this.runtime.id || !this.runtime.client) return { accepted: false }
    if (request.action === 'next') return this.scheduler.schedule(request)
    if (request.action === 'cancel-next' || request.action === 'seek')
      this.scheduler.invalidatePreparation(request.action === 'cancel-next')
    if (request.action === 'seek') this.tags.cancelWrite()
    const client = this.runtime.client
    const isCurrent = () => this.runtime.isCurrent(request.session, client)
    return this.runtime.enqueue(async () => {
      if (!isCurrent()) return { accepted: false }
      try {
        switch (request.action) {
          case 'cancel-next':
            if (this.tags.isActive()) this.scheduler.clearDeferredNext()
            else await this.scheduler.cancelNext(client)
            break
          case 'pause':
            await client.command('set_property', 'pause', true)
            this.paused = true
            this.tags.onPause()
            this.publish()
            break
          case 'resume':
            this.tags.onResume()
            await client.command('set_property', 'pause', false)
            this.paused = false
            this.publish()
            break
          case 'seek': {
            const tagSeek = this.tags.seek(client, request.time)
            if (tagSeek) {
              await tagSeek
              if (!isCurrent()) return { accepted: false }
              break
            }
            await this.scheduler.cancelNext(client)
            if (!isCurrent()) return { accepted: false }
            const continuation = this.scheduler.seekContinuation(client, request.time)
            if (continuation) await continuation
            else await client.command('seek', request.time, 'absolute+exact')
            break
          }
          case 'volume':
            await client.command('set_property', 'volume', request.volume * 100)
            await client.command('set_property', 'mute', request.muted)
            break
        }
        return { accepted: true }
      } catch (error) {
        if (!isCurrent()) return { accepted: false }
        throw error
      }
    })
  }

  private async start(
    request: Extract<NativePlaybackCommand, { action: 'start' }>,
  ): Promise<{ accepted: boolean }> {
    if (request.session <= this.runtime.id) return { accepted: false }
    this.release()
    this.runtime.begin(request.session)
    const signal = this.runtime.signal
    let path: string
    try {
      path = await this.options.resolveTrack(request.trackId)
    } catch (error) {
      if (signal.aborted) return { accepted: false }
      throw error
    }
    if (signal.aborted) return { accepted: false }
    let leaseId: string | null = null
    if (this.options.coordinator) {
      try {
        const lease = await this.options.coordinator.acquireReadLease(path, 'mpv-current', signal)
        leaseId = lease.leaseId
      } catch (error) {
        if (signal.aborted) return { accepted: false }
        throw error
      }
    }
    if (signal.aborted) {
      if (leaseId) this.options.coordinator?.releaseReadLease(leaseId)
      return { accepted: false }
    }
    this.runtime.holdCurrentLease(leaseId)
    this.path = path
    this.paused = false
    this.buffering = false
    this.snapshot = {
      session: request.session,
      kind: 'state',
      trackId: request.trackId,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      buffering: false,
    }
    let client: MpvClient
    try {
      client = await openMpvClient(
        this.options.mpvPath,
        (event) => {
          if (!signal.aborted) this.onEvent(event, request.session)
        },
        (error) => {
          if (!signal.aborted) this.failure(error)
        },
        signal,
        this.options.mpvArgs,
      )
    } catch (error) {
      if (signal.aborted) return { accepted: false }
      throw error
    }
    if (signal.aborted) {
      client.close()
      return { accepted: false }
    }
    this.runtime.client = client
    try {
      for (const [index, name] of [
        'time-pos',
        'duration',
        'pause',
        'paused-for-cache',
        'idle-active',
        'audio-pts',
      ].entries()) {
        await client.command('observe_property', index + 1, name)
      }
      await client.command('set_property', 'volume', request.volume * 100)
      await client.command('set_property', 'mute', request.muted)
      await this.runtime.load(client, path)
      return { accepted: !signal.aborted }
    } catch (error) {
      if (signal.aborted) return { accepted: false }
      this.failure(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  private onEvent(event: MpvMessage, session: number): void {
    if (event.event === 'start-file' && this.loaded) {
      if (!this.tags.onStartFile()) this.scheduler.onStartFile(session)
    } else if (event.event === 'property-change') {
      if (event.name === 'idle-active' && event.data === true && this.loaded) {
        if (!this.tags.ignoresIdle) this.playbackEnded()
        return
      }
      const time = this.tags.timeFromProperty(event.name, event.data, this.scheduler.isEnteringNext)
      if (time !== undefined)
        this.snapshot.currentTime =
          event.name === 'time-pos' && this.scheduler.bridge
            ? this.scheduler.bridge.incomingStart + time
            : time
      if (
        event.name === 'duration' &&
        typeof event.data === 'number' &&
        !this.scheduler.isEnteringNext &&
        !this.tags.isActive() &&
        !this.scheduler.bridge
      )
        this.snapshot.duration = event.data + this.tags.decodeOffset
      if (event.name === 'pause' && typeof event.data === 'boolean') this.paused = event.data
      if (event.name === 'paused-for-cache' && typeof event.data === 'boolean')
        this.buffering = event.data
      if (this.loaded) this.publish()
    } else if (event.event === 'file-loaded') {
      void this.fileLoaded(session).catch((error: Error) => {
        if (session === this.runtime.id && this.runtime.client) this.failure(error)
      })
    } else if (event.event === 'end-file' && event.reason === 'error') {
      if (!this.tags.recoverDecodeError(session))
        this.failure(new Error(`mpv could not decode audio: ${event.error ?? 'unknown error'}`))
    } else if (event.event === 'idle' && this.loaded && !this.tags.ignoresIdle) {
      this.playbackEnded()
    }
  }

  private playbackEnded(): void {
    this.tags.onPlaybackEnded(() => {
      this.snapshot.currentTime = this.snapshot.duration
    })
    this.loaded = false
    this.scheduler.endPlayback()
    this.runtime.releasePlaybackLeases()
    this.publish('ended')
    void this.tags.cleanup().catch(this.options.warn)
  }

  private async fileLoaded(session: number): Promise<void> {
    const client = this.runtime.client
    if (!client) return
    // A tag continuation is the same logical song; a soft bridge can introduce B.
    if (this.tags.needsLoadHandling && (await this.tags.handleFileLoaded(session, client))) return
    if (
      this.scheduler.hasInterruptedLoad &&
      (await this.scheduler.recoverInterruptedLoad(session, client))
    )
      return
    let properties: [unknown, unknown]
    try {
      properties = await Promise.all([
        client.command('get_property', 'duration'),
        client.command('get_property', 'time-pos'),
      ])
    } catch (error) {
      if (!this.runtime.isCurrent(session, client)) return
      throw error
    }
    if (!this.runtime.isCurrent(session, client)) return
    const [duration, position] = properties
    const tagContinuation = this.tags.consumeSeekContinuation()
    const continuation = this.scheduler.isContinuation || tagContinuation
    const boundary = this.loaded && !continuation
    if (boundary) {
      const next = this.scheduler.takeEnteredTrack()
      this.snapshot.trackId = next.id
      this.path = next.path
      this.tags.onLogicalBoundary()
      this.runtime.advanceLease()
    }
    this.loaded = true
    if (
      this.options.coordinator?.reserveWriteIntent &&
      !(await this.tags.refreshEligibility(this.path, session, client))
    )
      return
    this.snapshot.duration = typeof duration === 'number' ? duration : 0
    this.snapshot.currentTime = typeof position === 'number' ? position : 0
    const bridge = this.scheduler.bridge
    if (bridge) {
      this.snapshot.duration = bridge.incomingDuration
      this.snapshot.currentTime += bridge.incomingStart
    }
    if (continuation) this.scheduler.finishContinuation()
    this.publish(boundary ? 'boundary' : 'state')
    this.options.coordinator?.refreshPlaybackCapability?.(this.path)
    this.runtime.finishLoad()
  }
}
