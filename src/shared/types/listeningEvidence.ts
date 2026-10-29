/** Listening evidence is independent of effective-play counts and its consumers. */
export interface ListeningSample {
  startedAtIso: string
  startSeconds: number
  endSeconds: number
  playedSeconds: number
}

export interface ListeningProgressBatch {
  epoch: number
  sessionId: string
  sequence: number
  trackId: number
  samples: ListeningSample[]
}
