import { extname } from 'node:path'
import { supportedAudioExtensions } from '@main/features/libraryScan/audioFileFilter'

export function isLyricSidecar(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.lrc'
}

export function lyricSidecarCandidates(filePath: string): string[] {
  const extension = extname(filePath)
  const basePath = extension ? filePath.slice(0, -extension.length) : filePath
  return ['.lrc', '.LRC'].map((suffix) => `${basePath}${suffix}`)
}

/** Non-lyric paths (including no extension) return []. */
export function resolveAudioCandidatesForLyricSidecar(lyricPath: string): string[] {
  if (!isLyricSidecar(lyricPath)) {
    return []
  }

  const basePath = lyricPath.slice(0, -extname(lyricPath).length)
  return supportedAudioExtensions.flatMap((extension) => [
    `${basePath}${extension}`,
    `${basePath}${extension.toUpperCase()}`,
  ])
}
