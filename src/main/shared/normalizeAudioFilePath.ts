import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/** Canonical comparison key shared by file leases and metadata operations. */
export function normalizeAudioFilePath(filePath: string): string {
  let normalized = resolve(filePath)
  try {
    normalized = realpathSync.native(normalized)
  } catch {
    // If realpath fails (e.g. file does not exist yet), keep the resolved path.
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
