export type AudioSnapshot = {
  currentTime: number
  duration: number
  isPlaying: boolean
}

type PreparedAudio = {
  trackId: number
  buffer: AudioBuffer
  pcmBytes: number
}

type EngineOptions = {
  onCurrentEnded: (nextTrackId: number | null) => void
  onPlaybackStateChange: (isPlaying: boolean) => void
  onTimeUpdate: (snapshot: AudioSnapshot) => void
}

type ScheduleNextOptions = {
  trimBoundarySilence?: boolean
}

const MAX_ENCODED_BYTES = 256 * 1024 * 1024
const MAX_SINGLE_PCM_BYTES = 320 * 1024 * 1024
const MAX_BUFFERED_PCM_BYTES = 512 * 1024 * 1024
const MAX_DURATION_SECONDS = 2 * 60 * 60
const SILENCE_THRESHOLD = 0.001
const MAX_BOUNDARY_SILENCE_SECONDS = 8
const SILENCE_GUARD_SECONDS = 0.005

/**
 * A deliberately small, two-buffer Web Audio backend.  It schedules the following
 * source on the audio clock; JavaScript is only notified when a boundary has passed.
 */
export class GaplessAudioEngine {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private current: PreparedAudio | null = null
  private next: PreparedAudio | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private nextSource: AudioBufferSourceNode | null = null
  private boundarySource: AudioBufferSourceNode | null = null
  private scheduledBoundaryAt: number | null = null
  private nextOffset = 0
  private startedAt = 0
  private offset = 0
  private playing = false
  private expectedEnd = false
  private readonly ignoredSources = new WeakSet<AudioBufferSourceNode>()
  private abortController: AbortController | null = null
  private frame: number | null = null
  private volume = 1
  private muted = false

  constructor(private readonly options: EngineOptions) {}

  get isActive(): boolean {
    return this.current !== null
  }

  getSnapshot(): AudioSnapshot {
    const duration = this.current?.buffer.duration ?? 0
    const currentTime =
      this.playing && this.context
        ? Math.min(duration, Math.max(0, this.context.currentTime - this.startedAt + this.offset))
        : this.offset
    return { currentTime, duration, isPlaying: this.playing }
  }

  async prepare(trackId: number, url: string): Promise<boolean> {
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller
    try {
      const response = await fetch(url, { signal: controller.signal })
      const length = Number(response.headers.get('content-length') || 0)
      if (!response.ok || (length && length > MAX_ENCODED_BYTES)) {
        this.reportPrepareFallback(trackId, `encoded payload is ${length || 'unknown'} bytes`)
        return false
      }
      const encoded = await response.arrayBuffer()
      if (encoded.byteLength > MAX_ENCODED_BYTES || controller.signal.aborted) {
        if (!controller.signal.aborted) {
          this.reportPrepareFallback(trackId, `encoded payload is ${encoded.byteLength} bytes`)
        }
        return false
      }
      const context = this.ensureContext()
      const buffer = await context.decodeAudioData(encoded)
      const pcmBytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
      const bufferedPcmBytes = (this.current?.pcmBytes ?? 0) + pcmBytes
      if (
        !buffer.duration ||
        buffer.duration > MAX_DURATION_SECONDS ||
        pcmBytes > MAX_SINGLE_PCM_BYTES ||
        bufferedPcmBytes > MAX_BUFFERED_PCM_BYTES
      ) {
        this.reportPrepareFallback(
          trackId,
          `decoded PCM requires ${pcmBytes} bytes (${bufferedPcmBytes} bytes buffered)`,
        )
        return false
      }
      if (controller.signal.aborted) return false
      this.next = { trackId, buffer, pcmBytes }
      return true
    } catch (error) {
      if (!controller.signal.aborted) {
        this.reportPrepareFallback(
          trackId,
          error instanceof Error ? error.message : 'fetch or decode failed',
        )
      }
      return false
    } finally {
      if (this.abortController === controller) this.abortController = null
    }
  }

  async start(trackId: number, url: string, offset = 0): Promise<boolean> {
    this.cancel()
    if (!(await this.prepare(trackId, url)) || !this.next) return false
    this.current = this.next
    this.next = null
    this.offset = Math.min(Math.max(0, offset), Math.max(0, this.current.buffer.duration - 0.001))
    await this.resume()
    this.startCurrentSource()
    return true
  }

  async scheduleNext(
    trackId: number,
    url: string,
    options: ScheduleNextOptions = {},
  ): Promise<boolean> {
    if (!this.current || !this.playing) return false
    if (!(await this.prepare(trackId, url)) || !this.next || this.next.trackId !== trackId)
      return false
    // If decoding completed after the current source has ended, do not start it late.
    const trailingSilence = options.trimBoundarySilence
      ? this.detectTrailingSilence(this.current.buffer)
      : 0
    const leadingSilence = options.trimBoundarySilence
      ? this.detectLeadingSilence(this.next.buffer)
      : 0
    const remainingDuration = this.current.buffer.duration - this.offset
    const appliedTrailingSilence = Math.min(trailingSilence, Math.max(0, remainingDuration - 0.03))
    const startAt = this.startedAt + remainingDuration - appliedTrailingSilence
    if (!this.context || startAt <= this.context.currentTime + 0.03) {
      this.next = null
      return false
    }
    this.nextSource = this.createSource(this.next.buffer)
    this.nextOffset = leadingSilence
    this.scheduledBoundaryAt = startAt
    this.nextSource.start(startAt, leadingSilence)
    if (appliedTrailingSilence > 0 || leadingSilence > 0) {
      this.scheduleTrimmedBoundary(startAt)
      console.debug('[Auralis gapless] Trimmed same-album digital silence', {
        fromTrackId: this.current.trackId,
        toTrackId: trackId,
        trailingSeconds: appliedTrailingSilence,
        leadingSeconds: leadingSilence,
      })
    }
    return true
  }

  async play(): Promise<void> {
    if (!this.current || this.playing) return
    await this.resume()
    this.startCurrentSource()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.getSnapshot().currentTime
    this.expectedEnd = true
    if (this.currentSource) this.ignoredSources.add(this.currentSource)
    if (this.nextSource) this.ignoredSources.add(this.nextSource)
    this.cancelBoundarySource()
    this.currentSource?.stop()
    this.nextSource?.stop()
    this.currentSource = null
    this.nextSource = null
    this.next = null
    this.scheduledBoundaryAt = null
    this.nextOffset = 0
    this.playing = false
    this.stopTicker()
    this.options.onPlaybackStateChange(false)
  }

  async seek(time: number): Promise<void> {
    if (!this.current) return
    const wasPlaying = this.playing
    this.pause()
    this.offset = Math.min(Math.max(0, time), Math.max(0, this.current.buffer.duration - 0.001))
    if (wasPlaying) await this.play()
    else this.options.onTimeUpdate(this.getSnapshot())
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume
    this.muted = muted
    if (this.gain) this.gain.gain.value = muted ? 0 : volume
  }

  cancel(): void {
    this.abortController?.abort()
    this.abortController = null
    this.expectedEnd = true
    if (this.currentSource) this.ignoredSources.add(this.currentSource)
    if (this.nextSource) this.ignoredSources.add(this.nextSource)
    this.cancelBoundarySource()
    this.currentSource?.stop()
    this.nextSource?.stop()
    this.currentSource = null
    this.nextSource = null
    this.current = null
    this.next = null
    this.scheduledBoundaryAt = null
    this.nextOffset = 0
    this.offset = 0
    this.playing = false
    this.stopTicker()
  }

  cancelScheduledNext(): void {
    this.abortController?.abort()
    this.abortController = null
    this.cancelBoundarySource()
    if (this.nextSource) this.ignoredSources.add(this.nextSource)
    this.nextSource?.stop()
    this.nextSource = null
    this.next = null
    this.scheduledBoundaryAt = null
    this.nextOffset = 0
  }

  destroy(): void {
    this.cancel()
    void this.context?.close()
    this.context = null
    this.gain = null
  }

  private ensureContext(): AudioContext {
    if (!this.context) this.context = new AudioContext()
    if (!this.gain) {
      this.gain = this.context.createGain()
      this.gain.gain.value = this.muted ? 0 : this.volume
      this.gain.connect(this.context.destination)
    }
    return this.context
  }

  private async resume(): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()
  }

  private createSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ensureContext().createBufferSource()
    source.buffer = buffer
    source.connect(this.gain!)
    source.onended = () => {
      if (this.expectedEnd || this.ignoredSources.has(source)) return
      if (source !== this.currentSource) return
      const nextTrackId = this.next?.trackId ?? null
      if (this.nextSource && this.next) {
        const boundaryAt =
          this.scheduledBoundaryAt ?? this.startedAt + buffer.duration - this.offset
        this.promoteScheduledNext(boundaryAt)
      } else {
        this.playing = false
        this.stopTicker()
      }
      this.options.onCurrentEnded(nextTrackId)
    }
    return source
  }

  private startCurrentSource(): void {
    if (!this.current || !this.context) return
    this.expectedEnd = false
    this.startedAt = this.context.currentTime
    this.currentSource = this.createSource(this.current.buffer)
    this.currentSource.start(this.startedAt, this.offset)
    this.playing = true
    this.options.onPlaybackStateChange(true)
    this.startTicker()
  }

  private startTicker(): void {
    const tick = () => {
      if (!this.playing) return
      this.options.onTimeUpdate(this.getSnapshot())
      this.frame = requestAnimationFrame(tick)
    }
    this.stopTicker()
    this.frame = requestAnimationFrame(tick)
  }

  private stopTicker(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private scheduleTrimmedBoundary(startAt: number): void {
    if (!this.context) return
    const marker = this.context.createBufferSource()
    marker.buffer = this.context.createBuffer(1, 1, this.context.sampleRate)
    marker.connect(this.gain!)
    marker.onended = () => {
      if (marker !== this.boundarySource || !this.nextSource || !this.next) return
      this.boundarySource = null
      marker.disconnect()
      if (this.currentSource) {
        this.ignoredSources.add(this.currentSource)
        this.currentSource.stop()
      }
      const nextTrackId = this.next.trackId
      this.promoteScheduledNext(startAt)
      this.options.onCurrentEnded(nextTrackId)
    }
    this.boundarySource = marker
    marker.start(startAt)
  }

  private promoteScheduledNext(boundaryAt: number): void {
    if (!this.nextSource || !this.next) return
    this.current = this.next
    this.next = null
    this.currentSource = this.nextSource
    this.nextSource = null
    this.startedAt = boundaryAt
    this.offset = this.nextOffset
    this.nextOffset = 0
    this.scheduledBoundaryAt = null
  }

  private cancelBoundarySource(): void {
    const marker = this.boundarySource
    this.boundarySource = null
    if (!marker) return
    marker.onended = null
    try {
      marker.stop()
    } catch {
      // The marker may not have started yet or may already have ended.
    }
    marker.disconnect()
  }

  private detectLeadingSilence(buffer: AudioBuffer): number {
    const maxFrames = Math.min(
      buffer.length,
      Math.floor(buffer.sampleRate * MAX_BOUNDARY_SILENCE_SECONDS),
    )
    for (let frame = 0; frame < maxFrames; frame += 1) {
      if (!this.isSilentFrame(buffer, frame)) {
        return Math.max(0, frame / buffer.sampleRate - SILENCE_GUARD_SECONDS)
      }
    }
    return maxFrames / buffer.sampleRate
  }

  private detectTrailingSilence(buffer: AudioBuffer): number {
    const minFrame = Math.max(
      0,
      buffer.length - Math.floor(buffer.sampleRate * MAX_BOUNDARY_SILENCE_SECONDS),
    )
    for (let frame = buffer.length - 1; frame >= minFrame; frame -= 1) {
      if (!this.isSilentFrame(buffer, frame)) {
        return Math.max(0, (buffer.length - frame - 1) / buffer.sampleRate - SILENCE_GUARD_SECONDS)
      }
    }
    return (buffer.length - minFrame) / buffer.sampleRate
  }

  private isSilentFrame(buffer: AudioBuffer, frame: number): boolean {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      if (Math.abs(buffer.getChannelData(channel)[frame]) > SILENCE_THRESHOLD) return false
    }
    return true
  }

  private reportPrepareFallback(trackId: number, reason: string): void {
    console.warn('[Auralis gapless] Falling back to HTMLAudio', { trackId, reason })
  }
}
