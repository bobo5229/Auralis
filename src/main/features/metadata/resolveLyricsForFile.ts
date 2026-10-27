import { readFile, stat } from 'node:fs/promises'
import { statSync, type Stats } from 'node:fs'
import type { IAudioMetadata } from 'music-metadata'
import { resolveLyrics } from './metadataNormalizer'
import { classifyLyrics, type ResolvedLyrics } from './classifyLyrics'
import { lyricSidecarCandidates } from './lyricSidecarPaths'

function sidecarFingerprint(file: Stats): number[] {
  return [file.size, file.mtimeMs, file.ctimeMs, file.dev, file.ino]
}

/** Compare LRC slots of legacy four-slot fingerprints without consulting old TTML files. */
export function sameLyricsSidecarFingerprint(
  stored: string | null | undefined,
  current: string,
): boolean {
  if (!stored) return false
  if (stored === current) return true
  try {
    const left: unknown = JSON.parse(stored)
    const right: unknown = JSON.parse(current)
    return (
      Array.isArray(left) &&
      (left.length === 2 || left.length === 4) &&
      Array.isArray(right) &&
      right.length === 2 &&
      JSON.stringify(left.slice(0, 2)) === JSON.stringify(right)
    )
  } catch {
    return false
  }
}

/** Includes absence, so adding or removing a sidecar invalidates the scan cache. */
export async function getLyricsSidecarFingerprint(filePath: string): Promise<string> {
  const fingerprints = await Promise.all(
    lyricSidecarCandidates(filePath).map(async (candidate) => {
      try {
        const file = await stat(candidate)
        return sidecarFingerprint(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    }),
  )
  return JSON.stringify(fingerprints)
}

/** Synchronous counterpart for the scan's final database write boundary. */
export function getLyricsSidecarFingerprintSync(filePath: string): string {
  return JSON.stringify(
    lyricSidecarCandidates(filePath).map((candidate) => {
      try {
        const file = statSync(candidate)
        return sidecarFingerprint(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    }),
  )
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
  preserveText = false,
): Promise<ResolvedLyrics | null> {
  const candidates = lyricSidecarCandidates(filePath)

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, 'utf8')
      const lyrics = classifyLyrics(text)

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
  const embeddedLyrics = resolveLyrics(metadata, preserveText)

  if (embeddedLyrics?.format === 'lrc') {
    return embeddedLyrics
  }

  return (await readLocalLyrics(filePath, preserveText)) ?? embeddedLyrics
}
