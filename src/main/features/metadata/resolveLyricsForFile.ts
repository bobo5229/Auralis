import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { IAudioMetadata } from 'music-metadata'
import { resolveLyrics } from './metadataNormalizer'
import { classifyLyrics, type ResolvedLyrics } from './classifyLyrics'
import { lyricSidecarCandidates } from './lyricSidecarPaths'

/** Includes absence, so adding or removing a sidecar invalidates the scan cache. */
export async function getLyricsSidecarFingerprint(filePath: string): Promise<string> {
  const fingerprints = await Promise.all(
    lyricSidecarCandidates(filePath).map(async (candidate) => {
      try {
        const file = await stat(candidate)
        return [file.size, file.mtimeMs]
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    }),
  )
  return JSON.stringify(fingerprints)
}

export async function readLyricsSnapshot(filePath: string, metadata: IAudioMetadata) {
  const lyricsSidecarFingerprint = await getLyricsSidecarFingerprint(filePath)
  const lyrics = await resolveLyricsForFile(filePath, metadata)
  if (lyricsSidecarFingerprint !== (await getLyricsSidecarFingerprint(filePath))) {
    throw new Error('Lyrics sidecar changed while being read')
  }
  return { lyrics, lyricsSidecarFingerprint }
}

async function readLocalLyrics(
  filePath: string,
  format: 'lrc' | 'ttml',
  preserveText = false,
): Promise<ResolvedLyrics | null> {
  const candidates = lyricSidecarCandidates(filePath).filter(
    (candidate) => extname(candidate).toLowerCase() === `.${format}`,
  )

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, 'utf8')
      const lyrics = classifyLyrics(text, format === 'ttml')

      if (lyrics) {
        return preserveText ? { ...lyrics, text } : lyrics
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  return null
}

export async function resolveLyricsForFile(
  filePath: string,
  metadata: IAudioMetadata,
  preserveText = false,
): Promise<ResolvedLyrics | null> {
  const localTtml = await readLocalLyrics(filePath, 'ttml', preserveText)
  if (localTtml) return localTtml

  const embeddedLyrics = resolveLyrics(metadata, preserveText)

  if (embeddedLyrics?.format === 'ttml' || embeddedLyrics?.format === 'lrc') {
    return embeddedLyrics
  }

  return (await readLocalLyrics(filePath, 'lrc', preserveText)) ?? embeddedLyrics
}
