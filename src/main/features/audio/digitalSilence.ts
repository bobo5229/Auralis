import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'

export interface DigitalBoundary {
  start: number
  end: number | null
}

/** Exact float32 zeros across every channel, including negative zero. No dB threshold. */
export class DigitalZeroCounter {
  frames = 0
  leading = 0
  trailing = 0
  private carry = Buffer.alloc(0)
  private foundSignal = false
  constructor(private readonly channels: number) {
    if (!Number.isInteger(channels) || channels < 1 || channels > 32)
      throw new Error('Invalid channel count')
  }
  push(chunk: Buffer): void {
    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk
    const frameBytes = this.channels * 4
    const limit = data.length - (data.length % frameBytes)
    for (let offset = 0; offset < limit; offset += frameBytes) {
      let zero = true
      for (let channel = 0; channel < this.channels; channel++) {
        if (data.readFloatLE(offset + channel * 4) !== 0) {
          zero = false
          break
        }
      }
      this.frames++
      if (zero) {
        this.trailing++
        if (!this.foundSignal) this.leading++
      } else {
        this.foundSignal = true
        this.trailing = 0
      }
    }
    this.carry = Buffer.from(data.subarray(limit))
  }
  finish(): void {
    if (this.carry.length || !this.foundSignal)
      throw new Error('Incomplete or entirely silent audio')
  }
}

interface BoundaryIdentity {
  album?: string
  artist?: string
  albumartist?: string
  track: { no: number | null }
  disk: { no: number | null }
}

export function isConsecutiveAlbumPair(left: BoundaryIdentity, right: BoundaryIdentity): boolean {
  const normalize = (value?: string) => value?.trim().toLocaleLowerCase() || ''
  return Boolean(
    normalize(left.album) &&
    normalize(left.album) === normalize(right.album) &&
    normalize(left.albumartist || left.artist) &&
    normalize(left.albumartist || left.artist) === normalize(right.albumartist || right.artist) &&
    left.disk.no !== null &&
    left.disk.no > 0 &&
    left.disk.no === right.disk.no &&
    left.track.no !== null &&
    left.track.no > 0 &&
    right.track.no === left.track.no + 1,
  )
}

export function chooseDigitalBoundary(
  left: { frames: number; trailing: number },
  right: { leading: number },
  sampleRate: number,
): DigitalBoundary | null {
  const total = left.trailing + right.leading
  // Conservative opt-in limit; longer silence can be an intentional album pause.
  if (total <= 0 || total > sampleRate * 0.1) return null
  return {
    start: right.leading ? (right.leading + 0.25) / sampleRate : 0,
    // Bias into verified silence: time-to-sample rounding in mpv must not eat
    // the final nonzero frame. The small bias remains inside one silent frame.
    end: left.trailing ? (left.frames - left.trailing + 0.25) / sampleRate : null,
  }
}

interface ScanResult {
  frames: number
  leading: number
  trailing: number
}

export class DigitalSilenceAnalyzer {
  private readonly cache = new Map<string, ScanResult>()
  private readonly pending = new Map<
    string,
    { signal: AbortSignal; promise: Promise<ScanResult> }
  >()
  private serial: Promise<unknown> = Promise.resolve()
  constructor(private readonly executable: string) {}

  async boundary(
    left: string,
    right: string,
    signal: AbortSignal,
  ): Promise<DigitalBoundary | null> {
    const [a, b] = await Promise.all([
      parseFile(left, { skipCovers: true, duration: false }),
      parseFile(right, { skipCovers: true, duration: false }),
    ])
    if (!isConsecutiveAlbumPair(a.common, b.common)) return null
    const rate = a.format.sampleRate
    const channels = a.format.numberOfChannels
    if (
      !rate ||
      !channels ||
      rate !== b.format.sampleRate ||
      channels !== b.format.numberOfChannels
    )
      return null
    if (
      !a.format.duration ||
      !b.format.duration ||
      Math.max(a.format.duration, b.format.duration) > 7200
    )
      return null
    const current = await this.scan(left, channels, signal)
    const next = await this.scan(right, channels, signal)
    return chooseDigitalBoundary(current, next, rate)
  }

  private async scan(path: string, channels: number, signal: AbortSignal): Promise<ScanResult> {
    signal.throwIfAborted()
    const before = await stat(path)
    const key = `${path}\0${before.size}\0${before.mtimeMs}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const pending = this.pending.get(key)
    if (pending && !pending.signal.aborted) return pending.promise
    const work = this.serial.then(() => this.decode(path, channels, signal, before, key))
    this.pending.set(key, { signal, promise: work })
    this.serial = work.catch(() => undefined)
    try {
      return await work
    } finally {
      if (this.pending.get(key)?.promise === work) this.pending.delete(key)
    }
  }

  private async decode(
    path: string,
    channels: number,
    signal: AbortSignal,
    before: { size: number; mtimeMs: number },
    key: string,
  ): Promise<ScanResult> {
    signal.throwIfAborted()
    const counter = new DigitalZeroCounter(channels)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.executable,
        [
          '-nostdin',
          '-v',
          'error',
          '-threads',
          '1',
          '-i',
          path,
          '-map',
          '0:a:0',
          '-vn',
          '-sn',
          '-dn',
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
      const abort = () => {
        failure = new Error('Digital silence scan cancelled')
        child.kill()
      }
      const timeout = setTimeout(() => {
        failure = new Error('Digital silence scan timed out')
        child.kill()
      }, 60_000)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      child.stdout.on('data', (chunk: Buffer) => counter.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString('utf8')).slice(-2048)
      })
      child.on('error', (error) => {
        failure = error
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        if (failure || code !== 0) reject(failure ?? new Error(`Audio scan failed: ${diagnostics}`))
        else resolve()
      })
    })
    counter.finish()
    signal.throwIfAborted()
    const after = await stat(path)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error('Audio changed during boundary scan')
    const result = { frames: counter.frames, leading: counter.leading, trailing: counter.trailing }
    this.cache.set(key, result)
    while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!)
    return result
  }
}
