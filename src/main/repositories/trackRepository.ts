import type Database from 'better-sqlite3'
import type {
  AlbumArtworkPatch,
  ScannedTrack,
  TrackListItem,
  TrackLyricsPatch,
  TrackLyrics,
} from '@shared/types/libraryScan'
import type { PlaybackTrackDto } from '@shared/types/playback'
import type { AlbumDetailSummary } from '@shared/types/albumDetail'
import type { NormalizedIdentity } from '@main/features/metadata/metadataNormalizer'
import type { KnownTrackFile, MissingTrackCandidate } from './trackRepositoryTypes'
import { BaseRepository } from './baseRepository'
import { TrackQueryRepository } from './trackQueryRepository'
import { TrackScanWriter } from './trackScanWriter'
import { TrackAvailabilityRepository } from './trackAvailabilityRepository'

export type { KnownTrackFile, MissingTrackCandidate } from './trackRepositoryTypes'

export class TrackRepository extends BaseRepository {
  private readonly queries: TrackQueryRepository
  private readonly writer: TrackScanWriter
  private readonly availability: TrackAvailabilityRepository

  constructor(db: Database.Database) {
    super(db)
    this.queries = new TrackQueryRepository(db)
    this.writer = new TrackScanWriter(db)
    this.availability = new TrackAvailabilityRepository(db)
  }

  getChangeToken(): string {
    return this.queries.getChangeToken()
  }

  getFilePathById(trackId: number): string | null {
    return this.queries.getFilePathById(trackId)
  }

  getTrackIdsByFilePaths(filePaths: string[]): number[] {
    return this.queries.getTrackIdsByFilePaths(filePaths)
  }

  getTrackIdsByPlaybackPath(filePath: string): number[] {
    return this.queries.getTrackIdsByPlaybackPath(filePath)
  }

  getExistingFilePaths(filePaths: string[]): Set<string> {
    return this.queries.getExistingFilePaths(filePaths)
  }

  /**
   * Read the persisted scan fingerprint (file_size + file_mtime_ms) for the
   * given paths. Paths absent from the table are simply not present in the
   * map. Used by the metadata watcher to skip a refresh job when a file was
   * only opened for reading (same fingerprint as the last scan).
   */
  getFileFingerprintsByFilePaths(
    filePaths: string[],
  ): Map<string, { fileSize: number; fileMtimeMs: number }> {
    return this.queries.getFileFingerprintsByFilePaths(filePaths)
  }

  getLyricsByTrackId(trackId: number): TrackLyrics | null {
    return this.queries.getLyricsByTrackId(trackId)
  }

  getAll(): TrackListItem[] {
    return this.queries.getAll()
  }

  getAlbumDetailTracks(albumArtist: string, albumTitle: string): TrackListItem[] {
    return this.queries.getAlbumDetailTracks(albumArtist, albumTitle)
  }

  getArtistAlbumSummaries(albumArtist: string, excludeAlbumTitle: string): AlbumDetailSummary[] {
    return this.queries.getArtistAlbumSummaries(albumArtist, excludeAlbumTitle)
  }

  getGenreAlbumSummaries(
    genres: string[],
    excludeArtist: string,
    excludeTitle: string,
  ): AlbumDetailSummary[] {
    return this.queries.getGenreAlbumSummaries(genres, excludeArtist, excludeTitle)
  }

  getKnownFiles(): KnownTrackFile[] {
    return this.queries.getKnownFiles()
  }

  upsertMany(tracks: ScannedTrack[]): void {
    return this.writer.upsertMany(tracks)
  }

  patchAlbumArtwork(items: AlbumArtworkPatch[]): void {
    return this.writer.patchAlbumArtwork(items)
  }

  patchLyrics(items: TrackLyricsPatch[]): void {
    return this.writer.patchLyrics(items)
  }

  markMissingByFilePaths(filePaths: string[]): number[] {
    return this.availability.markMissingByFilePaths(filePaths)
  }

  markAvailableByFilePaths(filePaths: string[]): number[] {
    return this.availability.markAvailableByFilePaths(filePaths)
  }

  getMissingCandidates(): MissingTrackCandidate[] {
    return this.availability.getMissingCandidates()
  }

  findRelocationCandidatesByIdentity(
    identity: NormalizedIdentity,
    includeAvailable = false,
  ): MissingTrackCandidate[] {
    return this.availability.findRelocationCandidatesByIdentity(identity, includeAvailable)
  }

  markMissingUnderRootExcept(
    rootPath: string,
    foundFilePaths: string[],
    unreadableDirectoryPaths: string[] = [],
  ): number[] {
    return this.availability.markMissingUnderRootExcept(
      rootPath,
      foundFilePaths,
      unreadableDirectoryPaths,
    )
  }

  /**
   * Relocate a record whose old file was confirmed absent (or a Windows path alias).
   * The expected old path prevents a stale match from taking over an already moved record.
   * Returns false when the target path is already occupied by another track
   * (or a UNIQUE constraint race loses), so callers can fall back to upsert.
   */
  relocateTrack(trackId: number, scannedTrack: ScannedTrack, expectedOldPath: string): boolean {
    return this.availability.relocateTrack(trackId, scannedTrack, expectedOldPath)
  }

  getRandomPlayableTrack(excludeTrackId?: number): PlaybackTrackDto | null {
    return this.queries.getRandomPlayableTrack(excludeTrackId)
  }

  getRandomAlbumIdentity(excludeAlbumKey?: {
    albumArtist: string
    album: string
  }): { albumArtist: string; album: string } | null {
    return this.queries.getRandomAlbumIdentity(excludeAlbumKey)
  }

  getAlbumTracks(albumArtist: string, album: string): PlaybackTrackDto[] {
    return this.queries.getAlbumTracks(albumArtist, album)
  }

  markMissingByPathPrefix(rootPath: string): number {
    return this.availability.markMissingByPathPrefix(rootPath)
  }
}
