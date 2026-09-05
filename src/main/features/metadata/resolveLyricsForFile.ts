import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { IAudioMetadata } from 'music-metadata'
import { resolveLyrics } from './metadataNormalizer'

const LRC_TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/

type ResolvedLyrics = { text: string; format: 'lrc' | 'plain' }

function classifyLyrics(text: string): ResolvedLyrics | null {
  const normalized = text.replace(/^\uFEFF/, '').trim()

  if (!normalized) {
    return null
  }

  return {
    text: normalized,
    format: LRC_TIMESTAMP.test(normalized) ? 'lrc' : 'plain',
  }
}

async function readLocalLyrics(filePath: string): Promise<ResolvedLyrics | null> {
  const extension = extname(filePath)
  const basePath = extension ? filePath.slice(0, -extension.length) : filePath
  const candidates = [`${basePath}.lrc`, `${basePath}.LRC`]

  for (const candidate of candidates) {
    try {
      const lyrics = classifyLyrics(await readFile(candidate, 'utf8'))

      if (lyrics) {
        return lyrics
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
): Promise<ResolvedLyrics | null> {
  const embeddedLyrics = resolveLyrics(metadata)

  if (embeddedLyrics?.format === 'lrc') {
    return embeddedLyrics
  }

  return (await readLocalLyrics(filePath)) ?? embeddedLyrics
}
