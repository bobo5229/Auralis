import type {
  AlbumArtworkPatch,
  LibraryScanProgress,
  ScanFailure,
  ScannedTrack,
  TrackLyricsPatch,
  TrackTagPatch,
} from '@shared/types/libraryScan'
import type { KnownTrackFile } from '@main/repositories/trackRepository'
import type { Stats } from 'node:fs'

export type ScanFileFingerprint = Pick<Stats, 'size' | 'mtimeMs' | 'ctimeMs' | 'dev' | 'ino'>

export interface ScanFileSnapshot {
  filePath: string
  fileFingerprint: ScanFileFingerprint
}

export interface ScannedTrackFile extends ScannedTrack, ScanFileSnapshot {
  lyricsSidecarFingerprint: string
}

export interface ScannedTagPatch extends TrackTagPatch, ScanFileSnapshot {}

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
