import { stat } from 'node:fs/promises'
import { parseAudioMetadata as parseFile } from '../metadata/parseAudioMetadata'
import { isCurrentArtworkCacheKey } from '../artwork/artworkCachePolicy'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import { getLyricsSidecarFingerprint, readLyricsSnapshot } from '../metadata/resolveLyricsForFile'
import { LibraryScanArtwork, getScanAlbumKey } from './libraryScanArtwork'
import type { KnownTrackFile } from '@main/repositories/trackRepository'
import type { AlbumArtworkPatch, ScannedTrack, TrackLyricsPatch } from '@shared/types/libraryScan'

export type ReadTrackResult =
  | { kind: 'track'; track: ScannedTrack }
  | { kind: 'artwork'; patch: AlbumArtworkPatch }
  | {
      kind: 'patches'
      artworkPatch: AlbumArtworkPatch | null
      lyricsPatch: TrackLyricsPatch | null
    }
  | { kind: 'skip' }

export class LibraryScanTrackReader {
  private readonly knownFiles: Map<string, KnownTrackFile>

  constructor(
    knownFiles: KnownTrackFile[],
    private readonly artwork: LibraryScanArtwork,
    private readonly onFailure: (filePath: string, reason: string) => void,
  ) {
    this.knownFiles = new Map(knownFiles.map((file) => [file.filePath, file]))
  }

  async read(filePath: string): Promise<ReadTrackResult> {
    let fileSize: number
    let fileMtimeMs: number
    let fileStat: Awaited<ReturnType<typeof stat>>

    try {
      fileStat = await stat(filePath)
      fileSize = Number(fileStat.size)
      fileMtimeMs = Number(fileStat.mtimeMs)
    } catch (statError) {
      // File disappeared between readdir and stat — single-file failure, not fatal
      this.onFailure(
        filePath,
        statError instanceof Error ? statError.message : 'Unable to stat file',
      )
      return { kind: 'skip' }
    }

    const knownFile = this.knownFiles.get(filePath)
    const fileUnchanged =
      knownFile && knownFile.fileSize === fileSize && knownFile.fileMtimeMs === fileMtimeMs
    const metadataChecked =
      knownFile?.metadataCheckedMtimeMs !== null &&
      knownFile?.metadataCheckedMtimeMs === fileMtimeMs
    const needsMetadataBackfill = Boolean(fileUnchanged && knownFile && !metadataChecked)

    try {
      const lyricsChecked =
        knownFile?.lyricsCheckedMtimeMs === fileMtimeMs &&
        knownFile.lyricsSidecarFingerprint === (await getLyricsSidecarFingerprint(filePath))
      const needsLyricsBackfill = Boolean(fileUnchanged && !lyricsChecked)

      // Audio and sidecar fingerprints are independent. Old rows without a
      // sidecar fingerprint get one lyrics backfill before the fast path applies.
      if (
        fileUnchanged &&
        isCurrentArtworkCacheKey(knownFile.artworkCacheKey) &&
        !needsLyricsBackfill &&
        !needsMetadataBackfill
      ) {
        return { kind: 'skip' }
      }

      if (!fileUnchanged || needsMetadataBackfill) {
        return await this.readFullTrack(filePath, fileStat, knownFile)
      }

      if (fileUnchanged) {
        return await this.readBackfill(filePath, fileMtimeMs, knownFile, needsLyricsBackfill)
      }
    } catch (error) {
      this.onFailure(filePath, error instanceof Error ? error.message : 'Unable to parse metadata')

      // Never persist a failed read as checked metadata, including for new files.
      // Leaving the stored fingerprint untouched guarantees a full retry next scan.
      return { kind: 'skip' }
    }

    return { kind: 'skip' }
  }

  private async readFullTrack(
    filePath: string,
    fileStat: Awaited<ReturnType<typeof stat>>,
    knownFile: KnownTrackFile | undefined,
  ): Promise<ReadTrackResult> {
    const dirCoverKey = await this.artwork.resolveDirectoryCover(filePath)
    let knownAlbumArtworkKey: string | null | undefined = dirCoverKey ?? undefined

    if (knownAlbumArtworkKey === undefined && knownFile?.album && knownFile.albumArtist) {
      const albumKey = getScanAlbumKey(knownFile.album, knownFile.albumArtist)
      if (albumKey) {
        knownAlbumArtworkKey = this.artwork.getAlbumArtwork(albumKey)
      }
    }

    if (knownAlbumArtworkKey !== undefined && isCurrentArtworkCacheKey(knownAlbumArtworkKey)) {
      const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
      return {
        kind: 'track',
        track: await this.createScannedTrack(filePath, fileStat, metadata, knownAlbumArtworkKey),
      }
    }

    const metadata = await parseFile(filePath, { duration: true })
    return {
      kind: 'track',
      track: await this.createScannedTrack(filePath, fileStat, metadata),
    }
  }

  private async readBackfill(
    filePath: string,
    fileMtimeMs: number,
    knownFile: KnownTrackFile,
    needsLyricsBackfill: boolean,
  ): Promise<ReadTrackResult> {
    const albumKey = getScanAlbumKey(knownFile?.album ?? null, knownFile?.albumArtist ?? null)
    let artworkPatch: AlbumArtworkPatch | null = null
    let lyricsPatch: TrackLyricsPatch | null = null

    // Album-level cache hit: skip artwork work entirely when lyrics do not need backfill.
    if (albumKey && !needsLyricsBackfill) {
      const cached = this.artwork.getAlbumArtwork(albumKey)

      if (cached !== undefined) {
        // Only a CURRENT v2 key can be committed by the album upsert; a null
        // value means "no artwork" and skips, a legacy value falls through to
        // re-resolution so the upgrade is not lost.
        if (isCurrentArtworkCacheKey(cached) && knownFile?.album && knownFile.albumArtist) {
          return {
            kind: 'artwork',
            patch: {
              album: knownFile.album,
              artist: knownFile.albumArtist,
              artworkCacheKey: cached,
            },
          }
        }

        if (cached === null) {
          return { kind: 'skip' }
        }
      }
    }

    // Cache miss or lyrics backfill: parse file once and reuse metadata for both tasks.
    const dirCoverKey = await this.artwork.resolveDirectoryCover(filePath)
    const hasKnownKey =
      isCurrentArtworkCacheKey(knownFile.artworkCacheKey) ||
      dirCoverKey !== null ||
      (albumKey !== null && this.artwork.getAlbumArtwork(albumKey!) !== undefined)
    const skipCovers = Boolean(hasKnownKey)

    const metadata = await parseFile(filePath, { duration: false, skipCovers })

    if (needsLyricsBackfill) {
      const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata)
      lyricsPatch = {
        filePath,
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        lyricsCheckedMtimeMs: fileMtimeMs,
        lyricsSidecarFingerprint,
      }
    }

    // Reuse only a CURRENT v2 key; legacy keys must be re-resolved so the
    // artwork cache is upgraded even when the audio file itself is unchanged.
    const knownKey = knownFile?.artworkCacheKey ?? null
    const artworkCacheKey = isCurrentArtworkCacheKey(knownKey)
      ? knownKey
      : (dirCoverKey ?? (await this.artwork.resolveArtwork(filePath, metadata)))

    // Cache both success and failure to avoid repeated parseFile for albums without artwork
    if (albumKey) {
      this.artwork.setAlbumArtwork(albumKey, artworkCacheKey)
    }

    if (artworkCacheKey && knownFile?.album && knownFile.albumArtist) {
      artworkPatch = {
        album: knownFile.album,
        artist: knownFile.albumArtist,
        artworkCacheKey,
      }
    }

    if (artworkPatch || lyricsPatch) {
      return {
        kind: 'patches',
        artworkPatch,
        lyricsPatch,
      }
    }

    return { kind: 'skip' }
  }

  private async createScannedTrack(
    filePath: string,
    fileStat: Awaited<ReturnType<typeof stat>>,
    metadata: Awaited<ReturnType<typeof parseFile>>,
    resolvedArtworkKey?: string | null,
  ): Promise<ScannedTrack> {
    const normalized = normalizeMetadata(metadata, filePath)
    const albumKey = getScanAlbumKey(normalized.album, normalized.albumArtist)
    const cachedAlbumKey = albumKey ? this.artwork.getAlbumArtwork(albumKey) : undefined
    const artworkCacheKey =
      resolvedArtworkKey ??
      cachedAlbumKey ??
      (await this.artwork.resolveArtwork(filePath, metadata))
    const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata)
    const identity = normalizeIdentityText(metadata)

    if (albumKey && artworkCacheKey) {
      this.artwork.setAlbumArtwork(albumKey, artworkCacheKey)
    }

    return {
      filePath,
      fileSize: Number(fileStat.size),
      fileMtimeMs: Number(fileStat.mtimeMs),
      title: normalized.title,
      artist: normalized.artist,
      album: normalized.album,
      albumArtist: normalized.albumArtist,
      trackNo: normalized.trackNo,
      discNo: normalized.discNo,
      durationSeconds: normalized.durationSeconds,
      year: normalized.year,
      releaseDate: normalized.releaseDate,
      copyright: normalized.copyright,
      composer: normalized.composer,
      genre: normalized.genre,
      artworkCacheKey,
      lyricsText: lyrics?.text ?? null,
      lyricsFormat: lyrics?.format ?? null,
      lyricsSidecarFingerprint,
      isrc: identity.isrc,
      metadataSignature: buildMetadataSignature(
        identity,
        normalized.durationSeconds,
        Number(fileStat.size),
      ),
    }
  }
}
