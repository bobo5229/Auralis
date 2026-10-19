import { stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { extname } from 'node:path'
import { parseAudioMetadata as parseFile } from '../metadata/parseAudioMetadata'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'
import { isCurrentArtworkCacheKey } from '../artwork/artworkCachePolicy'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import { getLyricsSidecarFingerprint, readLyricsSnapshot } from '../metadata/resolveLyricsForFile'
import { LibraryScanArtwork, getScanAlbumKey } from './libraryScanArtwork'
import { readM4aTextMetadata } from './m4aTextTags'
import { hasSameScanFileFingerprint, scanFileFingerprint } from './libraryScanFileFingerprint'
import type {
  ScanFileFingerprint,
  ScannedTrackFile,
  ScannedTagPatch,
  ScannedLyricsPatch,
} from './libraryScanTypes'
import type { KnownTrackFile } from '@main/repositories/trackRepository'
import type { AlbumArtworkPatch } from '@shared/types/libraryScan'

export type ReadTrackResult =
  | { kind: 'track'; track: ScannedTrackFile }
  | { kind: 'tags'; patch: ScannedTagPatch; lyricsPatch: ScannedLyricsPatch | null }
  | { kind: 'artwork'; patch: AlbumArtworkPatch }
  | {
      kind: 'patches'
      artworkPatch: AlbumArtworkPatch | null
      lyricsPatch: ScannedLyricsPatch | null
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
    let fileStat: Stats

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
    // Size/mtime alone cannot prove legacy technical metadata is current.
    // Establish a missing baseline through a full read, never text-only backfill.
    const fileUnchanged =
      knownFile &&
      knownFile.fileFingerprint &&
      knownFile.fileSize === fileSize &&
      knownFile.fileMtimeMs === fileMtimeMs &&
      hasSameScanFileFingerprint(fileStat, knownFile.fileFingerprint)
    const metadataChecked =
      knownFile?.metadataCheckedMtimeMs !== null &&
      knownFile?.metadataCheckedMtimeMs === fileMtimeMs &&
      knownFile.metadataParserVersion === getMetadataParserVersion(filePath)
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

      // A changed file still needs duration and artwork. An unchanged file only rereads text.
      if (!fileUnchanged) {
        const result = await this.readFullTrack(filePath, fileStat, knownFile)
        await this.assertUnchanged(filePath, fileStat)
        return result
      }

      if (needsMetadataBackfill && knownFile) {
        const result = await this.readUnchangedTags(
          filePath,
          fileStat,
          knownFile,
          needsLyricsBackfill,
        )
        await this.assertUnchanged(filePath, fileStat)
        return result
      }

      if (fileUnchanged) {
        const result = await this.readBackfill(filePath, fileStat, knownFile, needsLyricsBackfill)
        await this.assertUnchanged(filePath, fileStat)
        return result
      }
    } catch (error) {
      this.onFailure(filePath, error instanceof Error ? error.message : 'Unable to parse metadata')

      // Never persist a failed read as checked metadata, including for new files.
      // Leaving the stored fingerprint untouched guarantees a full retry next scan.
      return { kind: 'skip' }
    }

    return { kind: 'skip' }
  }

  private async assertUnchanged(filePath: string, expected: ScanFileFingerprint): Promise<void> {
    const after = await stat(filePath)
    if (!hasSameScanFileFingerprint(after, expected)) {
      throw new Error('Audio file changed while metadata was being read')
    }
  }

  private rememberAlbumArtwork(
    album: string | null,
    albumArtist: string | null,
    artworkCacheKey: string | null,
  ): void {
    if (!isCurrentArtworkCacheKey(artworkCacheKey)) return
    const albumKey = getScanAlbumKey(album, albumArtist)
    if (!albumKey || this.artwork.getAlbumArtwork(albumKey) !== undefined) return
    this.artwork.setAlbumArtwork(albumKey, artworkCacheKey)
  }

  private async readUnchangedTags(
    filePath: string,
    fileStat: Stats,
    knownFile: KnownTrackFile,
    needsLyricsBackfill: boolean,
  ): Promise<ReadTrackResult> {
    const { size: fileSize, mtimeMs: fileMtimeMs } = fileStat
    const carriedArtworkKey = isCurrentArtworkCacheKey(knownFile.artworkCacheKey)
      ? knownFile.artworkCacheKey
      : null
    this.rememberAlbumArtwork(knownFile.album, knownFile.albumArtist, carriedArtworkKey)

    const metadata =
      extname(filePath).toLowerCase() === '.m4a'
        ? await readM4aTextMetadata(filePath)
        : await parseFile(filePath, { duration: false, skipCovers: true })
    const normalized = normalizeMetadata(metadata, filePath)
    const identity = normalizeIdentityText(metadata)
    this.rememberAlbumArtwork(normalized.album, normalized.albumArtist, carriedArtworkKey)

    let lyricsPatch: ScannedLyricsPatch | null = null
    if (needsLyricsBackfill) {
      const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata)
      lyricsPatch = {
        filePath,
        fileFingerprint: scanFileFingerprint(fileStat),
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        lyricsCheckedMtimeMs: fileMtimeMs,
        lyricsSidecarFingerprint,
      }
    }

    return {
      kind: 'tags',
      lyricsPatch,
      patch: {
        filePath,
        fileFingerprint: scanFileFingerprint(fileStat),
        fileMtimeMs,
        title: normalized.title,
        artist: normalized.artist,
        album: normalized.album,
        albumArtist: normalized.albumArtist,
        trackNo: normalized.trackNo,
        discNo: normalized.discNo,
        year: normalized.year,
        releaseDate: normalized.releaseDate,
        copyright: normalized.copyright,
        composer: normalized.composer,
        genre: normalized.genre,
        isrc: identity.isrc,
        metadataSignature: buildMetadataSignature(
          identity,
          knownFile.durationSeconds ?? null,
          fileSize,
        ),
        metadataParserVersion: getMetadataParserVersion(filePath),
        artworkCacheKey: carriedArtworkKey,
      },
    }
  }

  private async readFullTrack(
    filePath: string,
    fileStat: Stats,
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
    fileStat: Stats,
    knownFile: KnownTrackFile,
    needsLyricsBackfill: boolean,
  ): Promise<ReadTrackResult> {
    const albumKey = getScanAlbumKey(knownFile?.album ?? null, knownFile?.albumArtist ?? null)
    let artworkPatch: AlbumArtworkPatch | null = null
    let lyricsPatch: ScannedLyricsPatch | null = null

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
        fileFingerprint: scanFileFingerprint(fileStat),
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        lyricsCheckedMtimeMs: fileStat.mtimeMs,
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
    fileStat: Stats,
    metadata: Awaited<ReturnType<typeof parseFile>>,
    resolvedArtworkKey?: string | null,
  ): Promise<ScannedTrackFile> {
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
      fileFingerprint: scanFileFingerprint(fileStat),
      metadataParserVersion: getMetadataParserVersion(filePath),
      fileSize: Number(fileStat.size),
      fileMtimeMs: Number(fileStat.mtimeMs),
      title: normalized.title,
      artist: normalized.artist,
      album: normalized.album,
      albumArtist: normalized.albumArtist,
      trackNo: normalized.trackNo,
      discNo: normalized.discNo,
      durationSeconds: normalized.durationSeconds,
      bitrateBps: normalized.bitrateBps,
      codec: normalized.codec,
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
