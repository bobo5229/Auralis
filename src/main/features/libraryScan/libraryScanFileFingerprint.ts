import type { Stats } from 'node:fs'
import type { ScanFileFingerprint } from './libraryScanTypes'

export function scanFileFingerprint(file: Stats): ScanFileFingerprint {
  const { size, mtimeMs, ctimeMs, dev, ino } = file
  return { size, mtimeMs, ctimeMs, dev, ino }
}

export function hasSameScanFileFingerprint(
  file: ScanFileFingerprint,
  expected: ScanFileFingerprint,
): boolean {
  return (
    file.size === expected.size &&
    file.mtimeMs === expected.mtimeMs &&
    file.ctimeMs === expected.ctimeMs &&
    file.dev === expected.dev &&
    file.ino === expected.ino
  )
}
