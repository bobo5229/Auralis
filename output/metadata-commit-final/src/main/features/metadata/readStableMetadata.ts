import { stat } from 'node:fs/promises'
import type { IAudioMetadata } from 'music-metadata'
import { parseAudioMetadata } from './parseAudioMetadata'
import { getMetadataParserVersion } from './metadataParserVersion'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from './metadataNormalizer'
import { readArtworkForFile } from '../artwork/resolveArtworkForFile'
import { getDirectoryArtworkFingerprint } from '../artwork/directoryArtwork'
import { resolveLyricsForFile } from './resolveLyricsForFile'
import type { StableTrackMetadata } from './metadataRefreshTypes'
import {
  hasSameScanFileFingerprint,
  scanFileFingerprint,
} from '../libraryScan/libraryScanFileFingerprint'

export class MetadataFileChangedError extends Error {
  constructor() {
    super('Audio file changed while metadata was being read')
  }
}

export async function assertMetadataFingerprint(
  result: Pick<
    StableTrackMetadata,
    | 'sourceFilePath'
    | 'fileSize'
    | 'fileMtimeMs'
    | 'fileFingerprint'
    | 'directoryArtworkFingerprint'
  >,
): Promise<void> {
  const current = await stat(result.sourceFilePath)
  if (
    !current.isFile() ||
    current.size !== result.fileSize ||
    current.mtimeMs !== result.fileMtimeMs ||
    !hasSameScanFileFingerprint(current, result.fileFingerprint) ||
    (result.directoryArtworkFingerprint !== undefined &&
      result.directoryArtworkFingerprint !==
        (await getDirectoryArtworkFingerprint(result.sourceFilePath)))
  ) {
    throw new MetadataFileChangedError()
  }
}

/** One retry for a changing file; tags and signature always use the same stable fingerprint. */
export async function readStableMetadata(
  trackId: number,
  filePath: string,
  artworkCacheDir: string,
  verifyTags?: (metadata: IAudioMetadata) => void,
): Promise<StableTrackMetadata> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const before = await stat(filePath)
      if (!before.isFile()) throw new Error('Metadata source is not a file')
      const metadata = await parseAudioMetadata(filePath, { duration: true })
      const normalized = normalizeMetadata(metadata, filePath)
      const lyrics = await resolveLyricsForFile(filePath, metadata)
      const fingerprint = {
        sourceFilePath: filePath,
        fileSize: before.size,
        fileMtimeMs: before.mtimeMs,
        fileFingerprint: scanFileFingerprint(before),
      }
      await assertMetadataFingerprint(fingerprint)
      const artwork = await readArtworkForFile(filePath, metadata, artworkCacheDir)
      await assertMetadataFingerprint({
        ...fingerprint,
        directoryArtworkFingerprint: artwork.directoryArtworkFingerprint,
      })
      // User edits verify the parsed tags locally; refresh results only carry
      // fields consumed by the repository, without serialized tag snapshots.
      verifyTags?.(metadata)
      return {
        ...normalized,
        metadataParserVersion: getMetadataParserVersion(filePath),
        ...fingerprint,
        trackId,
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        ...artwork,
        metadataSignature: buildMetadataSignature(
          normalizeIdentityText(metadata),
          normalized.durationSeconds,
          before.size,
        ),
      }
    } catch (error) {
      if (!(error instanceof MetadataFileChangedError) || attempt === 1) throw error
    }
  }
  throw new MetadataFileChangedError()
}
