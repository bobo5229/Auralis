import { dirname, join } from 'node:path'
import { statSync } from 'node:fs'
import { stat, readFile } from 'node:fs/promises'
import { encodeScanFileFingerprint, scanFileFingerprint } from '@shared/utils/trackFileFingerprint'
import { writeArtworkToCache } from './artworkCache'

export interface DirectoryArtworkRead {
  status: 'present' | 'absent' | 'error'
  cacheKey: string | null
  fingerprint?: string
}
const missing = (error: unknown) =>
  ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
const coverPath = (filePath: string) => join(dirname(filePath), 'cover.jpg')
export async function getDirectoryArtworkFingerprint(filePath: string): Promise<string> {
  try {
    const file = await stat(coverPath(filePath))
    const fingerprint = encodeScanFileFingerprint(scanFileFingerprint(file))
    if (!fingerprint) throw new Error('Directory artwork fingerprint is unavailable')
    return fingerprint
  } catch (error) {
    if (missing(error)) return 'absent'
    throw error
  }
}
export function getDirectoryArtworkFingerprintSync(filePath: string): string {
  try {
    const fingerprint = encodeScanFileFingerprint(
      scanFileFingerprint(statSync(coverPath(filePath))),
    )
    if (!fingerprint) throw new Error('Directory artwork fingerprint is unavailable')
    return fingerprint
  } catch (error) {
    if (missing(error)) return 'absent'
    throw error
  }
}
export async function readDirectoryArtwork(
  filePath: string,
  cacheDir: string,
): Promise<DirectoryArtworkRead> {
  try {
    const fingerprint = await getDirectoryArtworkFingerprint(filePath)
    if (fingerprint === 'absent') return { status: 'absent', cacheKey: null, fingerprint }
    const data = await readFile(coverPath(filePath))
    const cacheKey = await writeArtworkToCache(
      cacheDir,
      { data, mimeType: 'image/jpeg' },
      coverPath(filePath),
    )
    if (!cacheKey || fingerprint !== (await getDirectoryArtworkFingerprint(filePath)))
      return { status: 'error', cacheKey: null }
    return { status: 'present', cacheKey, fingerprint }
  } catch {
    return { status: 'error', cacheKey: null }
  }
}
