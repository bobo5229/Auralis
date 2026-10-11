import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { SpectrumAnalyzer } from '@shared/audio/spectrumAnalysis'
import {
  SPECTRUM_BANDS,
  SPECTRUM_CHANNELS,
  SPECTRUM_FFT_SIZE,
  SPECTRUM_HOP_SIZE,
  SPECTRUM_SAMPLE_RATE,
  type PlaybackSpectrumFrame,
  type SpectrumSubscription,
} from '@shared/types/playbackSpectrum'
import type { PlaybackCoordinator } from './nativePlaybackService'
import { normalizeAudioFilePath } from './playbackFileCoordinator'

export interface SpectrumSource {
  trackId: number
  path: string
  currentTime: number
  isPlaying: boolean
  /** A soft-transition bridge starts partway through the incoming track. */
  timelineOffset: number
}

interface Options {
  ffmpegPath: string
  resolveTrack: (trackId: number) => Promise<string>
  emit: (frame: PlaybackSpectrumFrame) => void
  warn: (error: unknown) => void
  coordinator?: PlaybackCoordinator
}

interface TimedFrame {
  time: number
  bands: number[]
  rms: number
  bass: number
}
const HORIZON = 1.5
const MAX_CARRY_BYTES = 512 * 1024

/** Silent, bounded look-ahead decoding. Playback is the only time authority. */
export class PlaybackSpectrumService {
  private suspendedPath: string | null = null
  private subscription: SpectrumSubscription | null = null
  private source: SpectrumSource | null = null
  private anchorAt = 0
  private child: ChildProcessWithoutNullStreams | null = null
  private decoderAbort: AbortController | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private epoch = 0
  private sequence = 0
  private revision = -1
  private decodeStart = 0
  private decodedSamples = 0
  private carry = Buffer.alloc(0)
  private frames: TimedFrame[] = []
  private eof = false
  private failed = false
  private lastFrameTime = -1
  private readonly analyzer = new SpectrumAnalyzer()
  private readonly closing = new Set<Promise<void>>()
  private lastHeartbeat = 0
  private resolvingKey: string | null = null
  private usingNative = false
  readonly diagnostics = {
    analyzedFrames: 0,
    maxBufferedFrames: 0,
    maxCarryBytes: 0,
    maxAnalysisMs: 0,
    emittedFrames: 0,
    decoderStarts: 0,
  }

  constructor(private readonly options: Options) {}

  /** Main-process diagnostics only; never exposed to renderer capabilities. */
  get decoderPid(): number | null {
    return this.child?.pid ?? null
  }

  async subscribe(
    request: SpectrumSubscription,
    nativeSource: SpectrumSource | null = null,
  ): Promise<{ accepted: boolean }> {
    if (request.revision <= this.revision) return { accepted: false }
    this.revision = request.revision
    this.lastHeartbeat = performance.now()
    const previous = this.subscription
    this.subscription = { ...request }
    if (!request.enabled || request.trackId === null || !request.isPlaying) {
      this.stopDecoder()
      this.stopTimer()
      this.source = null
      this.emit(request.isPlaying ? 'waiting' : 'paused')
      return { accepted: true }
    }
    if (previous?.subscriptionId !== request.subscriptionId) this.stopDecoder()
    if (this.failed && previous?.trackId === request.trackId) return { accepted: true }
    if (this.source && this.source.trackId !== request.trackId) {
      this.stopDecoder()
      this.source = null
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000 / 30)
    if (nativeSource?.trackId === request.trackId) {
      this.usingNative = true
      this.syncSource(nativeSource)
      return { accepted: true }
    }
    this.usingNative = false
    // Resolve only on track changes; never accept paths from the renderer.
    if (this.source?.trackId === request.trackId && this.source.timelineOffset === 0) {
      this.syncSource({ ...this.source, currentTime: request.currentTime, isPlaying: true })
      return { accepted: true }
    }
    const key = `${request.subscriptionId}:${request.trackId}`
    if (this.resolvingKey === key) return { accepted: true }
    this.resolvingKey = key
    try {
      const path = await this.options.resolveTrack(request.trackId)
      const current = this.subscription
      if (
        !current?.enabled ||
        !current.isPlaying ||
        this.usingNative ||
        `${current.subscriptionId}:${current.trackId}` !== key
      )
        return { accepted: false }
      this.syncSource({
        trackId: request.trackId,
        path,
        currentTime: current.currentTime,
        isPlaying: true,
        timelineOffset: 0,
      })
    } catch (error) {
      if (
        this.subscription?.enabled &&
        `${this.subscription.subscriptionId}:${this.subscription.trackId}` === key
      ) {
        this.failed = true
        this.emit('unavailable')
        this.options.warn(error)
      }
    } finally {
      if (this.resolvingKey === key) this.resolvingKey = null
    }
    return { accepted: true }
  }

  syncNative(source: SpectrumSource | null): void {
    if (!this.subscription?.enabled) return
    if (source && source.trackId === this.subscription.trackId) {
      this.usingNative = true
      this.syncSource(source)
    } else if (!source && this.usingNative) {
      this.stopDecoder()
      this.source = null
      this.emit('waiting')
    }
  }

  private clock(): number {
    if (!this.source) return 0
    return (
      this.source.currentTime +
      (this.source.isPlaying ? Math.min(0.25, (performance.now() - this.anchorAt) / 1000) : 0)
    )
  }

  private syncSource(next: SpectrumSource): void {
    const previous = this.source
    const changed =
      !previous ||
      previous.path !== next.path ||
      previous.trackId !== next.trackId ||
      previous.timelineOffset !== next.timelineOffset
    const jumped =
      previous &&
      (next.currentTime < previous.currentTime - 0.02 ||
        Math.abs(next.currentTime - this.clock()) > 0.3)
    if (changed || jumped || !next.isPlaying) this.stopDecoder()
    if (
      changed ||
      next.currentTime !== previous?.currentTime ||
      next.isPlaying !== previous?.isPlaying
    ) {
      this.source = { ...next }
      this.anchorAt = performance.now()
    }
    if (!next.isPlaying) {
      this.emit('paused')
      return
    }
    if (!this.decoderAbort && !this.failed && !this.eof) void this.startDecoder()
  }

  private async startDecoder(): Promise<void> {
    const source = this.source
    if (!source) return
    if (normalizeAudioFilePath(source.path) === this.suspendedPath) return
    const abort = new AbortController()
    this.decoderAbort = abort
    const epoch = this.epoch
    let lease: string | null = null
    try {
      if (this.options.coordinator) {
        lease = (
          await this.options.coordinator.acquireReadLease(
            source.path,
            'spectrum-analysis',
            abort.signal,
          )
        ).leaseId
      }
      if (abort.signal.aborted || epoch !== this.epoch) {
        if (lease) this.options.coordinator?.releaseReadLease(lease)
        return
      }
      this.decodeStart = this.clock()
      this.decodedSamples = 0
      const child = spawn(
        this.options.ffmpegPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-threads',
          '1',
          '-ss',
          String(Math.max(0, this.decodeStart - source.timelineOffset)),
          '-i',
          source.path,
          '-map',
          '0:a:0',
          '-vn',
          '-sn',
          '-dn',
          '-ac',
          String(SPECTRUM_CHANNELS),
          '-ar',
          String(SPECTRUM_SAMPLE_RATE),
          '-f',
          'f32le',
          '-flush_packets',
          '1',
          'pipe:1',
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      child.stdin.end()
      this.child = child
      this.diagnostics.decoderStarts++
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-2048)
      })
      const closed = new Promise<void>((resolve) => {
        child.once('close', (code) => {
          if (lease) this.options.coordinator?.releaseReadLease(lease)
          if (this.child === child && epoch === this.epoch) {
            this.child = null
            this.eof = code === 0
            if (code !== 0 && !abort.signal.aborted)
              this.fail(new Error(`Spectrum decoder failed: ${stderr}`))
          }
          resolve()
        })
      })
      this.closing.add(closed)
      void closed.then(() => this.closing.delete(closed))
      child.on('error', (error) => {
        if (epoch === this.epoch && !abort.signal.aborted) this.fail(error)
      })
      child.stdout.on('data', (chunk: Buffer) => {
        if (epoch !== this.epoch || abort.signal.aborted) return
        if (this.carry.length + chunk.length > MAX_CARRY_BYTES) {
          this.fail(new Error('Spectrum buffer limit exceeded'))
          return
        }
        this.carry = Buffer.concat([this.carry, chunk])
        this.diagnostics.maxCarryBytes = Math.max(this.diagnostics.maxCarryBytes, this.carry.length)
        this.consume()
      })
    } catch (error) {
      if (lease) this.options.coordinator?.releaseReadLease(lease)
      if (!abort.signal.aborted && epoch === this.epoch) this.fail(error)
    }
  }

  private consume(): void {
    const horizon = this.clock() + HORIZON
    let offset = 0
    while (
      this.carry.length - offset >= SPECTRUM_FFT_SIZE * 4 * SPECTRUM_CHANNELS &&
      this.decodeStart + this.decodedSamples / SPECTRUM_SAMPLE_RATE < horizon
    ) {
      const left = new Float32Array(SPECTRUM_FFT_SIZE)
      const right = new Float32Array(SPECTRUM_FFT_SIZE)
      for (let i = 0; i < left.length; i++) {
        left[i] = this.carry.readFloatLE(offset + i * 8)
        right[i] = this.carry.readFloatLE(offset + i * 8 + 4)
      }
      const started = performance.now()
      const first = this.analyzer.analyze(left)
      const second = this.analyzer.analyze(right)
      // Analyze stereo channels separately: a mono sum can cancel phase-opposed music.
      const spectrum = {
        bands: first.bands.map((value, index) => Math.max(value, second.bands[index])),
        rms: Math.sqrt((first.rms ** 2 + second.rms ** 2) / 2),
        bass: Math.sqrt((first.bass ** 2 + second.bass ** 2) / 2),
      }
      this.diagnostics.maxAnalysisMs = Math.max(
        this.diagnostics.maxAnalysisMs,
        performance.now() - started,
      )
      this.frames.push({
        time:
          this.decodeStart + (this.decodedSamples + SPECTRUM_FFT_SIZE / 2) / SPECTRUM_SAMPLE_RATE,
        ...spectrum,
      })
      this.decodedSamples += SPECTRUM_HOP_SIZE
      offset += SPECTRUM_HOP_SIZE * 4 * SPECTRUM_CHANNELS
      this.diagnostics.analyzedFrames++
    }
    if (offset) this.carry = Buffer.from(this.carry.subarray(offset))
    this.diagnostics.maxBufferedFrames = Math.max(
      this.diagnostics.maxBufferedFrames,
      this.frames.length,
    )
    if (this.decodeStart + this.decodedSamples / SPECTRUM_SAMPLE_RATE >= horizon)
      this.child?.stdout.pause()
    else this.child?.stdout.resume()
  }

  private tick(): void {
    if (performance.now() - this.lastHeartbeat > 1500) {
      this.stopDecoder()
      this.stopTimer()
      return
    }
    if (!this.source?.isPlaying || !this.subscription?.isPlaying) return
    const time = this.clock()
    while (this.frames.length > 1 && this.frames[1].time <= time) this.frames.shift()
    this.consume()
    const frame = this.frames[0]
    if (!frame || Math.abs(frame.time - time) > 0.15) {
      this.emit(this.failed ? 'unavailable' : 'waiting')
      return
    }
    if (frame.time === this.lastFrameTime) return
    this.lastFrameTime = frame.time
    this.emit('ready', frame)
  }

  private emit(status: PlaybackSpectrumFrame['status'], frame?: TimedFrame): void {
    const request = this.subscription
    if (!request) return
    this.diagnostics.emittedFrames++
    this.options.emit({
      subscriptionId: request.subscriptionId,
      epoch: this.epoch,
      sequence: ++this.sequence,
      trackId: this.source?.trackId ?? request.trackId,
      currentTime: frame?.time ?? this.source?.currentTime ?? request.currentTime,
      status,
      bands: frame?.bands ?? Array(SPECTRUM_BANDS).fill(0),
      rms: frame?.rms ?? 0,
      bass: frame?.bass ?? 0,
    })
  }

  private fail(error: unknown): void {
    this.stopDecoder()
    this.failed = true
    this.emit('unavailable')
    this.options.warn(error)
  }

  private stopDecoder(): void {
    this.epoch++
    this.decoderAbort?.abort()
    this.decoderAbort = null
    const child = this.child
    this.child = null
    child?.kill()
    this.frames = []
    this.carry = Buffer.alloc(0)
    this.eof = false
    this.failed = false
    this.lastFrameTime = -1
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async suspendFileReaders(filePath: string): Promise<() => void> {
    const path = normalizeAudioFilePath(filePath)
    this.suspendedPath = path
    if (this.source && normalizeAudioFilePath(this.source.path) === path) this.stopDecoder()
    await Promise.allSettled([...this.closing])
    return () => {
      if (this.suspendedPath !== path) return
      this.suspendedPath = null
      if (this.source?.isPlaying && !this.decoderAbort && !this.failed && !this.eof)
        void this.startDecoder()
    }
  }

  async dispose(): Promise<void> {
    this.stopDecoder()
    this.stopTimer()
    this.subscription = null
    this.source = null
    await Promise.allSettled([...this.closing])
  }
}
