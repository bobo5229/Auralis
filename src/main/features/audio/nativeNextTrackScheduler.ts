import type { MpvClient } from './mpvClient'
import { DigitalSilenceAnalyzer, type DigitalBoundary } from './digitalSilence'
import { SoftTransitionPreparer, type SoftTransition } from './softTransition'
import type { NativePlaybackSession } from './nativePlaybackSession'
import type {
  BoundaryStatus,
  LogicalPlaybackView,
  NativePlaybackOptions,
  NextTrackRequest,
} from './nativePlaybackTypes'

const BOUNDARY_UPDATE_MARGIN_SECONDS = 2

interface TagPlaybackView {
  isActive(): boolean
  readonly decodeOffset: number
}

interface ScheduledSoftTransition {
  plan: SoftTransition
  continuationPath: string
  stage: 'queued' | 'bridge' | 'resume'
  continuationRecovery: 'missing' | 'queued' | null
}

/** Owns speculative next-track work and every soft-transition playlist entry. */
export class NativeNextTrackScheduler {
  private readonly analysisTasks = new Set<Promise<void>>()
  private metadataWrites = 0
  private deferredAnalysis: (() => void) | null = null
  private lastNextRequest: NextTrackRequest | null = null
  private deferredNext: NextTrackRequest | null = null
  private scan = new AbortController()
  private nextGeneration = 0
  private next: { id: number; path: string } | null = null
  private enteringNext: { id: number; path: string } | null = null
  private updatingBoundary = false
  private transition: ScheduledSoftTransition | null = null
  private clearingTransition: ScheduledSoftTransition | null = null
  private installingTransition: { bridge: string; original: string } | null = null
  private interruptedTransition: { bridge: string; original: string } | null = null
  private readonly analyzer: DigitalSilenceAnalyzer
  private readonly transitions: SoftTransitionPreparer

  constructor(
    private readonly options: Pick<
      NativePlaybackOptions,
      'mpvPath' | 'ffmpegPath' | 'resolveTrack' | 'coordinator' | 'warn' | 'onBoundaryStatus'
    >,
    private readonly runtime: NativePlaybackSession,
    private readonly read: () => LogicalPlaybackView,
    private readonly tag: TagPlaybackView,
    private readonly onRecoverySettled: () => void,
  ) {
    this.analyzer = new DigitalSilenceAnalyzer(options.ffmpegPath, options.mpvPath)
    this.transitions = new SoftTransitionPreparer(options.ffmpegPath, options.mpvPath)
  }

  get isEnteringNext(): boolean {
    return this.enteringNext !== null
  }

  get canReuseTransport(): boolean {
    return (
      !this.analysisTasks.size &&
      !this.transition &&
      !this.installingTransition &&
      !this.interruptedTransition &&
      !this.updatingBoundary
    )
  }

  get hasInterruptedLoad(): boolean {
    return this.interruptedTransition !== null
  }

  get isContinuation(): boolean {
    return this.transition?.stage === 'resume'
  }

  get isRecoveringContinuation(): boolean {
    return (
      this.transition !== null &&
      (this.transition.continuationRecovery === 'queued' ||
        (this.clearingTransition === this.transition && this.transition.stage !== 'queued'))
    )
  }

  get bridge(): SoftTransition | null {
    return this.transition?.stage === 'bridge' ? this.transition.plan : null
  }

  canBeginTagWrite(): boolean {
    return (
      (!this.transition || this.transition.stage === 'queued') &&
      !this.installingTransition &&
      !this.enteringNext
    )
  }

  invalidatePreparation(clearRequest = false): void {
    this.nextGeneration++
    this.scan.abort()
    if (clearRequest) {
      this.lastNextRequest = null
      this.deferredNext = null
    }
  }

  suspendPreparation(): NextTrackRequest | null {
    const request = this.lastNextRequest
    this.invalidatePreparation()
    return request
  }

  deferPrevious(request: NextTrackRequest | null): void {
    this.deferredNext ??= this.lastNextRequest === request ? request : null
  }

  async drainAnalysis(): Promise<void> {
    await Promise.allSettled([...this.analysisTasks])
  }

  /** Let existing analysis finish without touching the playlist or its decoder handles. */
  async suspendMetadataAnalysis(): Promise<() => void> {
    this.metadataWrites++
    await this.drainAnalysis()
    let resumed = false
    return () => {
      if (resumed) return
      resumed = true
      this.metadataWrites--
      if (!this.metadataWrites) {
        const analysis = this.deferredAnalysis
        this.deferredAnalysis = null
        analysis?.()
      }
    }
  }

  clearDeferredNext(): void {
    this.deferredNext = null
  }

  reset(): void {
    this.deferredAnalysis = null
    this.lastNextRequest = null
    this.scan.abort()
    this.disposeTransition()
    this.clearingTransition = null
    this.deferredNext = null
    this.installingTransition = null
    this.interruptedTransition = null
    this.next = null
    this.enteringNext = null
    this.nextGeneration++
  }

  endPlayback(): void {
    this.next = null
    this.disposeTransition()
  }

  takeEnteredTrack(): { id: number; path: string } {
    const next = this.enteringNext ?? this.next
    if (!next) throw new Error('Unexpected mpv playlist transition')
    this.next = null
    this.enteringNext = null
    this.nextGeneration++
    return next
  }

  finishContinuation(): void {
    this.disposeTransition()
    this.restoreDeferredNext()
  }

  seekContinuation(client: MpvClient, time: number): Promise<unknown> | null {
    if (!this.transition) return null
    // The visible song is B, even when the decoder is playing its short bridge.
    this.transition.stage = 'resume'
    this.enteringNext = null
    return client.command('loadfile', this.read().path, 'replace', -1, {
      start: String(time),
      'hr-seek': 'yes',
      'hr-seek-demuxer-offset': '1',
    })
  }

  onStartFile(session: number): void {
    if (this.transition?.stage === 'bridge' || this.transition?.stage === 'resume') {
      this.transition.stage = 'resume'
      return
    }
    if (this.transition?.stage === 'queued') this.transition.stage = 'bridge'
    if (this.installingTransition && !this.transition)
      this.interruptedTransition = this.installingTransition
    this.enteringNext = this.next
    this.scan.abort()
    if (this.updatingBoundary && !this.transition) {
      const client = this.runtime.client!
      void this.runtime
        .enqueue(async () => {
          if (this.runtime.isCurrent(session, client)) {
            await client.command('playlist-clear')
            if (this.runtime.isCurrent(session, client))
              await client.command('set_property', 'file-local-options/end', 'none')
          }
        })
        .catch((error: unknown) => {
          if (this.runtime.isCurrent(session, client)) this.options.warn(error)
        })
    }
  }

  async recoverInterruptedLoad(session: number, client: MpvClient): Promise<boolean> {
    const interrupted = this.interruptedTransition
    if (!interrupted) return false
    const actualPath = await client.command('get_property', 'path')
    if (!this.runtime.isCurrent(session, client)) return true
    this.interruptedTransition = null
    if (actualPath !== interrupted.bridge) return false
    await client.command('loadfile', interrupted.original, 'replace', -1, {})
    return true
  }

  restoreDeferredNext(): void {
    const request = this.deferredNext
    this.deferredNext = null
    if (request && this.runtime.client && this.read().loaded)
      void this.schedule(request).catch(this.options.warn)
  }

  private disposeTransition(): void {
    const previous = this.transition
    this.transition = null
    if (previous) void previous.plan.dispose().catch(this.options.warn)
  }

  private trackAnalysis(task: Promise<void>): void {
    this.analysisTasks.add(task)
    void task.finally(() => this.analysisTasks.delete(task)).catch(this.options.warn)
  }

  async cancelNext(client: MpvClient): Promise<void> {
    this.deferredNext = null
    const transition = this.transition
    if (transition?.stage === 'bridge' && transition.continuationRecovery !== 'missing') {
      // B's continuation is part of the current logical track, not a next song.
      // During the bridge no following track is appended (it is deferred).
      this.next = null
      return
    }
    const session = this.runtime.id
    this.clearingTransition = transition
    try {
      if (transition?.continuationRecovery === 'missing') {
        await this.restoreContinuation(client, session, transition)
        return
      }
      const leaseToRelease = this.runtime.nextLeaseId
      await client.command('playlist-clear')
      if (!this.runtime.isCurrent(session, client)) return
      if (transition && this.transition === transition) {
        // A may enter the bridge after the stage check but before playlist-clear.
        // Clear then keeps the active bridge and removes B's continuation.
        // Its start-file may precede file-loaded, or the bridge may already be idle.
        if (transition.stage === 'bridge') {
          await this.restoreContinuation(client, session, transition)
          return
        }
        const actualPath = await client.command('get_property', 'path')
        if (!this.runtime.isCurrent(session, client) || this.transition !== transition) return
        if (actualPath === transition.plan.path) {
          await this.restoreContinuation(client, session, transition)
          return
        }
      }
      // playlist-clear preserves an item whose decoder has already started.
      // Its lease must transfer to current playback in fileLoaded instead.
      if (!this.enteringNext && this.runtime.nextLeaseId === leaseToRelease && leaseToRelease) {
        this.runtime.releaseNextLease()
      }
      this.next = null
      if (this.transition?.stage === 'queued') this.disposeTransition()
      if (this.read().loaded && !this.enteringNext)
        await client.command('set_property', 'file-local-options/end', 'none')
    } finally {
      if (this.clearingTransition === transition) this.clearingTransition = null
      this.onRecoverySettled()
    }
  }

  private async restoreContinuation(
    client: MpvClient,
    session: number,
    transition: ScheduledSoftTransition,
  ): Promise<void> {
    transition.continuationRecovery = 'missing'
    // append-play leaves an active bridge alone, and starts the continuation if
    // IPC delay let the bridge reach EOF. Keep the lease until it loads or fails.
    await client.command('loadfile', transition.continuationPath, 'append-play', -1, {
      start: String(transition.plan.incomingResume),
      'hr-seek': 'yes',
      'hr-seek-demuxer-offset': '1',
    })
    if (this.runtime.isCurrent(session, client) && this.transition === transition)
      transition.continuationRecovery = 'queued'
  }

  async schedule(request: NextTrackRequest): Promise<{ accepted: boolean }> {
    this.lastNextRequest = request
    if (this.tag.isActive()) {
      this.deferredNext = request
      return { accepted: true }
    }
    if (this.transition && this.transition.stage !== 'queued') {
      this.deferredNext = request
      return { accepted: true }
    }
    const generation = ++this.nextGeneration
    this.scan.abort()
    this.scan = new AbortController()
    const signal = this.scan.signal
    const client = this.runtime.client!
    const currentPath = this.read().path
    const isCurrent = () =>
      !signal.aborted &&
      generation === this.nextGeneration &&
      request.session === this.runtime.id &&
      client === this.runtime.client &&
      currentPath === this.read().path
    const nextPath = await this.options.resolveTrack(request.trackId)
    let leaseId: string | null = null
    if (this.options.coordinator) {
      try {
        const lease = await this.options.coordinator.acquireReadLease(nextPath, 'mpv-next', signal)
        leaseId = lease.leaseId
      } catch (error) {
        if (!isCurrent()) return { accepted: false }
        throw error
      }
    }
    if (!isCurrent()) {
      if (leaseId) this.options.coordinator?.releaseReadLease(leaseId)
      return { accepted: false }
    }
    const result = await this.runtime.enqueue(async () => {
      if (
        !isCurrent() ||
        !this.read().loaded ||
        this.enteringNext ||
        this.read().duration - this.read().currentTime < 1
      ) {
        if (leaseId) this.options.coordinator?.releaseReadLease(leaseId)
        return { accepted: false }
      }
      let scheduled = false
      try {
        await this.cancelNext(client)
        if (!isCurrent() || this.enteringNext) {
          if (leaseId) this.options.coordinator?.releaseReadLease(leaseId)
          return { accepted: false }
        }
        if (
          leaseId &&
          !this.options.coordinator!.isReadLeaseForTrack(leaseId, request.trackId, nextPath)
        ) {
          this.options.coordinator!.releaseReadLease(leaseId)
          return { accepted: false }
        }
        this.next = { id: request.trackId, path: nextPath }
        this.runtime.holdNextLease(leaseId)
        scheduled = true
        await client.command('loadfile', nextPath, 'append', -1, {})
        return { accepted: isCurrent() }
      } catch (error) {
        if (leaseId && this.runtime.nextLeaseId !== leaseId) {
          this.options.coordinator?.releaseReadLease(leaseId)
        }
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
    if (result.accepted && isCurrent()) {
      const analyze = () => {
        if (!isCurrent()) return
        if (request.softTransition)
          this.trackAnalysis(
            this.refineSoftTransition(client, currentPath, nextPath, request, signal, isCurrent),
          )
        else if (request.trimDigitalSilence)
          this.trackAnalysis(
            this.refineBoundary(client, currentPath, nextPath, request.trackId, signal, isCurrent),
          )
      }
      // A save gates file analysis, not playlist scheduling. Resume the latest
      // still-current refinement without canceling or reloading its next item.
      if (this.metadataWrites) this.deferredAnalysis = analyze
      else analyze()
    }
    return result
  }

  private async refineSoftTransition(
    client: MpvClient,
    currentPath: string,
    nextPath: string,
    request: NextTrackRequest,
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
      const installed = await this.runtime.enqueue(async () => {
        const owns = () => isCurrent() && this.read().loaded && !this.enteringNext
        const ready = async () => {
          if (!owns()) return false
          const time = await client.command('get_property', 'time-pos')
          return (
            owns() &&
            typeof time === 'number' &&
            prepared.outgoingEnd - time - this.tag.decodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS
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
          this.transition = {
            plan: prepared,
            continuationPath: nextPath,
            stage: 'queued',
            continuationRecovery: null,
          }
          await client.command(
            'set_property',
            'file-local-options/end',
            String(prepared.outgoingEnd - this.tag.decodeOffset),
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
      const status = await this.runtime.enqueue(() =>
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
    const ownsBoundary = () => isCurrent() && this.read().loaded && !this.enteringNext
    const end = boundary.end ?? this.read().duration
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
        end - time - this.tag.decodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS
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
      await client.command('loadfile', nextPath, 'append', -1, {
        start: String(boundary.start),
        'hr-seek': 'yes',
        'hr-seek-demuxer-offset': '1',
      })
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
        await client.command(
          'set_property',
          'file-local-options/end',
          String(boundary.end - this.tag.decodeOffset),
        )
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
}
