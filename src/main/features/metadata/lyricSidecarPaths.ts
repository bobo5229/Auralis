import { extname } from 'node:path'
import { supportedAudioExtensions } from '@main/features/libraryScan/audioFileFilter'

/** Non-.lrc paths (including no extension) return []. */
export function resolveAudioCandidatesForLyricSidecar(lyricPath: string): string[] {
  if (extname(lyricPath).toLowerCase() !== '.lrc') {
    return []
  }

  const basePath = lyricPath.slice(0, -extname(lyricPath).length)
  return supportedAudioExtensions.flatMap((extension) => [
    `${basePath}${extension}`,
    `${basePath}${extension.toUpperCase()}`,
  ])
}
