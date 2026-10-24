import type { TrackFileFingerprint } from './trackFile'

export type { TrackFileFingerprint } from './trackFile'

export type TrackAvailability = 'available' | 'missing'

export interface TrackListItem {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  trackNo: number | null
  discNo: number | null
  releaseDate: string | null
  copyright: string | null
  composer: string | null
  durationSeconds: number | null
  bitrateBps: number | null
  artworkCacheKey: string | null
  genre: string | null
  availability: TrackAvailability
  playCount: number
  lastPlayedAt: string | null
  createdAt: string
}

export type LibraryScanStatusValue = 'idle' | 'scanning' | 'completed' | 'canceled' | 'failed'

export interface LibraryRoot {
  id: number
  path: string
  createdAt: string
  lastScannedAt: string | null
}

export interface LibraryScanStatus {
  jobId: number
  rootId: number
  status: LibraryScanStatusValue
  totalFiles: number
  scannedFiles: number
  failedFiles: number
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}

export interface LibraryScanProgress {
  jobId: number
  status: LibraryScanStatusValue
  totalFiles: number
  scannedFiles: number
  failedFiles: number
  currentFile: string | null
  message: string | null
}

export interface ScannedTrack {
  fileFingerprint?: TrackFileFingerprint
  /** Actual audio codec; older internal worker payloads may omit it. */
  codec?: string | null
  /** Version used by the worker, committed only with successful full metadata writes. */
  metadataParserVersion?: string
  filePath: string
  fileSize: number
  fileMtimeMs: number
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNo: number | null
  discNo: number | null
  durationSeconds: number | null
  bitrateBps: number | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  composer: string | null
  genre: string | null
  artworkCacheKey: string | null
  lyricsText: string | null
  lyricsFormat: LyricsFormat | null
  lyricsSidecarFingerprint?: string | null
  isrc: string | null
  metadataSignature: string
}

export interface ScanFailure {
  jobId: number
  filePath: string
  reason: string
}

export interface MetadataRefreshFailure {
  id: number
  jobId: number
  trackId: number | null
  filePath: string | null
  reason: string
  createdAt: string
}

export interface EditableTrackMetadata {
  trackId: number
  title: string | null
  artistDisplay: string | null
  albumTitle: string | null
  albumArtistDisplay: string | null
  genreDisplay: string | null
  year: number | null
  releaseDate: string | null
}

export interface AlbumArtworkPatch {
  album: string
  artist: string
  artworkCacheKey: string
}

export interface TrackLyricsPatch {
  filePath: string
  lyricsText: string | null
  lyricsFormat: LyricsFormat | null
  lyricsCheckedMtimeMs: number
  lyricsSidecarFingerprint?: string | null
}

/** Text-tag refresh for an unchanged file. Duration, bitrate, codec, lyrics and artwork bytes stay stored. */
export interface TrackTagPatch {
  fileFingerprint?: TrackFileFingerprint
  filePath: string
  fileMtimeMs: number
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNo: number | null
  discNo: number | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  composer: string | null
  genre: string | null
  isrc: string | null
  metadataSignature: string
  metadataParserVersion?: string
  /** Existing current v2 key to carry onto the album row. Null leaves artwork untouched. */
  artworkCacheKey: string | null
}

export interface SelectLibraryRootResult {
  canceled: boolean
  root?: LibraryRoot
}

export type LyricsFormat = 'lrc' | 'ttml' | 'plain'

export interface TrackLyrics {
  trackId: number
  lyricsText: string | null
  lyricsFormat: LyricsFormat | null
  /** Present for TTML only. Raw XML stays unchanged; the renderer consumes this projection. */
  ttmlPlayback?: import('./lyricsEditor').TtmlPlaybackLyrics
}
