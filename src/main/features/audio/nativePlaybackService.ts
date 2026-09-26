import type { NativePlaybackCommand, NativePlaybackEvent } from '@shared/ipc/contracts'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'
import { DigitalSilenceAnalyzer, type DigitalBoundary } from './digitalSilence'
import { SoftTransitionPreparer, type SoftTransition } from './softTransition'

const BOUNDARY_UPDATE_MARGIN_SECONDS = 2

type BoundaryStatus = 'analyzing' | 'unchanged' | 'applied' | 'too-late' | 'cancelled' | 'failed'

interface Options {
  mpvPath: string
  ffmpegPath: string
  resolveTrack: (id: number) => Promise<string>
  emit: (event: NativePlaybackEvent) => void
  warn: (error: unknown) => void
  onBoundaryStatus?: (event: { trackId: number; status: BoundaryStatus }) => void
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
  private updatingBoundary = false
  private serial: Promise<unknown> = Promise.resolve()
  private loadedWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null
  private readonly analyzer: DigitalSilenceAnalyzer
  private readonly transitions: SoftTransitionPreparer
  private transition: { plan: SoftTransition; stage: 'queued' | 'bridge' | 'resume' } | null = null
  private deferredNext: Extract<NativePlaybackCommand, { action: 'next' }> | null = null
  private installingTransition: { bridge: string; original: string } | null = null
  private interruptedTransition: { bridge: string; original: string } | null = null
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
    this.transitions = new SoftTransitionPreparer(options.ffmpegPath, options.mpvPath)
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
    this.disposeTransition()
    this.deferredNext = null
    this.installingTransition = null
    this.interruptedTransition = null
    this.loaded = false
    this.next = null
    this.enteringNext = null
    this.nextGeneration++
    this.loadedWaiter?.reject(new Error('Playback replaced'))
    this.loadedWaiter = null
  }

  private disposeTransition(): void {
    const previous = this.transition
    this.transition = null
    if (previous) void previous.plan.dispose().catch(this.options.warn)
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
      let path: string
      try {
        path = await this.options.resolveTrack(request.trackId)
      } catch (error) {
        if (signal.aborted) return { accepted: false }
        throw error
      }
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
        if (signal.aborted) return { accepted: false }
        this.failure(error instanceof Error ? error : new Error(String(error)))
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
    if (request.action === 'cancel-next' || request.action === 'seek') {
      this.nextGeneration++
      this.scan.abort()
    }
    const client = this.client
    const isCurrent = () => request.session === this.session && client === this.client
    return this.enqueue(async () => {
      if (!isCurrent()) return { accepted: false }
      try {
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
            await this.cancelNext(client)
            if (this.transition) {
              // The visible track is B while the bridge is playing. A seek goes
              // to B's original timeline, never to the short temporary WAV.
              this.transition.stage = 'resume'
              this.enteringNext = null
              await client.command('loadfile', this.path, 'replace', -1, {
                start: String(request.time),
                'hr-seek': 'yes',
                'hr-seek-demuxer-offset': '1',
              })
            } else await client.command('seek', request.time, 'absolute+exact')
            break
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

  private async cancelNext(client: MpvClient): Promise<void> {
    this.deferredNext = null
    if (this.transition?.stage === 'bridge') {
      // B's continuation is part of the current logical track, not a next song.
      // During the bridge no following track is appended (it is deferred).
      this.next = null
      return
    }
    await client.command('playlist-clear')
    this.next = null
    if (this.transition?.stage === 'queued') this.disposeTransition()
    if (this.loaded && !this.enteringNext)
      await client.command('set_property', 'file-local-options/end', 'none')
  }

  private async schedule(
    request: Extract<NativePlaybackCommand, { action: 'next' }>,
  ): Promise<{ accepted: boolean }> {
    if (this.transition && this.transition.stage !== 'queued') {
      this.deferredNext = request
      return { accepted: true }
    }
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
    const result = await this.enqueue(async () => {
      if (
        !isCurrent() ||
        !this.loaded ||
        this.enteringNext ||
        this.snapshot.duration - this.snapshot.currentTime < 1
      )
        return { accepted: false }
      let scheduled = false
      try {
        await this.cancelNext(client)
        if (!isCurrent() || this.enteringNext) return { accepted: false }
        this.next = { id: request.trackId, path: nextPath }
        scheduled = true
        await client.command('loadfile', nextPath, 'append', -1, {})
        return { accepted: isCurrent() }
      } catch (error) {
        if (!isCurrent()) return { accepted: false }
        if (scheduled) {
          try {
            await this.cancelNext(client)
          } catch {
            // Prefer the original schedule failure over cleanup noise.
          }
        }
        throw error
      }
    })
    if (result.accepted && request.softTransition && isCurrent()) {
      void this.refineSoftTransition(client, currentPath, nextPath, request, signal, isCurrent)
    } else if (result.accepted && request.trimDigitalSilence && isCurrent()) {
      // Analysis never holds the command queue or delays the scheduling acknowledgement.
      // Keep scans alive across seek/pause/replanning in this playback lifetime for reuse.
      void this.refineBoundary(
        client,
        currentPath,
        nextPath,
        request.trackId,
        this.lifetime.signal,
        isCurrent,
      )
    }
    return result
  }

  private async refineSoftTransition(
    client: MpvClient,
    currentPath: string,
    nextPath: string,
    request: Extract<NativePlaybackCommand, { action: 'next' }>,
    signal: AbortSignal,
    isCurrent: () => boolean,
  ): Promise<void> {
    let plan: SoftTransition | null = null
    const report = (status: BoundaryStatus) =>
      this.options.onBoundaryStatus?.({ trackId: request.trackId, status })
    try {
      report('analyzing')
      plan = await this.transitions.prepare(
        currentPath,
        nextPath,
        request.trimDigitalSilence,
        signal,
      )
      if (!isCurrent()) return report('cancelled')
      if (!plan) {
        if (request.trimDigitalSilence)
          await this.refineBoundary(
            client,
            currentPath,
            nextPath,
            request.trackId,
            signal,
            isCurrent,
          )
        else report('unchanged')
        return
      }
      const prepared = plan
      const installed = await this.enqueue(async () => {
        const owns = () => isCurrent() && this.loaded && !this.enteringNext
        const ready = async () => {
          if (!owns()) return false
          const time = await client.command('get_property', 'time-pos')
          return (
            owns() &&
            typeof time === 'number' &&
            prepared.outgoingEnd - time >= BOUNDARY_UPDATE_MARGIN_SECONDS
          )
        }
        if (!(await ready())) return false
        const position = await client.command('get_property', 'playlist-pos')
        if (typeof position !== 'number' || !Number.isInteger(position) || position < 0)
          return false
        let installed = false
        this.installingTransition = { bridge: prepared.path, original: nextPath }
        this.updatingBoundary = true
        try {
          // Keep the original B first until both replacements are available.
          await client.command('loadfile', prepared.path, 'append', -1, {})
          await client.command('loadfile', nextPath, 'append', -1, {
            start: String(prepared.incomingResume),
            'hr-seek': 'yes',
            'hr-seek-demuxer-offset': '1',
          })
          if (!(await ready())) return false
          await client.command('playlist-move', position + 2, position + 1)
          await client.command('playlist-move', position + 3, position + 2)
          if (!(await ready())) return false
          await client.command('playlist-remove', position + 3)
          if (!(await ready())) return false
          this.transition = { plan: prepared, stage: 'queued' }
          await client.command(
            'set_property',
            'file-local-options/end',
            String(prepared.outgoingEnd),
          )
          installed = true
          return true
        } finally {
          try {
            if (!installed && owns()) {
              this.transition = null
              await client.command('playlist-clear')
              await client.command('set_property', 'file-local-options/end', 'none')
              await client.command('loadfile', nextPath, 'append', -1, {})
            }
          } finally {
            this.installingTransition = null
            this.updatingBoundary = false
          }
        }
      })
      if (installed) plan = null // The playback lifetime now owns the file.
      report(installed ? 'applied' : isCurrent() ? 'too-late' : 'cancelled')
    } catch (error) {
      report(isCurrent() ? 'failed' : 'cancelled')
      if (isCurrent()) this.options.warn(error)
    } finally {
      if (plan) await plan.dispose().catch(this.options.warn)
    }
  }

  private async refineBoundary(
    client: MpvClient,
    currentPath: string,
    nextPath: string,
    trackId: number,
    signal: AbortSignal,
    isCurrent: () => boolean,
  ): Promise<void> {
    const report = (status: BoundaryStatus) => this.options.onBoundaryStatus?.({ trackId, status })
    try {
      report('analyzing')
      const boundary = await this.analyzer.boundary(currentPath, nextPath, signal)
      if (!isCurrent()) return report('cancelled')
      if (!boundary) return report('unchanged')
      const status = await this.enqueue(() =>
        this.updateBoundary(client, nextPath, boundary, isCurrent),
      )
      report(status)
    } catch (error) {
      report(isCurrent() ? 'failed' : 'cancelled')
      if (isCurrent()) this.options.warn(error)
    }
  }

  private async updateBoundary(
    client: MpvClient,
    nextPath: string,
    boundary: DigitalBoundary,
    isCurrent: () => boolean,
  ): Promise<'applied' | 'too-late' | 'cancelled'> {
    const ownsBoundary = () => isCurrent() && this.loaded && !this.enteringNext
    const end = boundary.end ?? this.snapshot.duration
    if (!ownsBoundary()) return 'cancelled'
    const position = await client.command('get_property', 'playlist-pos')
    if (!ownsBoundary()) return 'cancelled'
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0)
      throw new Error('Invalid mpv playlist position during boundary update')
    const canUpdate = async () => {
      if (!ownsBoundary()) return false
      // Query mpv instead of relying on a possibly delayed time-pos event.
      const time = await client.command('get_property', 'time-pos')
      if (!ownsBoundary()) return false
      const currentPosition = await client.command('get_property', 'playlist-pos')
      return (
        ownsBoundary() &&
        currentPosition === position &&
        typeof time === 'number' &&
        end - time >= BOUNDARY_UPDATE_MARGIN_SECONDS
      )
    }
    const skipped = () => (ownsBoundary() ? ('too-late' as const) : ('cancelled' as const))
    if (!(await canUpdate())) return skipped()
    const nextIndex = position + 1
    let appended = false
    let moved = false
    let replaced = false
    this.updatingBoundary = true
    try {
      // Preserve the ordinary next item until its replacement is accepted by mpv.
      await client.command('loadfile', nextPath, 'append', -1, { start: String(boundary.start) })
      appended = true
      if (!(await canUpdate())) return skipped()
      // Move the replacement ahead first: removing the original directly could
      // stop it if a delayed command arrives just after natural advancement.
      await client.command('playlist-move', nextIndex + 1, nextIndex)
      moved = true
      if (!(await canUpdate())) return skipped()
      await client.command('playlist-remove', nextIndex + 1)
      replaced = true
      if (!(await canUpdate())) return skipped()
      if (boundary.end !== null)
        await client.command('set_property', 'file-local-options/end', String(boundary.end))
      if (!ownsBoundary()) return skipped()
      appended = false
      return 'applied'
    } finally {
      try {
        if (appended && ownsBoundary()) {
          if (moved) {
            // Put the ordinary head first before dropping the trimmed replacement.
            if (replaced) await client.command('loadfile', nextPath, 'append', -1, {})
            if (ownsBoundary()) {
              await client.command('playlist-move', nextIndex + 1, nextIndex)
              if (ownsBoundary()) await client.command('playlist-remove', nextIndex + 1)
              if (ownsBoundary())
                await client.command('set_property', 'file-local-options/end', 'none')
            }
          } else {
            await client.command('playlist-remove', nextIndex + 1)
          }
        }
      } finally {
        this.updatingBoundary = false
      }
    }
  }

  private onEvent(event: MpvMessage, session: number): void {
    if (event.event === 'start-file' && this.loaded) {
      if (this.transition?.stage === 'bridge' || this.transition?.stage === 'resume') {
        this.transition.stage = 'resume'
        return
      }
      if (this.transition?.stage === 'queued') this.transition.stage = 'bridge'
      if (this.installingTransition && !this.transition)
        this.interruptedTransition = this.installingTransition
      // Keep the already-entered item even if a queue cancellation arrives while
      // its decoder is loading. playlist-clear preserves the currently playing entry.
      this.enteringNext = this.next
      this.scan.abort()
      if (this.updatingBoundary && !this.transition) {
        // A slow command may cross the boundary. Keep the entered item and remove
        // any temporary duplicate before a subsequent next-track schedule runs.
        const client = this.client!
        void this.enqueue(async () => {
          if (session === this.session && client === this.client) {
            await client.command('playlist-clear')
            if (session === this.session && client === this.client)
              await client.command('set_property', 'file-local-options/end', 'none')
          }
        }).catch((error: unknown) => {
          if (session === this.session && client === this.client) this.options.warn(error)
        })
      }
    } else if (event.event === 'property-change') {
      if (event.name === 'idle-active' && event.data === true && this.loaded) {
        this.loaded = false
        this.next = null
        this.publish('ended')
        return
      }
      if (event.name === 'time-pos' && typeof event.data === 'number' && !this.enteringNext)
        this.snapshot.currentTime =
          this.transition?.stage === 'bridge'
            ? this.transition.plan.incomingStart + event.data
            : event.data
      if (
        event.name === 'duration' &&
        typeof event.data === 'number' &&
        !this.enteringNext &&
        this.transition?.stage !== 'bridge'
      )
        this.snapshot.duration = event.data
      if (event.name === 'pause' && typeof event.data === 'boolean') this.paused = event.data
      if (event.name === 'paused-for-cache' && typeof event.data === 'boolean')
        this.buffering = event.data
      if (this.loaded) this.publish()
    } else if (event.event === 'file-loaded') {
      void this.fileLoaded(session).catch((error: Error) => {
        if (session === this.session && this.client) this.failure(error)
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
    const interrupted = this.interruptedTransition
    if (interrupted) {
      const actualPath = await client.command('get_property', 'path')
      if (session !== this.session || client !== this.client) return
      this.interruptedTransition = null
      if (actualPath === interrupted.bridge) {
        // Advancement overtook queue installation: abandon the temporary item
        // and load the ordinary next song before committing its logical boundary.
        await client.command('loadfile', interrupted.original, 'replace', -1, {})
        return
      }
    }
    let properties: [unknown, unknown]
    try {
      properties = await Promise.all([
        client.command('get_property', 'duration'),
        client.command('get_property', 'time-pos'),
      ])
    } catch (error) {
      if (session !== this.session || client !== this.client) return
      throw error
    }
    if (session !== this.session || client !== this.client) return
    const [duration, position] = properties
    const continuation = this.transition?.stage === 'resume'
    const boundary = this.loaded && !continuation
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
    if (this.transition?.stage === 'bridge') {
      this.snapshot.duration = this.transition.plan.incomingDuration
      this.snapshot.currentTime += this.transition.plan.incomingStart
    }
    if (continuation) {
      this.disposeTransition()
      const deferred = this.deferredNext
      this.deferredNext = null
      if (deferred) void this.schedule(deferred).catch(this.options.warn)
    }
    this.publish(boundary ? 'boundary' : 'state')
    this.loadedWaiter?.resolve()
    this.loadedWaiter = null
  }
}
