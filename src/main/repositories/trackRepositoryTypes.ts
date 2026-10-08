export interface KnownTrackFile {
  filePath: string
  fileSize: number | null
  fileMtimeMs: number | null
  album: string | null
  albumArtist: string | null
  artworkCacheKey: string | null
  lyricsFormat: string | null
  lyricsCheckedMtimeMs: number | null
  lyricsSidecarFingerprint?: string | null
  metadataCheckedMtimeMs: number | null
}

export interface MissingTrackCandidate {
  trackId: number
  filePath: string
  title: string | null
  artist: string | null
  album: string | null
  durationSeconds: number | null
  fileSize: number | null
  isrc: string | null
  metadataSignature: string | null
  missingSince: string | null
}
