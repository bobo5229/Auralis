import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { extname } from 'node:path'
import { stat } from 'node:fs/promises'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { verifyWrittenMetadata } from '../metadata/verifyWrittenMetadata'
import { verifyPreservedAudioTags } from '../metadata/verifyPreservedAudioTags'
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
import { readMpvTimestampOrigin } from './softTransition'
import type { MpvClient } from './mpvClient'
import type { NativePlaybackSession } from './nativePlaybackSession'
import type {
  LogicalPlaybackView,
  NativePlaybackOptions,
  NextTrackRequest,
} from './nativePlaybackTypes'

interface TagWriteScheduling {
  canBeginTagWrite(): boolean
  suspendPreparation(): NextTrackRequest | null
  cancelNext(client: MpvClient): Promise<void>
  deferPrevious(request: NextTrackRequest | null): void
  drainAnalysis(): Promise<void>
  restoreDeferredNext(): void
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

interface TagWriteAttempt {
  readonly filePath: string
  readonly window: TagPlaybackWindow
  readonly client: MpvClient
  readonly session: number
  readonly signal: AbortSignal
}

function createTagPlaybackWindow(): TagPlaybackWindow {
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
  return {
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
}

/** Owns the write window and recovery audio, including audio retained after a save ends. */
export class BufferedTagPlayback {
  private tagAudioEligible = false
  private tagWindow: TagPlaybackWindow | null = null
  private tagFallback: TagAudioSnapshot | null = null
  private frozenTagTime: number | null = null
  private tagDecodeOffset = 0
  private tagSeekLoading = false
  private readonly tagFiles = new Set<TagAudioSnapshot>()

  constructor(
    private readonly options: Pick<
      NativePlaybackOptions,
      'mpvPath' | 'ffmpegPath' | 'coordinator' | 'warn' | 'suspendFileReaders'
    >,
    private readonly runtime: NativePlaybackSession,
    private readonly read: () => LogicalPlaybackView,
    private readonly scheduling: TagWriteScheduling,
    private readonly loaded: (currentTime: number) => void,
    private readonly failure: (error: Error) => void,
  ) {}

  isActive(): boolean {
    return this.tagWindow !== null
  }

  get decodeOffset(): number {
    return this.tagDecodeOffset
  }

  get fallbackPath(): string | null {
    return this.tagFallback?.path ?? null
  }

  get spectrumBuffer(): TagAudioBuffer | null {
    return this.tagWindow?.phase === 'bridge' ? this.tagWindow.buffer : null
  }

  get ignoresIdle(): boolean {
    return !!this.tagWindow?.resumeFailed && this.tagWindow.loading
  }

  canWriteMetadata(filePath: string): boolean {
    return (
      this.read().loaded &&
      this.tagAudioEligible &&
      this.scheduling.canBeginTagWrite() &&
      !this.tagWindow &&
      normalizeAudioFilePath(filePath) === normalizeAudioFilePath(this.read().path) &&
      TAG_PLAYBACK_EXTENSIONS.includes(extname(filePath).toLowerCase())
    )
  }

  reset(): void {
    this.tagAudioEligible = false
    this.frozenTagTime = null
    this.tagDecodeOffset = 0
    this.tagSeekLoading = false
    this.tagWindow?.abort.abort()
    this.tagWindow = null
    this.tagFallback = null
  }

  cancelWrite(): void {
    this.tagWindow?.abort.abort()
  }

  onPause(): void {
    if (this.tagWindow) this.frozenTagTime ??= this.read().currentTime
    if (this.tagWindow?.phase === 'queued') this.tagWindow.abort.abort()
  }

  onResume(): void {
    this.frozenTagTime = null
  }

  onStartFile(): boolean {
    if (this.tagSeekLoading) return true
    if (this.tagWindow && this.tagWindow.phase !== 'preparing') {
      this.tagWindow.loading = true
      return true
    }
    return false
  }

  timeFromProperty(
    name: string | undefined,
    data: unknown,
    enteringNext: boolean,
  ): number | undefined {
    if (typeof data !== 'number') return undefined
    if (
      name === 'time-pos' &&
      !enteringNext &&
      !this.tagWindow?.loading &&
      this.tagWindow?.phase !== 'bridge' &&
      !this.tagDecodeOffset &&
      this.frozenTagTime === null
    )
      return data
    if (
      name === 'audio-pts' &&
      !this.tagWindow?.loading &&
      this.frozenTagTime === null &&
      (this.tagWindow?.phase === 'bridge' || this.tagDecodeOffset)
    )
      return Math.max(
        this.read().currentTime,
        data +
          (this.tagWindow?.phase === 'bridge'
            ? this.tagWindow.buffer!.start
            : this.tagDecodeOffset),
      )
    return undefined
  }

  consumeSeekContinuation(): boolean {
    const continuation = this.tagSeekLoading
    this.tagSeekLoading = false
    return continuation
  }

  onLogicalBoundary(): void {
    this.tagFallback = null
    this.tagDecodeOffset = 0
    void this.cleanupTagFiles()
  }

  onPlaybackEnded(finishTail: () => void): void {
    const tag = this.tagWindow
    if (
      tag?.phase === 'bridge' &&
      tag.buffer &&
      tag.buffer.end >= this.read().duration - 1 / tag.buffer.rate
    ) {
      finishTail()
      tag.phase = 'resume'
      tag.resume()
      if (tag.done) this.finishTagWindow(tag)
    } else tag?.abort.abort()
    this.tagFallback = null
  }

  async refreshEligibility(path: string, session: number, client: MpvClient): Promise<boolean> {
    if (this.options.coordinator?.reserveWriteIntent) {
      const tags = await parseAudioMetadata(path, { skipCovers: true }).catch(() => null)
      if (!this.runtime.isCurrent(session, client)) return false
      this.tagAudioEligible =
        !!tags?.format.sampleRate &&
        tags.format.sampleRate <= 192000 &&
        [1, 2].includes(tags.format.numberOfChannels ?? 0)
    }
    return true
  }

  seek(client: MpvClient, time: number): Promise<unknown> | null {
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
      return client.command('loadfile', source.path, 'replace', -1, {
        start: String(time),
        'hr-seek': 'yes',
        'hr-seek-demuxer-offset': '1',
      })
    }
    if (this.tagDecodeOffset) {
      this.tagDecodeOffset = 0
      this.tagSeekLoading = true
      const session = this.runtime.id
      return this.scheduling.cancelNext(client).then(() => {
        if (!this.runtime.isCurrent(session, client)) return
        return client.command(
          'loadfile',
          this.tagFallback?.path ?? this.read().path,
          'replace',
          -1,
          {
            start: String(time),
            'hr-seek': 'yes',
            'hr-seek-demuxer-offset': '1',
          },
        )
      })
    }
    return null
  }

  recoverDecodeError(session: number): boolean {
    const tag = this.tagWindow
    if (!tag?.source || tag.phase === 'preparing' || tag.resumePath === tag.source.path)
      return false
    tag.resumeFailed = true
    tag.resumePath = tag.source.path
    tag.resumeEntry = tag.source.path
    tag.resumeOffset = 0
    tag.loading = true
    this.tagFallback = tag.source
    const client = this.runtime.client!
    void this.runtime
      .enqueue(async () => {
        if (!this.runtime.isCurrent(session, client) || tag !== this.tagWindow) return
        await client.command('loadfile', tag.source!.path, 'replace', -1, {
          start: String(this.read().currentTime),
          'hr-seek': 'yes',
          'hr-seek-demuxer-offset': '1',
        })
      })
      .catch((error: Error) => {
        if (this.runtime.isCurrent(session, client) && tag === this.tagWindow) this.failure(error)
      })
    return true
  }

  get needsLoadHandling(): boolean {
    return this.tagWindow !== null && this.tagWindow.phase !== 'preparing'
  }

  async handleFileLoaded(session: number, client: MpvClient): Promise<boolean> {
    const tag = this.tagWindow
    if (!tag || tag.phase === 'preparing') return false
    const path = await client.command('get_property', 'path')
    const audioPosition = await client.command('get_property', 'audio-pts').catch(() => null)
    if (!this.runtime.isCurrent(session, client) || tag !== this.tagWindow) return true
    if (path !== tag.buffer?.path && path !== tag.resumeEntry) return false
    const inBuffer = path === tag.buffer?.path
    tag.loading = false
    tag.phase = inBuffer ? 'bridge' : 'resume'
    this.tagDecodeOffset = inBuffer ? 0 : tag.resumeOffset
    if (!inBuffer) this.tagFallback = tag.resumePath === tag.source?.path ? tag.source : null
    const mappedTime =
      this.frozenTagTime ??
      (typeof audioPosition === 'number'
        ? audioPosition + (inBuffer ? tag.buffer!.start : this.tagDecodeOffset)
        : this.read().currentTime)
    this.loaded(
      this.frozenTagTime !== null || (!inBuffer && !this.tagDecodeOffset)
        ? mappedTime
        : Math.max(this.read().currentTime, mappedTime),
    )
    if (inBuffer) tag.enter()
    else {
      tag.resume()
      if (tag.done) this.finishTagWindow(tag)
    }
    return true
  }

  cleanup(): Promise<void> {
    return this.cleanupTagFiles()
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
    const client = this.runtime.client!
    const session = this.runtime.id
    const window = createTagPlaybackWindow()
    const signal = AbortSignal.any([window.abort.signal, this.runtime.signal])
    const cancel = () => window.reject(new Error('Tag playback cancelled'))
    signal.addEventListener('abort', cancel, { once: true })
    this.tagWindow = window
    if (this.read().paused) this.frozenTagTime ??= this.read().currentTime
    const nextRequest = this.scheduling.suspendPreparation()
    let prepared: PreparedAudioTagWrite | null = null
    let resumeReaders: (() => void) | null = null
    let committed = false
    let reason: Extract<UpdateTrackMetadataResult, { ok: false }>['reason'] =
      'buffer-preparation-failed'
    const attempt: TagWriteAttempt = { filePath, window, client, session, signal }
    const current = () => this.isCurrentAttempt(attempt)
    const check = () => this.assertCurrentAttempt(attempt)
    try {
      // Cancel and drain speculative readers before taking the write window.
      await this.runtime.enqueue(async () => {
        check()
        await this.scheduling.cancelNext(client)
      })
      this.scheduling.deferPrevious(nextRequest)
      await this.scheduling.drainAnalysis()
      check()
      const original = await stat(filePath)
      window.source = await createTagAudioSnapshot(this.tagFallback?.path ?? this.read().path)
      this.tagFiles.add(window.source)
      prepared = await prepareAudioTagWrite(filePath, metadata, this.options.ffmpegPath)
      check()
      const actual = await stat(filePath)
      if (original.size !== actual.size || original.mtimeMs !== actual.mtimeMs)
        throw new Error('Audio changed while preparing the tag playback snapshot')
      verifyWrittenMetadata(metadata, await parseAudioMetadata(prepared.stagingPath))
      await verifyPreservedAudioTags(filePath, prepared.stagingPath)
      await prepared.assertUnchanged()
      const replacementOrigin = await readMpvTimestampOrigin(
        this.options.mpvPath,
        prepared.stagingPath,
        signal,
      )
      await this.installBuffer(attempt)
      await this.waitForBufferEntry(window)
      check()
      resumeReaders = (await this.options.suspendFileReaders?.(filePath)) ?? null
      await this.scheduling.drainAnalysis()
      check()
      this.runtime.releaseCurrentLease()
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
        await this.restoreCommittedPlayback(attempt, filePath, replacementOrigin)
      }
      if (current() && window.phase !== 'resume' && this.read().loaded) {
        await this.waitForResume(window, signal)
      }
      if (
        window.resumeFailed ||
        (current() &&
          this.read().loaded &&
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
      await this.completeWrite(attempt, intent, prepared, resumeReaders)
    }
  }

  private isCurrentAttempt({ window, client, session, signal }: TagWriteAttempt): boolean {
    return !signal.aborted && this.runtime.isCurrent(session, client) && this.tagWindow === window
  }

  private assertCurrentAttempt(attempt: TagWriteAttempt): void {
    if (!this.isCurrentAttempt(attempt)) throw new Error('Tag playback changed')
  }

  private async installBuffer(context: TagWriteAttempt): Promise<void> {
    const { window, client, signal } = context
    const check = () => this.assertCurrentAttempt(context)
    for (let attempt = 0; attempt < 2; attempt++) {
      check()
      const rawPosition = await client.command('get_property', 'time-pos')
      const position = this.read().paused
        ? (this.frozenTagTime ?? rawPosition)
        : typeof rawPosition === 'number'
          ? rawPosition + this.tagDecodeOffset
          : rawPosition
      if (typeof position !== 'number') throw new Error('Invalid tag buffer playback position')
      const paused = this.read().paused
      const buffer = await prepareTagAudioBuffer(
        this.options.mpvPath,
        this.options.ffmpegPath,
        window.source!.path,
        position,
        this.read().duration,
        paused,
        signal,
      )
      this.tagFiles.add(buffer)
      check()
      const installed = await this.runtime.enqueue(async () => {
        check()
        const time = await client.command('get_property', 'time-pos')
        if (
          typeof time !== 'number' ||
          paused !== this.read().paused ||
          (!paused && buffer.start - time - this.tagDecodeOffset < TAG_BUFFER_LEAD_SECONDS)
        )
          return false
        window.buffer = buffer
        window.resumePath = window.source!.path
        window.resumeOffset = buffer.end
        window.resumeEntry = tagAudioContinuation(
          window.resumePath,
          buffer.end,
          this.read().duration,
          buffer.rate,
          buffer.origin,
        )
        window.phase = 'queued'
        if (paused) this.frozenTagTime = buffer.start
        if (paused) await client.command('loadfile', buffer.path, 'replace', -1, {})
        else await client.command('loadfile', buffer.path, 'append', -1, {})
        if (buffer.end < this.read().duration - 1 / buffer.rate)
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
  }

  private async waitForBufferEntry(window: TagPlaybackWindow): Promise<void> {
    // file-loaded occurs only after mpv has unloaded the original decoder.
    const timeout = setTimeout(() => window.abort.abort(), 20000)
    try {
      await window.entered
    } finally {
      clearTimeout(timeout)
    }
  }

  private async restoreCommittedPlayback(
    attempt: TagWriteAttempt,
    filePath: string,
    replacementOrigin: number,
  ): Promise<void> {
    const { window, client, signal } = attempt
    const current = () => this.isCurrentAttempt(attempt)
    const check = () => this.assertCurrentAttempt(attempt)
    // Keep the snapshot first until the verified replacement is ready to play.
    const lease = await this.options.coordinator!.acquireReadLease(filePath, 'mpv-current', signal)
    if (!current()) {
      this.options.coordinator!.releaseReadLease(lease.leaseId)
      check()
    }
    this.runtime.holdCurrentLease(lease.leaseId)
    await this.runtime.enqueue(async () => {
      check()
      if (this.read().paused) {
        window.resumePath = filePath
        window.resumeEntry = filePath
        window.resumeOffset = 0
        window.loading = true
        await client.command('loadfile', filePath, 'replace', -1, {
          start: String(this.read().currentTime),
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
      if (window.buffer!.end >= this.read().duration - 1 / window.buffer!.rate) return
      const pos = await client.command('get_property', 'playlist-pos')
      if (typeof pos !== 'number') throw new Error('Invalid tag continuation playlist position')
      const entry = tagAudioContinuation(
        filePath,
        window.buffer!.end,
        this.read().duration,
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

  private async waitForResume(window: TagPlaybackWindow, signal: AbortSignal): Promise<void> {
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

  private async completeWrite(
    { filePath, window, client, session }: TagWriteAttempt,
    intent: string,
    prepared: PreparedAudioTagWrite | null,
    resumeReaders: (() => void) | null,
  ): Promise<void> {
    // Releasing either an intent or a promoted lease unblocks queued readers.
    this.options.coordinator!.releaseWriteLease!(intent)
    resumeReaders?.()
    if (prepared) await prepared.dispose().catch(this.options.warn)
    if (
      session === this.runtime.id &&
      client === this.runtime.client &&
      this.tagWindow === window
    ) {
      if (window.phase === 'queued' && window.loading && window.source) {
        // A cancellation can race file-loaded. Retain the song and its snapshot
        // rather than treating a decoder which has already changed as the original.
        await this.runtime
          .enqueue(async () => {
            if (
              client !== this.runtime.client ||
              session !== this.runtime.id ||
              this.tagWindow !== window
            )
              return
            window.phase = 'resume'
            window.resumePath = window.source!.path
            window.resumeEntry = window.source!.path
            window.resumeOffset = 0
            window.loading = true
            this.tagFallback = window.source
            await client.command('loadfile', window.source!.path, 'replace', -1, {
              start: String(this.read().currentTime),
              'hr-seek': 'yes',
              'hr-seek-demuxer-offset': '1',
            })
          })
          .catch(this.options.warn)
      } else if (window.phase === 'preparing' || window.phase === 'queued') {
        await this.runtime
          .enqueue(async () => {
            if (client !== this.runtime.client || session !== this.runtime.id) return
            await client.command('playlist-clear')
            await client.command('set_property', 'file-local-options/end', 'none')
          })
          .catch(this.options.warn)
        this.tagWindow = null
        this.scheduling.restoreDeferredNext()
      } else if (window.phase === 'resume' && !window.loading) this.finishTagWindow(window)
    }
    if (session === this.runtime.id && client === this.runtime.client) {
      // file-loaded can finish the window while staging cleanup is awaiting I/O.
      // Keep the logical file occupied even if that callback already cleared it.
      if (!this.runtime.currentLeaseId && this.read().loaded) {
        const lease = await this.options
          .coordinator!.acquireReadLease(filePath, 'mpv-current', this.runtime.signal)
          .catch(() => null)
        if (lease && session === this.runtime.id && client === this.runtime.client)
          this.runtime.holdCurrentLease(lease.leaseId)
        else if (lease) this.options.coordinator!.releaseReadLease(lease.leaseId)
      }
      this.options.coordinator!.refreshPlaybackCapability?.(filePath)
    }
    if (client !== this.runtime.client || session !== this.runtime.id) {
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

  private finishTagWindow(window: TagPlaybackWindow): void {
    if (this.tagWindow !== window) return
    this.tagWindow = null
    this.options.coordinator?.refreshPlaybackCapability?.(this.read().path)
    this.scheduling.restoreDeferredNext()
    void this.cleanupTagFiles().catch(this.options.warn)
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
}
