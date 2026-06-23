export interface TrackListItem {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  durationSeconds: number | null
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
  year: number | null
  releaseDate: string | null
  genre: string | null
}

export interface ScanFailure {
  jobId: number
  filePath: string
  reason: string
}

export interface SelectLibraryRootResult {
  canceled: boolean
  root?: LibraryRoot
}
