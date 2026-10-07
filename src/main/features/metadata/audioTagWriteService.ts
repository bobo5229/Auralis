import { spawn } from 'node:child_process'
import { copyFile, rename, rm, writeFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { parseFile } from 'music-metadata'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { normalizeEditableMetadata } from './editableMetadataValidation'

const FFMPEG_NOT_FOUND_MESSAGE =
  'Unable to write audio tags because the bundled FFmpeg runtime is unavailable.'

function normalizeTagValue(value: string | null): string {
  return value?.trim() ?? ''
}

function buildMetadataArguments(metadata: EditableTrackMetadata, flag = '-metadata'): string[] {
  const releaseDate = normalizeTagValue(metadata.releaseDate) || String(metadata.year ?? '')

  return [
    flag,
    `title=${normalizeTagValue(metadata.title)}`,
    flag,
    `artist=${normalizeTagValue(metadata.artistDisplay)}`,
    flag,
    `album=${normalizeTagValue(metadata.albumTitle)}`,
    flag,
    `album_artist=${normalizeTagValue(metadata.albumArtistDisplay)}`,
    flag,
    `genre=${normalizeTagValue(metadata.genreDisplay)}`,
    flag,
    `date=${releaseDate}`,
    flag,
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

async function runFfmpegProcess(ffmpegPath: string, arguments_: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(ffmpegPath, arguments_, {
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
  ffmpegPath: string,
): Promise<void> {
  await runFfmpegProcess(ffmpegPath, [
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
    ...buildMetadataArguments(
      metadata,
      ['.ogg', '.opus'].includes(extname(inputPath).toLowerCase())
        ? '-metadata:s:a:0'
        : '-metadata',
    ),
    outputPath,
  ])
}

async function remuxWithCover(
  audioPath: string,
  coverPath: string,
  outputPath: string,
  metadata: EditableTrackMetadata,
  ffmpegPath: string,
): Promise<void> {
  await runFfmpegProcess(ffmpegPath, [
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

async function replaceOriginalFile(
  originalPath: string,
  stagingPath: string,
  expected: { size: number; mtimeMs: number },
  beforeFirstRename?: () => void,
): Promise<void> {
  const operationId = randomUUID()
  const backupPath = `${originalPath}.auralis-backup-${operationId}`

  try {
    const beforeReplace = await stat(originalPath)
    if (beforeReplace.size !== expected.size || beforeReplace.mtimeMs !== expected.mtimeMs) {
      throw new Error('Audio file changed during tag writing; original was not replaced')
    }
    beforeFirstRename?.()
    await rename(originalPath, backupPath)

    try {
      const backup = await stat(backupPath)
      if (backup.size !== expected.size || backup.mtimeMs !== expected.mtimeMs) {
        throw new Error('Audio file changed before tag replacement; restoring original')
      }
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

export interface PreparedAudioTagWrite {
  stagingPath: string
  assertUnchanged: () => Promise<void>
  commit: (beforeFirstRename?: () => void) => Promise<void>
  dispose: () => Promise<void>
}

/** All copying/remuxing completes before the exclusive playback write window. */
export async function prepareAudioTagWrite(
  filePath: string,
  metadata: EditableTrackMetadata,
  ffmpegPath: string,
): Promise<PreparedAudioTagWrite> {
  metadata = normalizeEditableMetadata(metadata)
  const originalFingerprint = await stat(filePath)
  const extension = extname(filePath)

  if (!extension) {
    throw new Error(`Unable to determine the audio format for ${basename(filePath)}.`)
  }

  const outputPath = join(tmpdir(), `auralis-tag-edit-${randomUUID()}${extension}`)
  const coveredPath = join(tmpdir(), `auralis-tag-cover-${randomUUID()}${extension}`)
  let coverPath: string | null = null
  const stagingPath = `${filePath}.auralis-replacement-${randomUUID()}`
  let prepared = false

  try {
    const picture = await readEmbeddedPicture(filePath)
    await remuxWithTags(filePath, outputPath, metadata, ffmpegPath)

    let taggedPath = outputPath
    const preservedPicture = picture ? await readEmbeddedPicture(outputPath) : null
    if (picture && !preservedPicture?.data.equals(picture.data)) {
      coverPath = join(
        tmpdir(),
        `auralis-tag-cover-${randomUUID()}${resolveCoverFileExtension(picture.mimeType)}`,
      )
      await writeFile(coverPath, picture.data)
      try {
        await remuxWithCover(outputPath, coverPath, coveredPath, metadata, ffmpegPath)
        taggedPath = coveredPath
      } catch (error) {
        // Never commit a replacement that silently discards embedded artwork.
        const actual = await readEmbeddedPicture(outputPath)
        if (!actual || !actual.data.equals(picture.data)) throw error
      }
    }
    await copyFile(taggedPath, stagingPath)
    const assertUnchanged = async () => {
      const actual = await stat(filePath)
      if (
        actual.size !== originalFingerprint.size ||
        actual.mtimeMs !== originalFingerprint.mtimeMs
      )
        throw new Error('Audio file changed during tag preparation')
    }
    prepared = true
    let committed = false
    return {
      stagingPath,
      assertUnchanged,
      commit: async (beforeFirstRename) => {
        if (committed) throw new Error('Tag write already committed')
        await replaceOriginalFile(filePath, stagingPath, originalFingerprint, beforeFirstRename)
        committed = true
      },
      dispose: () => rm(stagingPath, { force: true }),
    }
  } finally {
    await rm(outputPath, { force: true })
    await rm(coveredPath, { force: true })
    if (coverPath) {
      await rm(coverPath, { force: true })
    }
    if (!prepared) await rm(stagingPath, { force: true })
  }
}

export async function writeAudioTags(
  filePath: string,
  metadata: EditableTrackMetadata,
  ffmpegPath: string,
): Promise<void> {
  const prepared = await prepareAudioTagWrite(filePath, metadata, ffmpegPath)
  try {
    await prepared.commit()
  } finally {
    await prepared.dispose()
  }
}
