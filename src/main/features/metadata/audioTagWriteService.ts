import { spawn } from 'node:child_process'
import { copyFile, rename, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'

const FFMPEG_NOT_FOUND_MESSAGE =
  'Unable to write audio tags because FFmpeg is not available on this computer.'

function normalizeTagValue(value: string | null): string {
  return value?.trim() ?? ''
}

function buildMetadataArguments(metadata: EditableTrackMetadata): string[] {
  const releaseDate = normalizeTagValue(metadata.releaseDate) || String(metadata.year ?? '')

  return [
    '-metadata',
    `title=${normalizeTagValue(metadata.title)}`,
    '-metadata',
    `artist=${normalizeTagValue(metadata.artistDisplay)}`,
    '-metadata',
    `album=${normalizeTagValue(metadata.albumTitle)}`,
    '-metadata',
    `album_artist=${normalizeTagValue(metadata.albumArtistDisplay)}`,
    '-metadata',
    `genre=${normalizeTagValue(metadata.genreDisplay)}`,
    '-metadata',
    `date=${releaseDate}`,
    '-metadata',
    `year=${metadata.year ?? ''}`,
  ]
}

async function runFfmpeg(inputPath: string, outputPath: string, metadata: EditableTrackMetadata) {
  const arguments_ = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0',
    '-map_metadata',
    '0',
    '-c',
    'copy',
    ...buildMetadataArguments(metadata),
    outputPath,
  ]

  await new Promise<void>((resolve, reject) => {
    const process = spawn('ffmpeg', arguments_, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let errorOutput = ''

    process.stderr.setEncoding('utf8')
    process.stderr.on('data', (chunk: string) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8000)
    })
    process.once('error', (error) => {
      if ('code' in error && error.code === 'ENOENT') {
        reject(new Error(FFMPEG_NOT_FOUND_MESSAGE))
        return
      }

      reject(error)
    })
    process.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(errorOutput.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`))
    })
  })
}

async function replaceOriginalFile(originalPath: string, generatedPath: string): Promise<void> {
  const operationId = randomUUID()
  const stagingPath = `${originalPath}.auralis-replacement-${operationId}`
  const backupPath = `${originalPath}.auralis-backup-${operationId}`

  await copyFile(generatedPath, stagingPath)

  try {
    await rename(originalPath, backupPath)

    try {
      await rename(stagingPath, originalPath)
    } catch (error) {
      await rename(backupPath, originalPath)
      throw error
    }

    await rm(backupPath, { force: true })
  } finally {
    await rm(stagingPath, { force: true })
  }
}

export async function writeAudioTags(
  filePath: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  const extension = extname(filePath)

  if (!extension) {
    throw new Error(`Unable to determine the audio format for ${basename(filePath)}.`)
  }

  const outputPath = join(tmpdir(), `auralis-tag-edit-${randomUUID()}${extension}`)

  try {
    await runFfmpeg(filePath, outputPath, metadata)
    await replaceOriginalFile(filePath, outputPath)
  } finally {
    await rm(outputPath, { force: true })
  }
}
