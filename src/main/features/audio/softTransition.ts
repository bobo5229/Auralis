import { spawn } from 'node:child_process'
import { mkdtemp, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseFile } from 'music-metadata'
import { DigitalZeroCounter, isConsecutiveAlbumPair } from './digitalSilence'
import { openMpvClient } from './mpvClient'

/** mpv rebases some containers (e.g. MP3) but retains MP4's zero origin.
 * Query the actual demuxer instead of inferring behavior from an extension/tag.
 */
export async function readMpvTimestampOrigin(
  executable: string,
  path: string,
  signal: AbortSignal,
): Promise<number> {
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(10000)])
  let loaded!: () => void
  let failed!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    loaded = resolve
    failed = reject
  })
  // Avoid an unhandled rejection if startup fails before awaiting the load.
  void ready.catch(() => undefined)
  const abort = () => failed(new Error('Transition timestamp query cancelled or timed out'))
  lifetime.addEventListener('abort', abort, { once: true })
  let client: Awaited<ReturnType<typeof openMpvClient>> | undefined
  try {
    lifetime.throwIfAborted()
    client = await openMpvClient(
      executable,
      (event) => {
        if (event.event === 'file-loaded') loaded()
        if (event.event === 'end-file' && event.reason === 'error')
          failed(new Error('Transition timestamp query failed'))
      },
      failed,
      lifetime,
      ['--ao=null', '--pause=yes'],
    )
    await client.command('loadfile', path, 'replace')
    await ready
    const origin = await client.command('get_property', 'demuxer-start-time')
    if (typeof origin !== 'number' || !Number.isFinite(origin))
      throw new Error('Invalid demuxer timestamp origin')
    return origin
  } finally {
    lifetime.removeEventListener('abort', abort)
    client?.close()
  }
}

export interface TransitionAudio {
  frames: number
  leading: number
  trailing: number
  origin: number
  rate: number
  channels: number
  head: Buffer
  tail: Buffer
}

export interface SoftTransition {
  path: string
  outgoingEnd: number
  incomingStart: number
  incomingResume: number
  incomingDuration: number
  duration: number
  dispose: () => Promise<void>
}

/** Decode in the source sample domain. Keep only the first/last 2.1 seconds.
 * copyts + ashowinfo preserves the first valid frame's container timestamp;
 * raw PCM has no timestamp and must never be treated as container time zero.
 */
export async function scanTransitionAudio(
  executable: string,
  path: string,
  rate: number,
  channels: number,
  signal: AbortSignal,
): Promise<TransitionAudio> {
  signal.throwIfAborted()
  const counter = new DigitalZeroCounter(channels)
  const limit = Math.ceil(rate * 2.1) * channels * 4
  let head = Buffer.alloc(0)
  let tail = Buffer.alloc(0)
  let origin: number | undefined
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      executable,
      [
        '-nostdin',
        '-v',
        'info',
        '-threads',
        '1',
        '-copyts',
        '-i',
        path,
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-af',
        'ashowinfo',
        '-c:a',
        'pcm_f32le',
        '-f',
        'f32le',
        'pipe:1',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let diagnostics = ''
    let failure: Error | undefined
    const stop = (error: Error) => {
      failure = error
      child.kill()
    }
    const abort = () => stop(new Error('Soft transition cancelled'))
    const timeout = setTimeout(() => stop(new Error('Soft transition decode timed out')), 45000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    child.on('error', (error) => {
      failure = error
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = diagnostics + chunk.toString('utf8')
      if (origin === undefined) {
        const match =
          /\[Parsed_ashowinfo_\d+ @ [^\]]+\] n:0 pts:(-?\d+) pts_time:[^\s]+ .*?channels:(\d+).*?rate:(\d+)/.exec(
            text,
          )
        if (match) {
          if (Number(match[2]) !== channels || Number(match[3]) !== rate)
            stop(new Error('Unexpected transition decode format'))
          else origin = Number(match[1]) / rate
        }
      }
      diagnostics = text.slice(-8192)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      counter.push(chunk)
      if (head.length < limit) head = Buffer.concat([head, chunk.subarray(0, limit - head.length)])
      tail = Buffer.concat([tail, chunk]).subarray(-limit)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (failure || code !== 0)
        reject(failure ?? new Error(`Transition decode failed: ${diagnostics}`))
      else resolve()
    })
  })
  signal.throwIfAborted()
  counter.finish()
  if (origin === undefined || !Number.isFinite(origin) || origin < 0)
    throw new Error('Unsupported audio timestamp origin')
  return {
    frames: counter.frames,
    leading: counter.leading,
    trailing: counter.trailing,
    origin,
    rate,
    channels,
    head,
    tail: Buffer.from(tail),
  }
}

export function renderSoftTransition(a: TransitionAudio, b: TransitionAudio, trim: boolean) {
  if (a.rate !== b.rate || a.channels !== b.channels) throw new Error('Transition format mismatch')
  const zeroFrames = a.trailing + b.leading
  const trimZeros = trim && zeroFrames <= a.rate / 10
  const end = a.frames - (trimZeros ? a.trailing : 0)
  const start = trimZeros ? b.leading : 0
  const frames = Math.min(2 * a.rate, Math.floor(end / 2), Math.floor((b.frames - start) / 2))
  if (frames < 2) throw new Error('Audio too short for a transition')
  const stride = a.channels * 4
  const aOffset = end - frames - (a.frames - a.tail.length / stride)
  if (aOffset < 0 || (start + frames) * stride > b.head.length)
    throw new Error('Transition window unavailable')
  const pcm = Buffer.alloc(frames * stride)
  for (let frame = 0; frame < frames; frame++) {
    const gain = (1 - Math.cos((Math.PI * frame) / (frames - 1))) / 2
    for (let channel = 0; channel < a.channels; channel++) {
      const left = a.tail.readFloatLE((aOffset + frame) * stride + channel * 4)
      const right = b.head.readFloatLE((start + frame) * stride + channel * 4)
      const sample = left * (1 - gain) + right * gain
      if (!Number.isFinite(sample)) throw new Error('Non-finite transition sample')
      pcm.writeFloatLE(sample, frame * stride + channel * 4)
    }
  }
  // IEEE float WAV avoids clipping source peaks above full scale.
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(3, 20)
  header.writeUInt16LE(a.channels, 22)
  header.writeUInt32LE(a.rate, 24)
  header.writeUInt32LE(a.rate * stride, 28)
  header.writeUInt16LE(stride, 32)
  header.writeUInt16LE(32, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return {
    wave: Buffer.concat([header, pcm]),
    outgoingEnd: a.origin + (end - frames + 0.25) / a.rate,
    incomingStart: b.origin + start / b.rate,
    incomingResume: b.origin + (start + frames + 0.25) / b.rate,
    incomingDuration: b.origin + b.frames / b.rate,
    duration: frames / a.rate,
  }
}

export class SoftTransitionPreparer {
  private serial: Promise<unknown> = Promise.resolve()
  private readonly cache = new Map<string, TransitionAudio>()
  constructor(
    private readonly executable: string,
    private readonly mpvExecutable: string,
  ) {}

  async prepare(
    left: string,
    right: string,
    trim: boolean,
    signal: AbortSignal,
  ): Promise<SoftTransition | null> {
    const work = this.serial.then(() => this.create(left, right, trim, signal))
    this.serial = work.catch(() => undefined)
    return work
  }

  private async create(
    left: string,
    right: string,
    trim: boolean,
    signal: AbortSignal,
  ): Promise<SoftTransition | null> {
    signal.throwIfAborted()
    const [a, b] = await Promise.all([
      parseFile(left, { skipCovers: true }),
      parseFile(right, { skipCovers: true }),
    ])
    if (isConsecutiveAlbumPair(a.common, b.common) || left === right) return null
    const normalize = (value?: string) => value?.trim().toLocaleLowerCase() || ''
    const sameAlbum =
      normalize(a.common.album) &&
      normalize(a.common.album) === normalize(b.common.album) &&
      normalize(a.common.albumartist || a.common.artist) &&
      normalize(a.common.albumartist || a.common.artist) ===
        normalize(b.common.albumartist || b.common.artist)
    // Missing disc/track tags must not turn a possibly continuous album into a
    // crossfade. The stricter digital-silence eligibility remains unchanged.
    if (
      sameAlbum &&
      (!a.common.track.no || !b.common.track.no || !a.common.disk.no || !b.common.disk.no)
    )
      return null
    const rate = a.format.sampleRate
    const channels = a.format.numberOfChannels
    if (
      !rate ||
      !channels ||
      ![1, 2].includes(channels) ||
      rate > 192000 ||
      rate !== b.format.sampleRate ||
      channels !== b.format.numberOfChannels ||
      !a.format.duration ||
      !b.format.duration ||
      Math.max(a.format.duration, b.format.duration) > 7200
    )
      return null
    const scan = async (path: string) => {
      signal.throwIfAborted()
      const before = await stat(path)
      const key = `${path}\0${before.size}\0${before.mtimeMs}`
      const cached = this.cache.get(key)
      if (cached) return cached
      const audio = await scanTransitionAudio(this.executable, path, rate, channels, signal)
      audio.origin -= await readMpvTimestampOrigin(this.mpvExecutable, path, signal)
      // Some demuxers round their origin to microseconds. A sub-sample negative
      // residue is harmless; a larger mismatch needs an ordinary transition.
      if (audio.origin < -1 / rate) throw new Error('Unsupported rebased audio timestamp')
      const after = await stat(path)
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error('Audio changed during transition preparation')
      this.cache.set(key, audio)
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!)
      return audio
    }
    const current = await scan(left),
      next = await scan(right)
    signal.throwIfAborted()
    const { wave, ...timing } = renderSoftTransition(current, next, trim)
    const directory = await mkdtemp(join(tmpdir(), 'auralis-transition-'))
    const path = join(directory, 'bridge.wav')
    let disposal: Promise<void> | undefined
    const dispose = () =>
      (disposal ??= (async () => {
        // mpv process termination can release the Windows file handle asynchronously.
        for (let attempt = 0; ; attempt++) {
          try {
            await unlink(path)
            break
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === 'ENOENT') break
            if (attempt >= 9 || (code !== 'EPERM' && code !== 'EBUSY')) throw error
            await delay(100)
          }
        }
        await rmdir(directory)
      })())
    try {
      await writeFile(path, wave)
      signal.throwIfAborted()
      return { ...timing, path, dispose }
    } catch (error) {
      await unlink(path).catch(() => undefined)
      await rmdir(directory).catch(() => undefined)
      throw error
    }
  }
}
