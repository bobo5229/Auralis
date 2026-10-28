import type { TrackFileFingerprint } from '@shared/types/libraryScan'
import { hasSameScanFileFingerprint } from '../libraryScan/libraryScanFileFingerprint'

export interface WatchedFileStat extends TrackFileFingerprint {
  filePath: string
}

export interface FileScanFingerprint {
  fileSize: number
  fileMtimeMs: number
  fileFingerprint?: TrackFileFingerprint | null
}

/**
 * Decide which watched files actually changed on disk versus the persisted
 * stable fingerprint. Opening a known audio file for playback does not change
 * this fingerprint, so those paths must not enter a metadata refresh job (the
 * job would broadcast `library:changed` and drag the song-list viewport back
 * to the playing track).
 *
 * Legacy rows without a full fingerprint refresh once to establish a baseline.
 * Preserve ctime and file identity so edits that retain size/mtime are detected.
 */
export function resolveChangedFilePaths(input: {
  stats: WatchedFileStat[]
  fingerprints: Map<string, FileScanFingerprint>
}): string[] {
  return input.stats
    .filter((entry) => {
      const fingerprint = input.fingerprints.get(entry.filePath)
      if (!fingerprint) return true
      if (
        !fingerprint.fileFingerprint ||
        ![entry.size, entry.mtimeMs, entry.ctimeMs, entry.dev, entry.ino].every(Number.isFinite)
      )
        return true
      return (
        entry.size !== fingerprint.fileSize ||
        entry.mtimeMs !== fingerprint.fileMtimeMs ||
        !hasSameScanFileFingerprint(entry, fingerprint.fileFingerprint)
      )
    })
    .map((entry) => entry.filePath)
}

/**
 * Watch flush decision: audio fingerprint changes plus sidecar lyrics intent.
 *
 * Lyric sidecar events map onto the audio path without touching the audio fingerprint,
 * so those paths must still refresh even when size and mtime match. Intent
 * paths that are not in this `stats` batch are ignored. An omitted or empty
 * `lyricsIntentPaths` matches `resolveChangedFilePaths`.
 */
export function resolveWatchRefreshPaths(input: {
  stats: WatchedFileStat[]
  fingerprints: Map<string, FileScanFingerprint>
  lyricsIntentPaths?: Iterable<string>
  artworkIntentPaths?: Iterable<string>
}): string[] {
  const changedPaths = new Set(
    resolveChangedFilePaths({
      stats: input.stats,
      fingerprints: input.fingerprints,
    }),
  )
  const lyricsIntentPaths = new Set(input.lyricsIntentPaths ?? [])
  const artworkIntentPaths = new Set(input.artworkIntentPaths ?? [])
  const selected = new Set<string>()
  const result: string[] = []

  for (const entry of input.stats) {
    if (selected.has(entry.filePath)) continue
    if (
      !changedPaths.has(entry.filePath) &&
      !lyricsIntentPaths.has(entry.filePath) &&
      !artworkIntentPaths.has(entry.filePath)
    )
      continue
    selected.add(entry.filePath)
    result.push(entry.filePath)
  }

  return result
}
