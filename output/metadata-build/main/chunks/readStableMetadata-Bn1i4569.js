import { stat } from "node:fs/promises";
import { p as parseAudioMetadata, d as normalizeMetadata, C as resolveLyricsForFile, a as readArtworkForFile, h as buildMetadataSignature, e as normalizeIdentityText, g as getMetadataParserVersion, b as getDirectoryArtworkFingerprint } from "./resolveLyricsForFile-COlnUOK3.js";
import { s as scanFileFingerprint, h as hasSameScanFileFingerprint } from "./delimitedValues-CpE_2YHT.js";
class MetadataFileChangedError extends Error {
  constructor() {
    super("Audio file changed while metadata was being read");
  }
}
async function assertMetadataFingerprint(result) {
  const current = await stat(result.sourceFilePath);
  if (!current.isFile() || current.size !== result.fileSize || current.mtimeMs !== result.fileMtimeMs || !hasSameScanFileFingerprint(current, result.fileFingerprint) || result.directoryArtworkFingerprint !== void 0 && result.directoryArtworkFingerprint !== await getDirectoryArtworkFingerprint(result.sourceFilePath)) {
    throw new MetadataFileChangedError();
  }
}
async function readStableMetadata(trackId, filePath, artworkCacheDir, verifyTags) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const before = await stat(filePath);
      if (!before.isFile()) throw new Error("Metadata source is not a file");
      const metadata = await parseAudioMetadata(filePath, { duration: true });
      const normalized = normalizeMetadata(metadata, filePath);
      const lyrics = await resolveLyricsForFile(filePath, metadata);
      const fingerprint = {
        sourceFilePath: filePath,
        fileSize: before.size,
        fileMtimeMs: before.mtimeMs,
        fileFingerprint: scanFileFingerprint(before)
      };
      await assertMetadataFingerprint(fingerprint);
      const artwork = await readArtworkForFile(filePath, metadata, artworkCacheDir);
      await assertMetadataFingerprint({
        ...fingerprint,
        directoryArtworkFingerprint: artwork.directoryArtworkFingerprint
      });
      verifyTags?.(metadata);
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
          before.size
        )
      };
    } catch (error) {
      if (!(error instanceof MetadataFileChangedError) || attempt === 1) throw error;
    }
  }
  throw new MetadataFileChangedError();
}
export {
  assertMetadataFingerprint as a,
  readStableMetadata as r
};
