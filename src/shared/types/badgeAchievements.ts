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
