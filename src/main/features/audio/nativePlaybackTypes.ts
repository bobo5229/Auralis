import type { NativePlaybackCommand, NativePlaybackEvent } from '@shared/ipc/contracts'

export type BoundaryStatus =
  | 'analyzing'
  | 'unchanged'
  | 'applied'
  | 'too-late'
  | 'cancelled'
  | 'failed'
export type NextTrackRequest = Extract<NativePlaybackCommand, { action: 'next' }>

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

export interface NativePlaybackOptions {
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

/** A fresh read of the facade's logical song, never a mutable shared snapshot. */
export interface LogicalPlaybackView {
  readonly loaded: boolean
  readonly path: string
  readonly paused: boolean
  readonly currentTime: number
  readonly duration: number
}
