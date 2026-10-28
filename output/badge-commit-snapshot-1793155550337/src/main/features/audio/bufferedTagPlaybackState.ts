import type { MpvClient } from './mpvClient'
import type { NativePlaybackSession } from './nativePlaybackSession'
import type {
  LogicalPlaybackView,
  NativePlaybackOptions,
  NextTrackRequest,
} from './nativePlaybackTypes'
import type { TagAudioSnapshot, TagAudioBuffer } from './tagAudioBuffer'

export interface TagWriteScheduling {
  canBeginTagWrite(): boolean
  suspendPreparation(): NextTrackRequest | null
  cancelNext(client: MpvClient): Promise<void>
  deferPrevious(request: NextTrackRequest | null): void
  drainAnalysis(): Promise<void>
  restoreDeferredNext(): void
}

export interface TagPlaybackWindow {
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

export interface TagWriteAttempt {
  readonly filePath: string
  readonly window: TagPlaybackWindow
  readonly client: MpvClient
  readonly session: number
  readonly signal: AbortSignal
}

export type BufferedTagPlaybackOptions = Pick<
  NativePlaybackOptions,
  'mpvPath' | 'ffmpegPath' | 'coordinator' | 'warn' | 'suspendFileReaders'
>

/** One mutable state instance, owned by BufferedTagPlayback across writes and recovery. */
export interface BufferedTagPlaybackState {
  tagAudioEligible: boolean
  tagEligibilityGeneration: number
  tagWindow: TagPlaybackWindow | null
  tagFallback: TagAudioSnapshot | null
  frozenTagTime: number | null
  tagDecodeOffset: number
  tagSeekLoading: boolean
  writesInFlight: number
  readonly tagFiles: Set<TagAudioSnapshot>
}

export interface BufferedTagPlaybackContext {
  readonly state: BufferedTagPlaybackState
  readonly options: BufferedTagPlaybackOptions
  readonly runtime: NativePlaybackSession
  readonly read: () => LogicalPlaybackView
  readonly scheduling: TagWriteScheduling
}

export function createBufferedTagPlaybackState(): BufferedTagPlaybackState {
  return {
    tagAudioEligible: false,
    tagEligibilityGeneration: 0,
    tagWindow: null,
    tagFallback: null,
    frozenTagTime: null,
    tagDecodeOffset: 0,
    tagSeekLoading: false,
    writesInFlight: 0,
    tagFiles: new Set(),
  }
}

export function createTagPlaybackWindow(): TagPlaybackWindow {
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

/** Active work requires an un-aborted attempt; finalization uses identity checks instead. */
export function isCurrentTagWrite(
  { state, runtime }: BufferedTagPlaybackContext,
  { window, client, session, signal }: TagWriteAttempt,
): boolean {
  return !signal.aborted && runtime.isCurrent(session, client) && state.tagWindow === window
}

export function assertCurrentTagWrite(
  context: BufferedTagPlaybackContext,
  attempt: TagWriteAttempt,
): void {
  if (!isCurrentTagWrite(context, attempt)) throw new Error('Tag playback changed')
}
