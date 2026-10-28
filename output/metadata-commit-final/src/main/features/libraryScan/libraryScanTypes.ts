import type {
  AlbumArtworkPatch,
  LibraryScanProgress,
  ScanFailure,
  ScannedTrack,
  TrackLyricsPatch,
  TrackTagPatch,
} from '@shared/types/libraryScan'
import type { KnownTrackFile, TrackFileFingerprint } from '@shared/types/trackFile'

export type ScanFileFingerprint = TrackFileFingerprint

export interface ScanFileSnapshot {
  filePath: string
  fileFingerprint: ScanFileFingerprint
}

export interface ScannedTrackFile extends Omit<ScannedTrack, 'fileFingerprint'>, ScanFileSnapshot {
  lyricsSidecarFingerprint: string
}

export interface ScannedTagPatch extends Omit<TrackTagPatch, 'fileFingerprint'>, ScanFileSnapshot {}

export interface ScannedLyricsPatch extends TrackLyricsPatch, ScanFileSnapshot {
  lyricsSidecarFingerprint: string
}

export interface LibraryScanWorkerInput {
  jobId: number
  rootPath: string
  knownFiles: KnownTrackFile[]
  artworkCacheDir: string
}

export type LibraryScanWorkerMessage =
  | { type: 'progress'; payload: LibraryScanProgress }
  | { type: 'tracks'; payload: ScannedTrackFile[] }
  | { type: 'trackTags'; payload: ScannedTagPatch[] }
  | { type: 'albumArtwork'; payload: AlbumArtworkPatch[] }
  | { type: 'trackLyrics'; payload: ScannedLyricsPatch[] }
  | { type: 'failure'; payload: ScanFailure }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }
  | {
      type: 'complete'
      payload: { foundFilePaths: string[]; unreadableDirectoryPaths: string[] }
    }
