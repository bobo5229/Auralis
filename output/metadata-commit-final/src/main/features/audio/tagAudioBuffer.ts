import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rmdir, stat, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { parseFile } from 'music-metadata'
import { readMpvTimestampOrigin } from './softTransition'

export const TAG_BUFFER_SECONDS = 8
export const TAG_BUFFER_MAX_BYTES = 64 * 1024 * 1024
export const TAG_BUFFER_LEAD_SECONDS = 2
// The current mpv EDL decoder has insufficient preroll for MP3/AAC/Opus.
// Keep those formats occupied until their two seams meet the sample checks.
export const TAG_PLAYBACK_EXTENSIONS: readonly string[] = ['.wav', '.flac', '.ogg']

/** A demuxer-level seek retains queued output; mpv's --start clears that output. */
export function tagAudioContinuation(
  source: string,
  start: number,
  duration: number,
  rate: number,
  origin = 0,
): string {
  return `edl://%${Buffer.byteLength(source, 'utf8')}%${source},${start + origin + 0.25 / rate},${duration - start}`
}

export interface TagAudioSnapshot {
  path: string
  dispose: () => Promise<void>
}

export interface TagAudioBuffer extends TagAudioSnapshot {
  start: number
  end: number
  rate: number
  frames: number
  origin: number
}

async function removeTemporaryFiles(directory: string, paths: string[]): Promise<void> {
  for (const path of paths) {
    for (let attempt = 0; ; attempt++) {
      try {
        await unlink(path)
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') break
        if (attempt >= 49 || (code !== 'EBUSY' && code !== 'EPERM')) throw error
        await delay(100)
      }
    }
  }
  await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}

export async function createTagAudioSnapshot(source: string): Promise<TagAudioSnapshot> {
  const directory = await mkdtemp(join(tmpdir(), 'auralis-tag-source-'))
  const path = join(directory, `source${extname(source)}`)
  try {
    const before = await stat(source)
    await copyFile(source, path)
    const after = await stat(source)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw new Error('Audio changed while preparing playback recovery')
    return { path, dispose: () => removeTemporaryFiles(directory, [path]) }
  } catch (error) {
    await removeTemporaryFiles(directory, [path])
    throw error
  }
}

/** Await actual process close before releasing any file or removing its output. */
async function run(executable: string, args: string[], signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let failure: Error | undefined
    let stderr = ''
    const abort = () => {
      failure = new Error('Tag playback preparation cancelled')
      child.kill()
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    child.on('error', (error) => {
      failure = error
    })
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString('utf8')).slice(-4096)
    })
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (failure || code !== 0) reject(failure ?? new Error(`Tag buffer decode failed: ${stderr}`))
      else resolve()
    })
  })
}

/** Decode with the same mpv build as playback, retaining its codec preroll and time origin. */
export async function prepareTagAudioBuffer(
  mpvPath: string,
  ffmpegPath: string,
  source: string,
  position: number,
  duration: number,
  paused: boolean,
  signal: AbortSignal,
): Promise<TagAudioBuffer> {
  const metadata = await parseFile(source, { skipCovers: true })
  const rate = metadata.format.sampleRate
  const channels = metadata.format.numberOfChannels
  if (!rate || !channels || ![1, 2].includes(channels) || rate > 192000)
    throw new Error('Unsupported tag buffer audio format')
  const origin = await readMpvTimestampOrigin(mpvPath, source, signal)
  const lead = paused ? 0 : Math.min(6, (duration - position) / 2)
  const startFrame = Math.ceil((position + lead) * rate)
  const endFrame = Math.min(Math.round(duration * rate), startFrame + TAG_BUFFER_SECONDS * rate)
  if (endFrame <= startFrame || (endFrame - startFrame) * channels * 4 > TAG_BUFFER_MAX_BYTES)
    throw new Error('Insufficient audio remaining for tag playback buffer')
  const start = startFrame / rate
  // A quarter-sample moves timestamp rounding inside the intended sample, never to its neighbour.
  const seekStart = start + 0.25 / rate
  const end = endFrame / rate
  const directory = await mkdtemp(join(tmpdir(), 'auralis-tag-buffer-'))
  const raw = join(directory, 'buffer.pcm')
  const path = join(directory, 'buffer.wav')
  const dispose = () => removeTemporaryFiles(directory, [raw, path])
  try {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)])
    await run(
      mpvPath,
      [
        '--no-config',
        '--load-scripts=no',
        '--terminal=no',
        '--video=no',
        '--audio-display=no',
        '--idle=no',
        '--keep-open=no',
        '--gapless-audio=yes',
        '--replaygain=no',
        '--volume=100',
        '--ao=pcm',
        `--ao-pcm-file=${raw}`,
        '--ao-pcm-waveheader=no',
        '--audio-format=float',
        `--audio-samplerate=${rate}`,
        `--audio-channels=${channels === 1 ? 'mono' : 'stereo'}`,
        '--hr-seek=yes',
        '--hr-seek-demuxer-offset=1',
        `--start=${seekStart}`,
        `--end=${end + 0.25 / rate}`,
        source,
      ],
      deadline,
    )
    const bytes = (await stat(raw)).size
    if (bytes !== (endFrame - startFrame) * channels * 4 || bytes > TAG_BUFFER_MAX_BYTES)
      throw new Error('Tag buffer sample count does not match the playback interval')
    const pcm = await readFile(raw)
    for (let index = 0; index < pcm.length; index += 4)
      if (!Number.isFinite(pcm.readFloatLE(index))) throw new Error('Non-finite tag buffer sample')
    await run(
      ffmpegPath,
      [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'f32le',
        '-ar',
        String(rate),
        '-ac',
        String(channels),
        '-i',
        raw,
        '-c:a',
        'pcm_f32le',
        path,
      ],
      deadline,
    )
    await unlink(raw)
    return { path, start, end, rate, origin, frames: endFrame - startFrame, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
