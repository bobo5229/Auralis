import type { TrackFileFingerprint as ScanFileFingerprint } from '@shared/types/trackFile'

export function scanFileFingerprint(file: ScanFileFingerprint): ScanFileFingerprint {
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

export function encodeScanFileFingerprint(file: ScanFileFingerprint | undefined): string | null {
  if (!file) return null
  const values = [file.size, file.mtimeMs, file.ctimeMs, file.dev, file.ino]
  return values.every((value) => Number.isFinite(value)) ? JSON.stringify(values) : null
}

export function decodeScanFileFingerprint(value: string | null): ScanFileFingerprint | null {
  if (!value) return null
  try {
    const values: unknown = JSON.parse(value)
    if (
      !Array.isArray(values) ||
      values.length !== 5 ||
      !values.every((v) => typeof v === 'number' && Number.isFinite(v))
    )
      return null
    const [size, mtimeMs, ctimeMs, dev, ino] = values as number[]
    return { size, mtimeMs, ctimeMs, dev, ino }
  } catch {
    return null
  }
}
