import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { cleanDelimitedValues } from '@shared/utils/delimitedValues'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { parseFirstPcmTimestamp, readMpvTimestampOrigin } from './audioTimestamp'
import type { DigitalBoundary } from './digitalSilence'

export const LIVE_SILENCE_DB = -60
export const LIVE_SILENCE_MINIMUM_SECONDS = 1

export function hasLiveGenre(genres: readonly string[] | undefined): boolean {
  return cleanDelimitedValues([...(genres ?? [])]).some((genre) => genre.toLowerCase() === 'live')
}

interface EdgeScan {
  frames: number
  leading: number
  trailing: number
  origin: number
  rate: number
}

export interface LiveBoundaryResult {
  live: boolean
  boundary: DigitalBoundary | null
}

/** Keep only edge candidates, never remove an interval inside a song. */
export class LiveSilenceEdges {
  private active: number | null = null
  private leadingEnd = 0
  private last: { start: number; end: number } | null = null

  push(line: string): void {
    for (const match of line.matchAll(/\bsilence_(start|end):\s*([-+\d.eE]+)/g)) {
      const time = Number(match[2])
      if (!Number.isFinite(time) || time < 0) throw new Error('Invalid live silence timestamp')
      if (match[1] === 'start') this.active = time
      else if (this.active !== null) {
        if (this.active === 0) this.leadingEnd = time
        this.last = { start: this.active, end: time }
        this.active = null
      }
    }
  }

  finish(frames: number, rate: number): { leading: number; trailing: number } {
    const duration = frames / rate
    // FFmpeg prints silence timestamps to six decimals. Keep the rounding
    // allowance below one sample even at 192 kHz, so a final audible sample survives.
    const trailingStart =
      this.active ?? (this.last && this.last.end >= duration - 0.000001 ? this.last.start : null)
    const clamp = (time: number) => Math.max(0, Math.min(frames, Math.round(time * rate)))
    return {
      leading: this.active === 0 ? frames : clamp(this.leadingEnd),
      trailing: trailingStart === null ? 0 : frames - clamp(trailingStart),
    }
  }
}

/** Async streaming scan: retain timestamps and counters, not the full decoded PCM. */
export class LiveSilenceAnalyzer {
  private readonly cache = new Map<string, EdgeScan>()
  private serial: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly executable: string,
    private readonly mpvExecutable: string,
  ) {}

  async boundary(left: string, right: string, signal: AbortSignal): Promise<LiveBoundaryResult> {
    signal.throwIfAborted()
    const readers = [left, right].map((path) => parseAudioMetadata(path, { skipCovers: true }))
    let metadata: Awaited<(typeof readers)[number]>[]
    try {
      metadata = await Promise.all(readers)
    } catch (error) {
      await Promise.allSettled(readers)
      throw error
    }
    signal.throwIfAborted()
    if (!metadata.some((entry) => hasLiveGenre(entry.common.genre)))
      return { live: false, boundary: null }
    // Live always suppresses crossfade, including unsupported/entirely silent files.
    if (
      metadata.some(
        ({ format }) =>
          !format.sampleRate ||
          format.sampleRate > 192000 ||
          !format.numberOfChannels ||
          format.numberOfChannels > 32 ||
          (format.duration !== undefined && format.duration > 7200),
      )
    )
      return { live: true, boundary: null }
    const lifetime = new AbortController()
    const scanSignal = AbortSignal.any([signal, lifetime.signal])
    const scans = [left, right].map((path, index) =>
      this.scan(
        path,
        metadata[index]!.format.sampleRate!,
        metadata[index]!.format.numberOfChannels!,
        scanSignal,
      ),
    )
    let pair: EdgeScan[]
    try {
      pair = await Promise.all(scans)
    } catch (error) {
      // A failed side must not leave its sibling reading files after analysis drains.
      lifetime.abort()
      await Promise.allSettled(scans)
      throw error
    }
    const [a, b] = pair as [EdgeScan, EdgeScan]
    signal.throwIfAborted()
    if (a.leading === a.frames || b.leading === b.frames || (!a.trailing && !b.leading))
      return { live: true, boundary: null }
    return {
      live: true,
      boundary: {
        start: b.leading ? b.origin + (b.leading + 0.25) / b.rate : 0,
        end: a.trailing ? a.origin + (a.frames - a.trailing + 0.25) / a.rate : null,
      },
    }
  }

  private async scan(
    path: string,
    rate: number,
    channels: number,
    signal: AbortSignal,
  ): Promise<EdgeScan> {
    signal.throwIfAborted()
    const before = await stat(path)
    signal.throwIfAborted()
    const key = `${path}\0${before.size}\0${before.mtimeMs}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const work = this.serial.then(async () => {
      signal.throwIfAborted()
      const existing = this.cache.get(key)
      if (existing) return existing
      const result = await this.decode(path, rate, channels, signal)
      const after = await stat(path)
      signal.throwIfAborted()
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error('Audio changed during live silence scan')
      this.cache.set(key, result)
      while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!)
      return result
    })
    this.serial = work.catch(() => undefined)
    return work
  }

  private async decode(
    path: string,
    rate: number,
    channels: number,
    signal: AbortSignal,
  ): Promise<EdgeScan> {
    signal.throwIfAborted()
    const edges = new LiveSilenceEdges()
    let bytes = 0
    let origin: number | undefined
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.executable,
        [
          '-nostdin',
          '-nostats',
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
          `ashowinfo,asetpts=PTS-STARTPTS,silencedetect=noise=${LIVE_SILENCE_DB}dB:d=${LIVE_SILENCE_MINIMUM_SECONDS}`,
          '-c:a',
          'pcm_f32le',
          '-f',
          'f32le',
          'pipe:1',
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let pending = ''
      let diagnostics = ''
      let failure: Error | undefined
      const stop = (error: Error) => {
        failure ??= error
        child.kill()
      }
      const abort = () => stop(new Error('Live silence scan cancelled'))
      const timer = setTimeout(() => stop(new Error('Live silence scan timed out')), 60000)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      const consume = (line: string) => {
        try {
          origin ??= parseFirstPcmTimestamp(line, rate, channels)
          edges.push(line)
        } catch (error) {
          stop(error as Error)
        }
      }
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        diagnostics = (diagnostics + text).slice(-8192)
        const lines = (pending + text).split('\n')
        pending = lines.pop()!.slice(-8192)
        for (const line of lines) consume(line)
      })
      child.on('error', (error) => {
        failure = error
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        consume(pending)
        if (failure || code !== 0)
          reject(failure ?? new Error(`Live silence scan failed: ${diagnostics}`))
        else resolve()
      })
    })
    signal.throwIfAborted()
    const frames = bytes / (channels * 4)
    if (!Number.isInteger(frames) || frames <= 0 || origin === undefined)
      throw new Error('Incomplete live silence scan')
    origin -= await readMpvTimestampOrigin(this.mpvExecutable, path, signal)
    signal.throwIfAborted()
    if (origin < -1 / rate) throw new Error('Unsupported rebased audio timestamp')
    return { frames, rate, origin, ...edges.finish(frames, rate) }
  }
}
