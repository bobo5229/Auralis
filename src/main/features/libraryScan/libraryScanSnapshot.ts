import { statSync } from 'node:fs'
import { getLyricsSidecarFingerprintSync } from '../metadata/resolveLyricsForFile'
import { hasSameScanFileFingerprint } from './libraryScanFileFingerprint'
import type { ScanFileSnapshot } from './libraryScanTypes'
import { getDirectoryArtworkFingerprintSync } from '../artwork/directoryArtwork'

export function isCurrentScanSnapshot(
  result: ScanFileSnapshot & {
    lyricsSidecarFingerprint?: string | null
    directoryArtworkFingerprint?: string
  },
  verifyLyrics: boolean,
): boolean {
  try {
    const file = statSync(result.filePath)
    return (
      file.isFile() &&
      hasSameScanFileFingerprint(file, result.fileFingerprint) &&
      (result.directoryArtworkFingerprint === undefined ||
        result.directoryArtworkFingerprint ===
          getDirectoryArtworkFingerprintSync(result.filePath)) &&
      (!verifyLyrics ||
        result.lyricsSidecarFingerprint === getLyricsSidecarFingerprintSync(result.filePath))
    )
  } catch {
    return false
  }
}
