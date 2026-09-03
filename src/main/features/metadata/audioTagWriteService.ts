import { spawn } from 'node:child_process'
import { copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { parseFile } from 'music-metadata'
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

export function resolveCoverFileExtension(mimeType: string): string {
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  return '.jpg'
}

async function readEmbeddedPicture(
  filePath: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    const metadata = await parseFile(filePath, { skipCovers: false })
    const picture = metadata.common.picture?.[0]
    if (!picture?.data || picture.data.length === 0) return null
    return { data: Buffer.from(picture.data), mimeType: picture.format || 'image/jpeg' }
  } catch {
    return null
  }
}

async function runFfmpegProcess(arguments_: string[]): Promise<void> {
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

async function remuxWithTags(
  inputPath: string,
  outputPath: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  await runFfmpegProcess([
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
    '-id3v2_version',
    '3',
    ...buildMetadataArguments(metadata),
    outputPath,
  ])
}

async function remuxWithCover(
  audioPath: string,
  coverPath: string,
  outputPath: string,
  metadata: EditableTrackMetadata,
): Promise<void> {
  await runFfmpegProcess([
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    audioPath,
    '-i',
    coverPath,
    '-map',
    '0:a:0',
    '-map',
    '1:0',
    '-c',
    'copy',
    '-disposition:1',
    'attached_pic',
    '-id3v2_version',
    '3',
    '-map_metadata',
    '0',
    ...buildMetadataArguments(metadata),
    outputPath,
  ])
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
  const coveredPath = join(tmpdir(), `auralis-tag-cover-${randomUUID()}${extension}`)
  let coverPath: string | null = null

  try {
    const picture = await readEmbeddedPicture(filePath)
    await remuxWithTags(filePath, outputPath, metadata)

    let taggedPath = outputPath
    if (picture) {
      coverPath = join(
        tmpdir(),
        `auralis-tag-cover-${randomUUID()}${resolveCoverFileExtension(picture.mimeType)}`,
      )
      await writeFile(coverPath, picture.data)
      try {
        await remuxWithCover(outputPath, coverPath, coveredPath, metadata)
        taggedPath = coveredPath
      } catch {
        // Keep the tagged remux if re-attaching the cover fails; the library
        // cache still holds the artwork for display.
      }
    }

    await replaceOriginalFile(filePath, taggedPath)
  } finally {
    await rm(outputPath, { force: true })
    await rm(coveredPath, { force: true })
    if (coverPath) {
      await rm(coverPath, { force: true })
    }
  }
}
