import type { TrackFileFingerprint } from '@shared/types/libraryScan'

export interface MetadataRefreshJob {
  id: number
  scope: string
  status: string
  totalTracks: number
  processedTracks: number
  failedTracks: number
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}

export interface TrackForMetadataRefresh {
  trackId: number
  filePath: string
}

export interface RefreshedTrackMetadata {
  fileFingerprint?: TrackFileFingerprint
  /** Actual audio codec; older internal worker payloads may omit it. */
  codec?: string | null
  metadataParserVersion?: string
  sourceFilePath: string
  fileSize: number
  fileMtimeMs: number
  trackId: number
  title: string
  artistDisplay: string
  artists: string[]
  artist: string
  albumTitle: string
  album: string
  albumArtistDisplay: string
  albumArtists: string[]
  albumArtist: string
  trackNo: number | null
  discNo: number | null
  durationSeconds: number | null
  bitrateBps: number | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  composer: string | null
  genres: string[]
  genre: string | null
  lyricsText: string | null
  lyricsFormat: string | null
  artworkCacheKey: string | null
  isrc: string | null
  metadataSignature: string
}
