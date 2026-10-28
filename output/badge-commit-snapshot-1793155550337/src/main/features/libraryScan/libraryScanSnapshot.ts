import { statSync } from 'node:fs'
import { getLyricsSidecarFingerprintSync } from '../metadata/resolveLyricsForFile'
import { hasSameScanFileFingerprint } from './libraryScanFileFingerprint'
import type { ScanFileSnapshot } from './libraryScanTypes'

export function isCurrentScanSnapshot(
  result: ScanFileSnapshot & { lyricsSidecarFingerprint?: string | null },
  verifyLyrics: boolean,
): boolean {
  try {
    const file = statSync(result.filePath)
    return (
      file.isFile() &&
      hasSameScanFileFingerprint(file, result.fileFingerprint) &&
      (!verifyLyrics ||
        result.lyricsSidecarFingerprint === getLyricsSidecarFingerprintSync(result.filePath))
    )
  } catch {
    return false
  }
}
