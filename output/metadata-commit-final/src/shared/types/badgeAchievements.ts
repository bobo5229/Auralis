/** Evidence for badges is independent of effective-play counts. */
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
export interface AlbumCompletionProgress {
  completedTracks: number
  totalTracks: number
}
export interface BadgeAchievements {
  epoch: number
  listeningSeconds: number
  listeningDays: number
  completeAlbums: number
  completeLiveAlbums: number
  albumProgress: AlbumCompletionProgress
  liveAlbumProgress: AlbumCompletionProgress
}
