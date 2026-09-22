import type { NativePlaybackCommand, NativePlaybackEvent } from '@shared/ipc/contracts'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'
import { DigitalSilenceAnalyzer } from './digitalSilence'

interface Options {
  mpvPath: string
  ffmpegPath: string
  resolveTrack: (id: number) => Promise<string>
  emit: (event: NativePlaybackEvent) => void
  warn: (error: unknown) => void
  /** Isolated tests can select a null or PCM audio output. */
  mpvArgs?: string[]
}

export class NativePlaybackService {
  private client: MpvClient | null = null
  private lifetime = new AbortController()
  private scan = new AbortController()
  private nextGeneration = 0
  private session = -1
  private loaded = false
  private path = ''
  private next: { id: number; path: string } | null = null
  private enteringNext: { id: number; path: string } | null = null
  private paused = false
  private buffering = false
  private serial: Promise<unknown> = Promise.resolve()
  private loadedWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null
  private readonly analyzer: DigitalSilenceAnalyzer
  private snapshot: NativePlaybackEvent = {
    session: 0,
    kind: 'state',
    trackId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    buffering: false,
  }

  constructor(private readonly options: Options) {
    this.analyzer = new DigitalSilenceAnalyzer(options.ffmpegPath)
  }

  private publish(kind: NativePlaybackEvent['kind'] = 'state', detail?: string): void {
    this.snapshot = {
      ...this.snapshot,
      session: this.session,
      kind,
      detail,
      isPlaying: this.loaded && !this.paused && !this.buffering,
      buffering: this.buffering,
    }
    this.options.emit({ ...this.snapshot })
  }

  private failure(error: Error): void {
    this.loaded = false
    this.loadedWaiter?.reject(error)
    this.loadedWaiter = null
    this.publish('error', error.message)
    this.release()
  }

  private release(): void {
    this.scan.abort()
    this.lifetime.abort()
    this.client?.close()
    this.client = null
    this.loaded = false
    this.next = null
    this.enteringNext = null
    this.nextGeneration++
    this.loadedWaiter?.reject(new Error('Playback replaced'))
    this.loadedWaiter = null
  }

  dispose(): void {
    this.release()
    this.session = -1
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work)
    this.serial = result.catch(() => undefined)
    return result
  }

  async command(request: NativePlaybackCommand): Promise<{ accepted: boolean }> {
    if (request.action === 'start') {
      if (request.session <= this.session) return { accepted: false }
      this.release()
      this.session = request.session
      this.lifetime = new AbortController()
      const signal = this.lifetime.signal
      const path = await this.options.resolveTrack(request.trackId)
      if (signal.aborted) return { accepted: false }
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
      const client = await openMpvClient(
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
      if (signal.aborted) {
        client.close()
        return { accepted: false }
      }
      this.client = client
      try {
        for (const [index, name] of [
          'time-pos',
          'duration',
          'pause',
          'paused-for-cache',
          'idle-active',
        ].entries()) {
          await client.command('observe_property', index + 1, name)
        }
        await client.command('set_property', 'volume', request.volume * 100)
        await client.command('set_property', 'mute', request.muted)
        await new Promise<void>((resolve, reject) => {
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
          void client.command('loadfile', path, 'replace').catch((error: Error) => {
            waiter.reject(error)
          })
        })
        return { accepted: !signal.aborted }
      } catch (error) {
        if (!signal.aborted) this.failure(error instanceof Error ? error : new Error(String(error)))
        throw error
      }
    }
    if (request.action === 'stop') {
      if (request.session < this.session) return { accepted: false }
      this.release()
      this.session = request.session
      return { accepted: true }
    }
    if (request.session !== this.session || !this.client) return { accepted: false }
    if (request.action === 'next') return this.schedule(request)
    if (request.action === 'cancel-next') {
      this.nextGeneration++
      this.scan.abort()
    }
    const client = this.client
    return this.enqueue(async () => {
      if (request.session !== this.session || client !== this.client) return { accepted: false }
      switch (request.action) {
        case 'cancel-next':
          await this.cancelNext(client)
          break
        case 'pause':
          await client.command('set_property', 'pause', true)
          this.paused = true
          this.publish()
          break
        case 'resume':
          await client.command('set_property', 'pause', false)
          this.paused = false
          this.publish()
          break
        case 'seek':
          await client.command('seek', request.time, 'absolute+exact')
          break
        case 'volume':
          await client.command('set_property', 'volume', request.volume * 100)
          await client.command('set_property', 'mute', request.muted)
          break
      }
      return { accepted: true }
    })
  }

  private async cancelNext(client: MpvClient): Promise<void> {
    await client.command('playlist-clear')
    this.next = null
    if (this.loaded && !this.enteringNext)
      await client.command('set_property', 'file-local-options/end', 'none')
  }

  private async schedule(
    request: Extract<NativePlaybackCommand, { action: 'next' }>,
  ): Promise<{ accepted: boolean }> {
    const generation = ++this.nextGeneration
    this.scan.abort()
    this.scan = new AbortController()
    const signal = this.scan.signal
    const client = this.client!
    const currentPath = this.path
    const isCurrent = () =>
      !signal.aborted &&
      generation === this.nextGeneration &&
      request.session === this.session &&
      client === this.client &&
      currentPath === this.path
    const nextPath = await this.options.resolveTrack(request.trackId)
    let boundary: { start: number; end: number | null } | null = null
    if (request.trimDigitalSilence && isCurrent()) {
      try {
        boundary = await this.analyzer.boundary(currentPath, nextPath, signal)
      } catch (error) {
        if (!signal.aborted) this.options.warn(error)
      }
    }
    return this.enqueue(async () => {
      if (
        !isCurrent() ||
        !this.loaded ||
        this.enteringNext ||
        this.snapshot.duration - this.snapshot.currentTime < 1
      )
        return { accepted: false }
      await this.cancelNext(client)
      if (!isCurrent() || this.enteringNext) return { accepted: false }
      this.next = { id: request.trackId, path: nextPath }
      try {
        await client.command(
          'loadfile',
          nextPath,
          'append',
          -1,
          boundary ? { start: String(boundary.start) } : {},
        )
        if (boundary?.end !== null && boundary?.end !== undefined) {
          await client.command('set_property', 'file-local-options/end', String(boundary.end))
        }
        return { accepted: true }
      } catch (error) {
        await this.cancelNext(client)
        throw error
      }
    })
  }

  private onEvent(event: MpvMessage, session: number): void {
    if (event.event === 'start-file' && this.loaded) {
      // Keep the already-entered item even if a queue cancellation arrives while
      // its decoder is loading. playlist-clear preserves the currently playing entry.
      this.enteringNext = this.next
    } else if (event.event === 'property-change') {
      if (event.name === 'idle-active' && event.data === true && this.loaded) {
        this.loaded = false
        this.next = null
        this.publish('ended')
        return
      }
      if (event.name === 'time-pos' && typeof event.data === 'number')
        this.snapshot.currentTime = event.data
      if (event.name === 'duration' && typeof event.data === 'number')
        this.snapshot.duration = event.data
      if (event.name === 'pause' && typeof event.data === 'boolean') this.paused = event.data
      if (event.name === 'paused-for-cache' && typeof event.data === 'boolean')
        this.buffering = event.data
      if (this.loaded) this.publish()
    } else if (event.event === 'file-loaded') {
      void this.fileLoaded(session).catch((error: Error) => {
        if (session === this.session) this.failure(error)
      })
    } else if (event.event === 'end-file' && event.reason === 'error') {
      this.failure(new Error(`mpv could not decode audio: ${event.error ?? 'unknown error'}`))
    } else if (event.event === 'idle' && this.loaded) {
      this.loaded = false
      this.next = null
      this.publish('ended')
    }
  }

  private async fileLoaded(session: number): Promise<void> {
    const client = this.client
    if (!client) return
    const [duration, position] = await Promise.all([
      client.command('get_property', 'duration'),
      client.command('get_property', 'time-pos'),
    ])
    if (session !== this.session || client !== this.client) return
    const boundary = this.loaded
    if (boundary) {
      const next = this.enteringNext ?? this.next
      if (!next) throw new Error('Unexpected mpv playlist transition')
      this.snapshot.trackId = next.id
      this.path = next.path
      this.next = null
      this.enteringNext = null
      this.nextGeneration++
    }
    this.loaded = true
    this.snapshot.duration = typeof duration === 'number' ? duration : 0
    this.snapshot.currentTime = typeof position === 'number' ? position : 0
    this.publish(boundary ? 'boundary' : 'state')
    this.loadedWaiter?.resolve()
    this.loadedWaiter = null
  }
}
