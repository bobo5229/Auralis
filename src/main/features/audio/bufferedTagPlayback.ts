import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { AudioTagEdit as EditableTrackMetadata } from '../metadata/audioTagEdit'
import { extname } from 'node:path'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { normalizeAudioFilePath } from './playbackFileCoordinator'
import { TAG_PLAYBACK_EXTENSIONS, type TagAudioBuffer } from './tagAudioBuffer'
import type { MpvClient } from './mpvClient'
import type { NativePlaybackSession } from './nativePlaybackSession'
import type { LogicalPlaybackView } from './nativePlaybackTypes'
import {
  createBufferedTagPlaybackState,
  type BufferedTagPlaybackContext,
  type BufferedTagPlaybackOptions,
  type TagWriteScheduling,
} from './bufferedTagPlaybackState'
import {
  writeBufferedTagMetadata,
  finishTagPlaybackWindow,
  cleanupTagPlaybackFiles,
} from './bufferedTagPlaybackTransaction'

export { retainCommittedPlaybackLease } from './bufferedTagPlaybackTransaction'

/** Owns logical playback events and the shared write/recovery state. */
export class BufferedTagPlayback {
  private readonly state = createBufferedTagPlaybackState()
  private readonly context: BufferedTagPlaybackContext

  constructor(
    private readonly options: BufferedTagPlaybackOptions,
    private readonly runtime: NativePlaybackSession,
    private readonly read: () => LogicalPlaybackView,
    private readonly scheduling: TagWriteScheduling,
    private readonly loaded: (currentTime: number) => void,
    private readonly failure: (error: Error) => void,
  ) {
    this.context = { state: this.state, options, runtime, read, scheduling }
  }

  isActive(): boolean {
    return this.state.tagWindow !== null
  }

  get canReuseTransport(): boolean {
    return (
      !this.state.writesInFlight &&
      !this.state.tagWindow &&
      !this.state.tagFallback &&
      !this.state.tagSeekLoading &&
      !this.state.tagFiles.size
    )
  }

  get decodeOffset(): number {
    return this.state.tagDecodeOffset
  }

  get fallbackPath(): string | null {
    return this.state.tagFallback?.path ?? null
  }

  get spectrumBuffer(): TagAudioBuffer | null {
    return this.state.tagWindow?.phase === 'bridge' ? this.state.tagWindow.buffer : null
  }

  get ignoresIdle(): boolean {
    return !!this.state.tagWindow?.resumeFailed && this.state.tagWindow.loading
  }

  canWriteMetadata(filePath: string): boolean {
    return (
      this.read().loaded &&
      this.state.tagAudioEligible &&
      this.scheduling.canBeginTagWrite() &&
      !this.state.tagWindow &&
      normalizeAudioFilePath(filePath) === normalizeAudioFilePath(this.read().path) &&
      TAG_PLAYBACK_EXTENSIONS.includes(extname(filePath).toLowerCase())
    )
  }

  reset(): void {
    this.state.tagEligibilityGeneration += 1
    this.state.tagAudioEligible = false
    this.state.frozenTagTime = null
    this.state.tagDecodeOffset = 0
    this.state.tagSeekLoading = false
    this.state.tagWindow?.abort.abort()
    this.state.tagWindow = null
    this.state.tagFallback = null
  }

  cancelWrite(): void {
    this.state.tagWindow?.abort.abort()
  }

  onPause(): void {
    if (this.state.tagWindow) this.state.frozenTagTime ??= this.read().currentTime
    if (this.state.tagWindow?.phase === 'queued') this.state.tagWindow.abort.abort()
  }

  onResume(): void {
    this.state.frozenTagTime = null
  }

  onStartFile(): boolean {
    if (this.state.tagSeekLoading) return true
    if (this.state.tagWindow && this.state.tagWindow.phase !== 'preparing') {
      this.state.tagWindow.loading = true
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
      !this.state.tagWindow?.loading &&
      this.state.tagWindow?.phase !== 'bridge' &&
      !this.state.tagDecodeOffset &&
      this.state.frozenTagTime === null
    )
      return data
    if (
      name === 'audio-pts' &&
      !this.state.tagWindow?.loading &&
      this.state.frozenTagTime === null &&
      (this.state.tagWindow?.phase === 'bridge' || this.state.tagDecodeOffset)
    )
      return Math.max(
        this.read().currentTime,
        data +
          (this.state.tagWindow?.phase === 'bridge'
            ? this.state.tagWindow.buffer!.start
            : this.state.tagDecodeOffset),
      )
    return undefined
  }

  consumeSeekContinuation(): boolean {
    const continuation = this.state.tagSeekLoading
    this.state.tagSeekLoading = false
    return continuation
  }

  onLogicalBoundary(): void {
    this.state.tagEligibilityGeneration += 1
    this.state.tagAudioEligible = false
    this.state.tagFallback = null
    this.state.tagDecodeOffset = 0
    void cleanupTagPlaybackFiles(this.context)
  }

  onPlaybackEnded(finishTail: () => void): void {
    const tag = this.state.tagWindow
    if (
      tag?.phase === 'bridge' &&
      tag.buffer &&
      tag.buffer.end >= this.read().duration - 1 / tag.buffer.rate
    ) {
      finishTail()
      tag.phase = 'resume'
      tag.resume()
      if (tag.done) finishTagPlaybackWindow(this.context, tag)
    } else tag?.abort.abort()
    this.state.tagFallback = null
  }

  async refreshEligibility(path: string, session: number, client: MpvClient): Promise<boolean> {
    if (this.options.coordinator?.reserveWriteIntent) {
      const generation = ++this.state.tagEligibilityGeneration
      const expectedPath = normalizeAudioFilePath(path)
      this.state.tagAudioEligible = false
      const beforeRead = this.read()
      if (!beforeRead.loaded || normalizeAudioFilePath(beforeRead.path) !== expectedPath)
        return false
      const tags = await parseAudioMetadata(path, { skipCovers: true }).catch(() => null)
      const current = this.read()
      if (
        !this.runtime.isCurrent(session, client) ||
        generation !== this.state.tagEligibilityGeneration ||
        !current.loaded ||
        normalizeAudioFilePath(current.path) !== expectedPath
      )
        return false
      this.state.tagAudioEligible =
        !!tags?.format.sampleRate &&
        tags.format.sampleRate <= 192000 &&
        [1, 2].includes(tags.format.numberOfChannels ?? 0)
    }
    return true
  }

  seek(client: MpvClient, time: number): Promise<unknown> | null {
    this.state.frozenTagTime = null
    if (this.state.tagWindow?.source && this.state.tagWindow.phase !== 'preparing') {
      const window = this.state.tagWindow
      const source = window.source!
      this.state.tagFallback = source
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
    if (this.state.tagDecodeOffset) {
      this.state.tagDecodeOffset = 0
      this.state.tagSeekLoading = true
      const session = this.runtime.id
      return this.scheduling.cancelNext(client).then(() => {
        if (!this.runtime.isCurrent(session, client)) return
        return client.command(
          'loadfile',
          this.state.tagFallback?.path ?? this.read().path,
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
    const tag = this.state.tagWindow
    if (!tag?.source || tag.phase === 'preparing' || tag.resumePath === tag.source.path)
      return false
    tag.resumeFailed = true
    tag.resumePath = tag.source.path
    tag.resumeEntry = tag.source.path
    tag.resumeOffset = 0
    tag.loading = true
    this.state.tagFallback = tag.source
    const client = this.runtime.client!
    void this.runtime
      .enqueue(async () => {
        if (!this.runtime.isCurrent(session, client) || tag !== this.state.tagWindow) return
        await client.command('loadfile', tag.source!.path, 'replace', -1, {
          start: String(this.read().currentTime),
          'hr-seek': 'yes',
          'hr-seek-demuxer-offset': '1',
        })
      })
      .catch((error: Error) => {
        if (this.runtime.isCurrent(session, client) && tag === this.state.tagWindow)
          this.failure(error)
      })
    return true
  }

  get needsLoadHandling(): boolean {
    return this.state.tagWindow !== null && this.state.tagWindow.phase !== 'preparing'
  }

  async handleFileLoaded(session: number, client: MpvClient): Promise<boolean> {
    const tag = this.state.tagWindow
    if (!tag || tag.phase === 'preparing') return false
    const path = await client.command('get_property', 'path')
    const audioPosition = await client.command('get_property', 'audio-pts').catch(() => null)
    if (!this.runtime.isCurrent(session, client) || tag !== this.state.tagWindow) return true
    if (path !== tag.buffer?.path && path !== tag.resumeEntry) return false
    const inBuffer = path === tag.buffer?.path
    tag.loading = false
    tag.phase = inBuffer ? 'bridge' : 'resume'
    this.state.tagDecodeOffset = inBuffer ? 0 : tag.resumeOffset
    if (!inBuffer) this.state.tagFallback = tag.resumePath === tag.source?.path ? tag.source : null
    const mappedTime =
      this.state.frozenTagTime ??
      (typeof audioPosition === 'number'
        ? audioPosition + (inBuffer ? tag.buffer!.start : this.state.tagDecodeOffset)
        : this.read().currentTime)
    this.loaded(
      this.state.frozenTagTime !== null || (!inBuffer && !this.state.tagDecodeOffset)
        ? mappedTime
        : Math.max(this.read().currentTime, mappedTime),
    )
    if (inBuffer) tag.enter()
    else {
      tag.resume()
      if (tag.done) finishTagPlaybackWindow(this.context, tag)
    }
    return true
  }

  cleanup(): Promise<void> {
    return cleanupTagPlaybackFiles(this.context)
  }

  /** Write tags without restarting the output device or the logical song. */
  async writeMetadata(
    filePath: string,
    metadata: EditableTrackMetadata,
    commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
  ): Promise<UpdateTrackMetadataResult> {
    if (!this.canWriteMetadata(filePath)) return { ok: false, reason: 'playback-in-use' }
    return writeBufferedTagMetadata(this.context, filePath, metadata, commitAndReconcile)
  }
}
