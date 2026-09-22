import { stat } from 'node:fs/promises'
import { parseFile, type IAudioMetadata } from 'music-metadata'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from './metadataNormalizer'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { resolveLyricsForFile } from './resolveLyricsForFile'
import type { RefreshedTrackMetadata } from '../../repositories/metadataRefreshRepository'

export class MetadataFileChangedError extends Error {
  constructor() {
    super('Audio file changed while metadata was being read')
  }
}

export async function assertMetadataFingerprint(
  result: Pick<RefreshedTrackMetadata, 'sourceFilePath' | 'fileSize' | 'fileMtimeMs'>,
): Promise<void> {
  const current = await stat(result.sourceFilePath)
  if (
    !current.isFile() ||
    current.size !== result.fileSize ||
    current.mtimeMs !== result.fileMtimeMs
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
): Promise<RefreshedTrackMetadata> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const before = await stat(filePath)
      if (!before.isFile()) throw new Error('Metadata source is not a file')
      const metadata = await parseFile(filePath, { duration: true })
      const normalized = normalizeMetadata(metadata, filePath)
      const lyrics = await resolveLyricsForFile(filePath, metadata)
      const fingerprint = {
        sourceFilePath: filePath,
        fileSize: before.size,
        fileMtimeMs: before.mtimeMs,
      }
      await assertMetadataFingerprint(fingerprint)
      const picture = metadata.common.picture?.[0]
      const artworkCacheKey = picture
        ? await writeArtworkToCache(
            artworkCacheDir,
            {
              data: Buffer.from(picture.data),
              mimeType: picture.format,
            },
            filePath,
          )
        : null
      await assertMetadataFingerprint(fingerprint)
      // User edits verify the parsed tags locally; refresh results only carry
      // fields consumed by the repository, without serialized tag snapshots.
      verifyTags?.(metadata)
      return {
        ...normalized,
        ...fingerprint,
        trackId,
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        artworkCacheKey,
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
