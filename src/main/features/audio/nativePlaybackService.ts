import type {
  NativePlaybackCommand,
  NativePlaybackEvent,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { verifyWrittenMetadata } from '../metadata/verifyWrittenMetadata'
import { prepareAudioTagWrite, type PreparedAudioTagWrite } from '../metadata/audioTagWriteService'
import { normalizeAudioFilePath } from './playbackFileCoordinator'
import {
  createTagAudioSnapshot,
  prepareTagAudioBuffer,
  tagAudioContinuation,
  TAG_BUFFER_LEAD_SECONDS,
  TAG_PLAYBACK_EXTENSIONS,
  type TagAudioSnapshot,
  type TagAudioBuffer,
} from './tagAudioBuffer'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'
import { DigitalSilenceAnalyzer, type DigitalBoundary } from './digitalSilence'
import {
  SoftTransitionPreparer,
  readMpvTimestampOrigin,
  type SoftTransition,
} from './softTransition'
import type { SpectrumSource } from './playbackSpectrumService'

const BOUNDARY_UPDATE_MARGIN_SECONDS = 2

type BoundaryStatus = 'analyzing' | 'unchanged' | 'applied' | 'too-late' | 'cancelled' | 'failed'

export interface PlaybackCoordinator {
  acquireReadLease: (
    filePath: string,
    sourceId: string,
    signal?: AbortSignal,
  ) => Promise<{ leaseId: string; version: number }>
  releaseReadLease: (leaseId: string) => void
  reserveWriteIntent?: (filePath: string) => string | null
  promoteWriteIntent?: (leaseId: string) => void
  releaseWriteLease?: (leaseId: string) => void
  refreshPlaybackCapability?: (filePath: string) => void
}

interface Options {
  mpvPath: string
  ffmpegPath: string
  resolveTrack: (id: number) => Promise<string>
  coordinator?: PlaybackCoordinator
  emit: (event: NativePlaybackEvent) => void
  warn: (error: unknown) => void
  onBoundaryStatus?: (event: { trackId: number; status: BoundaryStatus }) => void
  /** Isolated tests can select a null or PCM audio output. */
  mpvArgs?: string[]
  suspendFileReaders?: (filePath: string) => Promise<() => void>
}

interface TagPlaybackWindow {
  done: boolean
  loading: boolean
  abort: AbortController
  phase: 'preparing' | 'queued' | 'bridge' | 'resume'
  buffer: TagAudioBuffer | null
  source: TagAudioSnapshot | null
  resumePath: string
  resumeEntry: string
  resumeOffset: number
  entered: Promise<void>
  enter: () => void
  reject: (error: Error) => void
  resumed: Promise<void>
  resume: () => void
  resumeFailed: boolean
}

export class NativePlaybackService {
  private tagAudioEligible = false
  private tagWindow: TagPlaybackWindow | null = null
  private tagFallback: TagAudioSnapshot | null = null
  private frozenTagTime: number | null = null
  private tagDecodeOffset = 0
  private tagSeekLoading = false
  private readonly tagFiles = new Set<TagAudioSnapshot>()
  private readonly analysisTasks = new Set<Promise<void>>()
  private lastNextRequest: Extract<NativePlaybackCommand, { action: 'next' }> | null = null
  private client: MpvClient | null = null
  private lifetime = new AbortController()
  private scan = new AbortController()
  private nextGeneration = 0
  private session = -1
  private loaded = false
  private path = ''
  private currentReadLease: string | null = null
  private next: { id: number; path: string } | null = null
  private nextReadLease: string | null = null
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

  canWriteMetadata(filePath: string): boolean {
    return (
      this.loaded &&
      this.tagAudioEligible &&
      (!this.transition || this.transition.stage === 'queued') &&
      !this.installingTransition &&
      !this.enteringNext &&
      !this.tagWindow &&
      normalizeAudioFilePath(filePath) === normalizeAudioFilePath(this.path) &&
      TAG_PLAYBACK_EXTENSIONS.includes(extname(filePath).toLowerCase())
    )
  }

  /** Write a tag transaction without restarting the output device or the logical song. */
  async writeMetadata(
    filePath: string,
    metadata: EditableTrackMetadata,
    commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
  ): Promise<UpdateTrackMetadataResult> {
    if (!this.canWriteMetadata(filePath)) return { ok: false, reason: 'playback-in-use' }
    const coordinator = this.options.coordinator
    const intent = coordinator?.reserveWriteIntent?.(filePath)
    if (!intent) return { ok: false, reason: 'playback-in-use' }
    const client = this.client!
    const session = this.session
    let enter!: () => void, reject!: (error: Error) => void
    const entered = new Promise<void>((yes, no) => {
      enter = yes
      reject = no
    })
    void entered.catch(() => undefined)
    let resume!: () => void
    const resumed = new Promise<void>((yes) => {
      resume = yes
    })
    const window: TagPlaybackWindow = {
      done: false,
      loading: false,
      abort: new AbortController(),
      phase: 'preparing',
      buffer: null,
      source: null,
      resumePath: '',
      resumeEntry: '',
      resumeOffset: 0,
      entered,
      enter,
      reject,
      resumed,
      resume,
      resumeFailed: false,
    }
    const signal = AbortSignal.any([window.abort.signal, this.lifetime.signal])
    const cancel = () => reject(new Error('Tag playback cancelled'))
    signal.addEventListener('abort', cancel, { once: true })
    this.tagWindow = window
    if (this.paused) this.frozenTagTime ??= this.snapshot.currentTime
    const nextRequest = this.lastNextRequest
    this.nextGeneration++
    this.scan.abort()
    let prepared: PreparedAudioTagWrite | null = null
    let resumeReaders: (() => void) | null = null
    let committed = false
    let reason: Extract<UpdateTrackMetadataResult, { ok: false }>['reason'] =
      'buffer-preparation-failed'
    const current = () =>
      !signal.aborted &&
      session === this.session &&
      client === this.client &&
      this.tagWindow === window
    const check = () => {
      if (!current()) throw new Error('Tag playback changed')
    }
    try {
      // Cancel and drain speculative readers before taking the write window.
      await this.enqueue(async () => {
        check()
        await this.cancelNext(client)
      })
      this.deferredNext ??= this.lastNextRequest === nextRequest ? nextRequest : null
      await Promise.allSettled([...this.analysisTasks])
      check()
      const original = await stat(filePath)
      window.source = await createTagAudioSnapshot(this.tagFallback?.path ?? this.path)
      this.tagFiles.add(window.source)
      prepared = await prepareAudioTagWrite(filePath, metadata, this.options.ffmpegPath)
      check()
      const actual = await stat(filePath)
      if (original.size !== actual.size || original.mtimeMs !== actual.mtimeMs)
        throw new Error('Audio changed while preparing the tag playback snapshot')
      verifyWrittenMetadata(metadata, await parseAudioMetadata(prepared.stagingPath))
      await this.assertPreservedTags(filePath, prepared.stagingPath)
      await prepared.assertUnchanged()
      const replacementOrigin = await readMpvTimestampOrigin(
        this.options.mpvPath,
        prepared.stagingPath,
        signal,
      )
      for (let attempt = 0; attempt < 2; attempt++) {
        check()
        const rawPosition = await client.command('get_property', 'time-pos')
        const position = this.paused
          ? (this.frozenTagTime ?? rawPosition)
          : typeof rawPosition === 'number'
            ? rawPosition + this.tagDecodeOffset
            : rawPosition
        if (typeof position !== 'number') throw new Error('Invalid tag buffer playback position')
        const paused = this.paused
        const buffer = await prepareTagAudioBuffer(
          this.options.mpvPath,
          this.options.ffmpegPath,
          window.source.path,
          position,
          this.snapshot.duration,
          paused,
          signal,
        )
        this.tagFiles.add(buffer)
        check()
        const installed = await this.enqueue(async () => {
          check()
          const time = await client.command('get_property', 'time-pos')
          if (
            typeof time !== 'number' ||
            paused !== this.paused ||
            (!paused && buffer.start - time - this.tagDecodeOffset < TAG_BUFFER_LEAD_SECONDS)
          )
            return false
          window.buffer = buffer
          window.resumePath = window.source!.path
          window.resumeOffset = buffer.end
          window.resumeEntry = tagAudioContinuation(
            window.resumePath,
            buffer.end,
            this.snapshot.duration,
            buffer.rate,
            buffer.origin,
          )
          window.phase = 'queued'
          if (paused) this.frozenTagTime = buffer.start
          if (paused) await client.command('loadfile', buffer.path, 'replace', -1, {})
          else await client.command('loadfile', buffer.path, 'append', -1, {})
          if (buffer.end < this.snapshot.duration - 1 / buffer.rate)
            await client.command('loadfile', window.resumeEntry, 'append', -1, {
              'hr-seek': 'yes',
              'hr-seek-demuxer-offset': '1',
            })
          if (!paused)
            await client.command(
              'set_property',
              'file-local-options/end',
              String(buffer.start - this.tagDecodeOffset + 0.25 / buffer.rate),
            )
          return true
        })
        if (installed) break
        this.tagFiles.delete(buffer)
        await buffer.dispose()
        if (attempt === 1) throw new Error('Tag buffer preparation missed the playback deadline')
      }
      // file-loaded occurs only after mpv has unloaded the original decoder.
      const timeout = setTimeout(() => window.abort.abort(), 20000)
      try {
        await entered
      } finally {
        clearTimeout(timeout)
      }
      check()
      resumeReaders = (await this.options.suspendFileReaders?.(filePath)) ?? null
      await Promise.allSettled([...this.analysisTasks])
      check()
      if (this.currentReadLease) {
        coordinator!.releaseReadLease(this.currentReadLease)
        this.currentReadLease = null
      }
      coordinator!.promoteWriteIntent!(intent)
      reason = 'file-in-use'
      await commitAndReconcile(async () => {
        check()
        await prepared!.commit(check)
        committed = true
      })
      coordinator!.releaseWriteLease!(intent)
      resumeReaders?.()
      resumeReaders = null
      if (current() && window.phase === 'bridge') {
        reason = 'playback-restore-failed'
        // Keep the snapshot first until the verified replacement is ready to play.
        const lease = await coordinator!.acquireReadLease(filePath, 'mpv-current', signal)
        if (!current()) {
          coordinator!.releaseReadLease(lease.leaseId)
          check()
        }
        this.currentReadLease = lease.leaseId
        await this.enqueue(async () => {
          check()
          if (this.paused) {
            window.resumePath = filePath
            window.resumeEntry = filePath
            window.resumeOffset = 0
            window.loading = true
            await client.command('loadfile', filePath, 'replace', -1, {
              start: String(this.snapshot.currentTime),
              'hr-seek': 'yes',
              'hr-seek-demuxer-offset': '1',
            })
            return
          }
          const time = await client.command('get_property', 'time-pos')
          if (
            window.phase !== 'bridge' ||
            typeof time !== 'number' ||
            window.buffer!.end - window.buffer!.start - time < TAG_BUFFER_LEAD_SECONDS
          )
            return
          if (window.buffer!.end >= this.snapshot.duration - 1 / window.buffer!.rate) return
          const pos = await client.command('get_property', 'playlist-pos')
          if (typeof pos !== 'number') throw new Error('Invalid tag continuation playlist position')
          const entry = tagAudioContinuation(
            filePath,
            window.buffer!.end,
            this.snapshot.duration,
            window.buffer!.rate,
            replacementOrigin,
          )
          await client.command('loadfile', entry, 'append', -1, {
            'hr-seek': 'yes',
            'hr-seek-demuxer-offset': '1',
          })
          if (!current() || window.phase !== 'bridge') return
          await client.command('playlist-move', pos + 2, pos + 1)
          window.resumePath = filePath
          window.resumeEntry = entry
          window.resumeOffset = window.buffer!.end
          await client.command('playlist-remove', pos + 2)
        })
      }
      if (current() && window.phase !== 'resume' && this.loaded) {
        const timeout = setTimeout(() => window.abort.abort(), 20000)
        let failOnAbort: (() => void) | undefined
        try {
          await Promise.race([
            window.resumed,
            new Promise<void>((_, fail) => {
              if (signal.aborted) fail(new Error('Tag playback changed'))
              else {
                failOnAbort = () => fail(new Error('Tag playback changed'))
                signal.addEventListener('abort', failOnAbort, { once: true })
              }
            }),
          ])
        } finally {
          clearTimeout(timeout)
          if (failOnAbort) signal.removeEventListener('abort', failOnAbort)
        }
      }
      if (
        window.resumeFailed ||
        (current() &&
          this.loaded &&
          window.phase === 'resume' &&
          window.resumePath === window.source?.path)
      )
        return { ok: false, reason: 'playback-restore-failed' }
      return { ok: true }
    } catch (error) {
      this.options.warn(error)
      if (signal.aborted || !current()) reason = 'playback-changed'
      else if (committed) reason = 'playback-restore-failed'
      return { ok: false, reason }
    } finally {
      window.done = true
      signal.removeEventListener('abort', cancel)
      // Releasing either an intent or a promoted lease unblocks queued readers.
      coordinator!.releaseWriteLease!(intent)
      resumeReaders?.()
      if (prepared) await prepared.dispose().catch(this.options.warn)
      if (session === this.session && client === this.client && this.tagWindow === window) {
        if (window.phase === 'queued' && window.loading && window.source) {
          // A cancellation can race file-loaded. Retain the song and its snapshot
          // rather than treating a decoder which has already changed as the original.
          await this.enqueue(async () => {
            if (client !== this.client || session !== this.session || this.tagWindow !== window)
              return
            window.phase = 'resume'
            window.resumePath = window.source!.path
            window.resumeEntry = window.source!.path
            window.resumeOffset = 0
            window.loading = true
            this.tagFallback = window.source
            await client.command('loadfile', window.source!.path, 'replace', -1, {
              start: String(this.snapshot.currentTime),
              'hr-seek': 'yes',
              'hr-seek-demuxer-offset': '1',
            })
          }).catch(this.options.warn)
        } else if (window.phase === 'preparing' || window.phase === 'queued') {
          await this.enqueue(async () => {
            if (client !== this.client || session !== this.session) return
            await client.command('playlist-clear')
            await client.command('set_property', 'file-local-options/end', 'none')
          }).catch(this.options.warn)
          this.tagWindow = null
          this.restoreDeferredNext()
        } else if (window.phase === 'resume' && !window.loading) this.finishTagWindow(window)
      }
      if (session === this.session && client === this.client) {
        // file-loaded can finish the window while staging cleanup is awaiting I/O.
        // Keep the logical file occupied even if that callback already cleared it.
        if (!this.currentReadLease && this.loaded) {
          const lease = await coordinator!
            .acquireReadLease(filePath, 'mpv-current', this.lifetime.signal)
            .catch(() => null)
          if (lease && session === this.session && client === this.client)
            this.currentReadLease = lease.leaseId
          else if (lease) coordinator!.releaseReadLease(lease.leaseId)
        }
        coordinator!.refreshPlaybackCapability?.(filePath)
      }
      if (client !== this.client || session !== this.session) {
        await client.close()
        for (const file of [window.buffer, window.source]) {
          if (file) {
            this.tagFiles.delete(file)
            await file.dispose().catch(this.options.warn)
          }
        }
      }
      await this.cleanupTagFiles()
    }
  }

  private restoreDeferredNext(): void {
    const request = this.deferredNext
    this.deferredNext = null
    if (request && this.client && this.loaded) void this.schedule(request).catch(this.options.warn)
  }

  private async assertPreservedTags(source: string, staging: string): Promise<void> {
    const [before, after] = await Promise.all([
      parseAudioMetadata(source),
      parseAudioMetadata(staging),
    ])
    const edited = new Set([
      'title',
      'artist',
      'artists',
      'album',
      'albumartist',
      'genre',
      'date',
      'year',
    ])
    for (const key of Object.keys(before.common)) {
      if (edited.has(key)) continue
      const name = key as keyof typeof before.common
      if (JSON.stringify(before.common[name]) !== JSON.stringify(after.common[name]))
        throw new Error(`Tag preparation did not preserve ${key}`)
    }
    // Common fields do not include private tags. Reject a remux that loses them,
    // including multiplicity, instead of silently committing a partial tag set.
    const editedNative = new Set([
      'title',
      'artist',
      'artists',
      'album',
      'album_artist',
      'albumartist',
      'genre',
      'date',
      'year',
      'tit2',
      'tt2',
      'tpe1',
      'tp1',
      'tpe2',
      'tp2',
      'talb',
      'tal',
      'tcon',
      'tco',
      'tdrc',
      'tyer',
      'tye',
      'tdat',
      'tda',
      'txxx:date',
      'txxx:year',
      'txxx:album_artist',
      '©nam',
      '©art',
      'aart',
      '©alb',
      '©gen',
      'gnre',
      '©day',
      'inam',
      'iart',
      'iprd',
      'icrd',
      'ignr',
      // Artwork is verified byte-for-byte above; muxer signatures are generated.
      'apic',
      'pic',
      'metadata_block_picture',
      'encoder',
      'tsse',
      'tss',
      'isft',
      '©too',
    ])
    const nativeTags = (tags: typeof before.native) => {
      const values = new Map<string, number>()
      for (const [type, entries] of Object.entries(tags)) {
        for (const tag of entries) {
          if (editedNative.has(tag.id.toLowerCase())) continue
          const key = `${type.startsWith('ID3v2.') ? 'ID3v2' : type}:${tag.id}:${JSON.stringify(tag.value)}`
          values.set(key, (values.get(key) ?? 0) + 1)
        }
      }
      return values
    }
    const afterTags = nativeTags(after.native)
    for (const [tag, count] of nativeTags(before.native))
      if ((afterTags.get(tag) ?? 0) < count)
        throw new Error('Tag preparation did not preserve a native tag')
  }

  private finishTagWindow(window: TagPlaybackWindow): void {
    if (this.tagWindow !== window) return
    this.tagWindow = null
    this.options.coordinator?.refreshPlaybackCapability?.(this.path)
    this.restoreDeferredNext()
    void this.cleanupTagFiles().catch(this.options.warn)
  }

  private trackAnalysis(task: Promise<void>): void {
    this.analysisTasks.add(task)
    void task.finally(() => this.analysisTasks.delete(task)).catch(this.options.warn)
  }

  private async cleanupTagFiles(): Promise<void> {
    const files = [...this.tagFiles].filter(
      (file) =>
        file !== this.tagFallback &&
        file !== this.tagWindow?.buffer &&
        file !== this.tagWindow?.source,
    )
    for (const file of files) this.tagFiles.delete(file)
    for (const file of files) {
      await file.dispose().catch(this.options.warn)
    }
  }

  /** Read-only view of the actual decoder source, including transition bridges. */
  getSpectrumSource(): SpectrumSource | null {
    if (!this.loaded || this.snapshot.trackId === null) return null
    const bridge = this.transition?.stage === 'bridge' ? this.transition.plan : null
    const tag = this.tagWindow?.phase === 'bridge' ? this.tagWindow.buffer : null
    return {
      trackId: this.snapshot.trackId,
      path: tag?.path ?? bridge?.path ?? this.tagFallback?.path ?? this.path,
      currentTime: this.snapshot.currentTime,
      isPlaying: this.snapshot.isPlaying,
      timelineOffset: tag?.start ?? bridge?.incomingStart ?? 0,
    }
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

  private release(): Promise<void> {
    this.tagAudioEligible = false
    this.frozenTagTime = null
    this.tagDecodeOffset = 0
    this.tagSeekLoading = false
    this.tagWindow?.abort.abort()
    this.tagWindow = null
    this.tagFallback = null
    this.lastNextRequest = null
    const leases = [this.currentReadLease, this.nextReadLease]
    this.currentReadLease = null
    this.nextReadLease = null
    const closed = this.client?.close()
    this.scan.abort()
    this.lifetime.abort()
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
    // Killing the child requests shutdown; the file becomes writable only once
    // the process has actually exited and its handles have been released.
    return Promise.resolve(closed).then(async () => {
      for (const lease of leases) if (lease) this.options.coordinator?.releaseReadLease(lease)
      await this.cleanupTagFiles()
    })
  }

  private disposeTransition(): void {
    const previous = this.transition
    this.transition = null
    if (previous) void previous.plan.dispose().catch(this.options.warn)
  }

  dispose(): Promise<void> {
    const closed = this.release()
    this.session = -1
    return closed
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
      this.currentReadLease = leaseId
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
          'audio-pts',
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
      const closed = this.release()
      this.session = request.session
      await closed
      return { accepted: true }
    }
    if (request.session !== this.session || !this.client) return { accepted: false }
    if (request.action === 'next') return this.schedule(request)
    if (request.action === 'cancel-next' || request.action === 'seek') {
      this.nextGeneration++
      this.scan.abort()
    }
    if (request.action === 'cancel-next') {
      this.lastNextRequest = null
      this.deferredNext = null
    }
    if (request.action === 'seek') this.tagWindow?.abort.abort()
    const client = this.client
    const isCurrent = () => request.session === this.session && client === this.client
    return this.enqueue(async () => {
      if (!isCurrent()) return { accepted: false }
      try {
        switch (request.action) {
          case 'cancel-next':
            if (this.tagWindow) this.deferredNext = null
            else await this.cancelNext(client)
            break
          case 'pause':
            await client.command('set_property', 'pause', true)
            this.paused = true
            if (this.tagWindow) this.frozenTagTime ??= this.snapshot.currentTime
            if (this.tagWindow?.phase === 'queued') this.tagWindow.abort.abort()
            this.publish()
            break
          case 'resume':
            this.frozenTagTime = null
            await client.command('set_property', 'pause', false)
            this.paused = false
            this.publish()
            break
          case 'seek':
            this.frozenTagTime = null
            if (this.tagWindow?.source && this.tagWindow.phase !== 'preparing') {
              const window = this.tagWindow
              const source = window.source!
              this.tagFallback = source
              window.resumePath = source.path
              window.resumeEntry = source.path
              window.resumeOffset = 0
              window.loading = true
              window.phase = 'resume'
              await client.command('loadfile', source.path, 'replace', -1, {
                start: String(request.time),
                'hr-seek': 'yes',
                'hr-seek-demuxer-offset': '1',
              })
              break
            }
            if (this.tagDecodeOffset) {
              this.tagDecodeOffset = 0
              this.tagSeekLoading = true
              await this.cancelNext(client)
              await client.command('loadfile', this.tagFallback?.path ?? this.path, 'replace', -1, {
                start: String(request.time),
                'hr-seek': 'yes',
                'hr-seek-demuxer-offset': '1',
              })
              break
            }
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
    const leaseToRelease = this.nextReadLease
    await client.command('playlist-clear')
    // playlist-clear preserves an item whose decoder has already started.
    // Its lease must transfer to current playback in fileLoaded instead.
    if (!this.enteringNext && this.nextReadLease === leaseToRelease && leaseToRelease) {
      this.options.coordinator?.releaseReadLease(leaseToRelease)
      this.nextReadLease = null
    }
    this.next = null
    if (this.transition?.stage === 'queued') this.disposeTransition()
    if (this.loaded && !this.enteringNext)
      await client.command('set_property', 'file-local-options/end', 'none')
  }

  private async schedule(
    request: Extract<NativePlaybackCommand, { action: 'next' }>,
  ): Promise<{ accepted: boolean }> {
    this.lastNextRequest = request
    if (this.tagWindow) {
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
    const client = this.client!
    const currentPath = this.path
    const isCurrent = () =>
      !signal.aborted &&
      generation === this.nextGeneration &&
      request.session === this.session &&
      client === this.client &&
      currentPath === this.path
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
    const result = await this.enqueue(async () => {
      if (
        !isCurrent() ||
        !this.loaded ||
        this.enteringNext ||
        this.snapshot.duration - this.snapshot.currentTime < 1
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
        this.next = { id: request.trackId, path: nextPath }
        this.nextReadLease = leaseId
        scheduled = true
        await client.command('loadfile', nextPath, 'append', -1, {})
        return { accepted: isCurrent() }
      } catch (error) {
        if (leaseId && this.nextReadLease !== leaseId) {
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
    if (result.accepted && request.softTransition && isCurrent()) {
      this.trackAnalysis(
        this.refineSoftTransition(client, currentPath, nextPath, request, signal, isCurrent),
      )
    } else if (result.accepted && request.trimDigitalSilence && isCurrent()) {
      // Analysis never holds the command queue or delays the scheduling acknowledgement.
      // Keep scans alive across seek/pause/replanning in this playback lifetime for reuse.
      this.trackAnalysis(
        this.refineBoundary(
          client,
          currentPath,
          nextPath,
          request.trackId,
          this.scan.signal,
          isCurrent,
        ),
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
            prepared.outgoingEnd - time - this.tagDecodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS
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
            String(prepared.outgoingEnd - this.tagDecodeOffset),
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
        end - time - this.tagDecodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS
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
        await client.command(
          'set_property',
          'file-local-options/end',
          String(boundary.end - this.tagDecodeOffset),
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

  private onEvent(event: MpvMessage, session: number): void {
    if (event.event === 'start-file' && this.loaded) {
      if (this.tagSeekLoading) return
      if (this.tagWindow?.phase === 'queued') {
        this.tagWindow.loading = true
        return
      }
      if (this.tagWindow?.phase === 'bridge' || this.tagWindow?.phase === 'resume') {
        this.tagWindow.loading = true
        return
      }
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
        if (this.tagWindow?.resumeFailed && this.tagWindow.loading) return
        this.playbackEnded()
        return
      }
      if (
        event.name === 'time-pos' &&
        typeof event.data === 'number' &&
        !this.enteringNext &&
        !this.tagWindow?.loading &&
        this.tagWindow?.phase !== 'bridge' &&
        !this.tagDecodeOffset &&
        this.frozenTagTime === null
      )
        this.snapshot.currentTime =
          this.transition?.stage === 'bridge'
            ? this.transition.plan.incomingStart + event.data
            : event.data
      if (
        event.name === 'audio-pts' &&
        typeof event.data === 'number' &&
        !this.tagWindow?.loading &&
        this.frozenTagTime === null &&
        (this.tagWindow?.phase === 'bridge' || this.tagDecodeOffset)
      ) {
        // Unlike time-pos, audio-pts retains negative values while the previous
        // segment is still queued in WASAPI. That preserves the audible timeline.
        this.snapshot.currentTime = Math.max(
          this.snapshot.currentTime,
          event.data +
            (this.tagWindow?.phase === 'bridge'
              ? this.tagWindow.buffer!.start
              : this.tagDecodeOffset),
        )
      }
      if (
        event.name === 'duration' &&
        typeof event.data === 'number' &&
        !this.enteringNext &&
        !this.tagWindow &&
        this.transition?.stage !== 'bridge'
      )
        this.snapshot.duration = event.data + this.tagDecodeOffset
      if (event.name === 'pause' && typeof event.data === 'boolean') this.paused = event.data
      if (event.name === 'paused-for-cache' && typeof event.data === 'boolean')
        this.buffering = event.data
      if (this.loaded) this.publish()
    } else if (event.event === 'file-loaded') {
      void this.fileLoaded(session).catch((error: Error) => {
        if (session === this.session && this.client) this.failure(error)
      })
    } else if (event.event === 'end-file' && event.reason === 'error') {
      const tag = this.tagWindow
      if (tag?.source && tag.phase !== 'preparing' && tag.resumePath !== tag.source.path) {
        tag.resumeFailed = true
        tag.resumePath = tag.source.path
        tag.resumeEntry = tag.source.path
        tag.resumeOffset = 0
        tag.loading = true
        this.tagFallback = tag.source
        const client = this.client!
        void this.enqueue(async () => {
          if (client !== this.client || session !== this.session || tag !== this.tagWindow) return
          await client.command('loadfile', tag.source!.path, 'replace', -1, {
            start: String(this.snapshot.currentTime),
            'hr-seek': 'yes',
            'hr-seek-demuxer-offset': '1',
          })
        }).catch((error: Error) => this.failure(error))
        return
      }
      this.failure(new Error(`mpv could not decode audio: ${event.error ?? 'unknown error'}`))
    } else if (event.event === 'idle' && this.loaded) {
      if (this.tagWindow?.resumeFailed && this.tagWindow.loading) return
      this.playbackEnded()
    }
  }

  private playbackEnded(): void {
    const tag = this.tagWindow
    if (
      tag?.phase === 'bridge' &&
      tag.buffer &&
      tag.buffer.end >= this.snapshot.duration - 1 / tag.buffer.rate
    ) {
      // This is the real end of the logical song, including a shortened tail buffer.
      this.snapshot.currentTime = this.snapshot.duration
      tag.phase = 'resume'
      tag.resume()
      if (tag.done) this.finishTagWindow(tag)
    } else tag?.abort.abort()
    this.loaded = false
    this.next = null
    this.tagFallback = null
    for (const lease of [this.currentReadLease, this.nextReadLease])
      if (lease) this.options.coordinator?.releaseReadLease(lease)
    this.currentReadLease = null
    this.nextReadLease = null
    this.publish('ended')
    void this.cleanupTagFiles().catch(this.options.warn)
  }

  private async fileLoaded(session: number): Promise<void> {
    const client = this.client
    if (!client) return
    const tag = this.tagWindow
    if (tag && tag.phase !== 'preparing') {
      const path = await client.command('get_property', 'path')
      const audioPosition = await client.command('get_property', 'audio-pts').catch(() => null)
      if (session !== this.session || client !== this.client || tag !== this.tagWindow) return
      if (path === tag.buffer?.path || path === tag.resumeEntry) {
        this.loaded = true
        const inBuffer = path === tag.buffer?.path
        tag.loading = false
        tag.phase = inBuffer ? 'bridge' : 'resume'
        this.tagDecodeOffset = inBuffer ? 0 : tag.resumeOffset
        if (!inBuffer) this.tagFallback = tag.resumePath === tag.source?.path ? tag.source : null
        const mappedTime =
          this.frozenTagTime ??
          (typeof audioPosition === 'number'
            ? audioPosition + (inBuffer ? tag.buffer!.start : this.tagDecodeOffset)
            : this.snapshot.currentTime)
        this.snapshot.currentTime =
          this.frozenTagTime !== null || (!inBuffer && !this.tagDecodeOffset)
            ? mappedTime
            : Math.max(this.snapshot.currentTime, mappedTime)
        this.publish()
        if (inBuffer) tag.enter()
        else {
          tag.resume()
          if (tag.done) this.finishTagWindow(tag)
        }
        return
      }
    }
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
    const continuation = this.transition?.stage === 'resume' || this.tagSeekLoading
    this.tagSeekLoading = false
    const boundary = this.loaded && !continuation
    if (boundary) {
      const next = this.enteringNext ?? this.next
      if (!next) throw new Error('Unexpected mpv playlist transition')
      this.snapshot.trackId = next.id
      this.path = next.path
      this.tagFallback = null
      this.tagDecodeOffset = 0
      void this.cleanupTagFiles()
      this.next = null
      this.enteringNext = null
      this.nextGeneration++
      if (this.currentReadLease) {
        this.options.coordinator?.releaseReadLease(this.currentReadLease)
        this.currentReadLease = null
      }
      this.currentReadLease = this.nextReadLease
      this.nextReadLease = null
    }
    this.loaded = true
    if (this.options.coordinator?.reserveWriteIntent) {
      const tags = await parseAudioMetadata(this.path, { skipCovers: true }).catch(() => null)
      if (session !== this.session || client !== this.client) return
      this.tagAudioEligible =
        !!tags?.format.sampleRate &&
        tags.format.sampleRate <= 192000 &&
        [1, 2].includes(tags.format.numberOfChannels ?? 0)
    }
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
    this.options.coordinator?.refreshPlaybackCapability?.(this.path)
    this.loadedWaiter?.resolve()
    this.loadedWaiter = null
  }
}
