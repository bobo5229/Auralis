export interface WatchedFileStat {
  filePath: string
  size: number
  mtimeMs: number
}

export interface FileScanFingerprint {
  fileSize: number
  fileMtimeMs: number
}

/**
 * Decide which watched files actually changed on disk versus the persisted
 * scan fingerprint. Opening a known audio file for playback changes neither
 * size nor mtime, so those paths must not enter a metadata refresh job (the
 * job would broadcast `library:changed` and drag the song-list viewport back
 * to the playing track).
 *
 * Conservative by design: a missing fingerprint row or a stat without a usable
 * mtime counts as changed, so real updates are never dropped. The mtime
 * comparison uses the raw float exactly like the scan dedup
 * (`Number(stat.mtimeMs)`), never a rounded value.
 */
export function resolveChangedFilePaths(input: {
  stats: WatchedFileStat[]
  fingerprints: Map<string, FileScanFingerprint>
}): string[] {
  return input.stats
    .filter((entry) => {
      const fingerprint = input.fingerprints.get(entry.filePath)
      if (!fingerprint) return true
      const mtimeMs = Number(entry.mtimeMs)
      if (!Number.isFinite(mtimeMs)) return true
      return entry.size !== fingerprint.fileSize || mtimeMs !== fingerprint.fileMtimeMs
    })
    .map((entry) => entry.filePath)
}

/**
 * Watch flush decision: audio fingerprint changes plus sidecar lyrics intent.
 *
 * `.lrc` events map onto the audio path without touching the audio fingerprint,
 * so those paths must still refresh even when size and mtime match. Intent
 * paths that are not in this `stats` batch are ignored. An omitted or empty
 * `lyricsIntentPaths` matches `resolveChangedFilePaths`.
 */
export function resolveWatchRefreshPaths(input: {
  stats: WatchedFileStat[]
  fingerprints: Map<string, FileScanFingerprint>
  lyricsIntentPaths?: Iterable<string>
}): string[] {
  const changedPaths = new Set(
    resolveChangedFilePaths({
      stats: input.stats,
      fingerprints: input.fingerprints,
    }),
  )
  const lyricsIntentPaths = new Set(input.lyricsIntentPaths ?? [])
  const selected = new Set<string>()
  const result: string[] = []

  for (const entry of input.stats) {
    if (selected.has(entry.filePath)) continue
    if (!changedPaths.has(entry.filePath) && !lyricsIntentPaths.has(entry.filePath)) continue
    selected.add(entry.filePath)
    result.push(entry.filePath)
  }

  return result
}
