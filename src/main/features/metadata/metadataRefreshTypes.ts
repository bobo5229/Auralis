export interface MetadataRefreshWorkerInput {
  jobId: number
  tracks: Array<{ trackId: number; filePath: string }>
  artworkCacheDir: string
  writeMode?: 'metadata' | 'lyrics'
}

export interface MetadataRefreshWorkerResult {
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
  year: number | null
  releaseDate: string | null
  genres: string[]
  genre: string | null
  lyricsText: string | null
  lyricsFormat: string | null
  artworkCacheKey: string | null
  isrc: string | null
  metadataSignature: string
  rawCommonJson: string
  rawNativeJson: string | null
}

export type MetadataRefreshWorkerMessage =
  | { type: 'result'; payload: MetadataRefreshWorkerResult }
  | {
      type: 'failure'
      payload: { jobId: number; trackId: number; filePath: string; reason: string }
    }
  | { type: 'progress'; payload: { jobId: number; processed: number; failed: number } }
  | { type: 'complete' }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }
