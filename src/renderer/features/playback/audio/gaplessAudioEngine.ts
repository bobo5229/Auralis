export type AudioSnapshot = {
  currentTime: number
  duration: number
  isPlaying: boolean
}

type PreparedAudio = {
  trackId: number
  buffer: AudioBuffer
}

type EngineOptions = {
  onCurrentEnded: (nextTrackId: number | null) => void
  onPlaybackStateChange: (isPlaying: boolean) => void
  onTimeUpdate: (snapshot: AudioSnapshot) => void
}

const MAX_ENCODED_BYTES = 48 * 1024 * 1024
const MAX_PCM_BYTES = 160 * 1024 * 1024
const MAX_DURATION_SECONDS = 2 * 60 * 60

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
      if (!response.ok || (length && length > MAX_ENCODED_BYTES)) return false
      const encoded = await response.arrayBuffer()
      if (encoded.byteLength > MAX_ENCODED_BYTES || controller.signal.aborted) return false
      const context = this.ensureContext()
      const buffer = await context.decodeAudioData(encoded)
      const pcmBytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
      if (!buffer.duration || buffer.duration > MAX_DURATION_SECONDS || pcmBytes > MAX_PCM_BYTES)
        return false
      if (controller.signal.aborted) return false
      this.next = { trackId, buffer }
      return true
    } catch {
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

  async scheduleNext(trackId: number, url: string): Promise<boolean> {
    if (!this.current || !this.playing) return false
    if (!(await this.prepare(trackId, url)) || !this.next || this.next.trackId !== trackId)
      return false
    // If decoding completed after the current source has ended, do not start it late.
    const startAt = this.startedAt + this.current.buffer.duration - this.offset
    if (!this.context || startAt <= this.context.currentTime + 0.03) {
      this.next = null
      return false
    }
    this.nextSource = this.createSource(this.next.buffer)
    this.nextSource.start(startAt)
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
    this.currentSource?.stop()
    this.nextSource?.stop()
    this.currentSource = null
    this.nextSource = null
    this.next = null
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
    this.currentSource?.stop()
    this.nextSource?.stop()
    this.currentSource = null
    this.nextSource = null
    this.current = null
    this.next = null
    this.offset = 0
    this.playing = false
    this.stopTicker()
  }

  cancelScheduledNext(): void {
    this.abortController?.abort()
    this.abortController = null
    if (this.nextSource) this.ignoredSources.add(this.nextSource)
    this.nextSource?.stop()
    this.nextSource = null
    this.next = null
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
        this.current = this.next
        this.next = null
        this.currentSource = this.nextSource
        this.nextSource = null
        this.startedAt = this.startedAt + buffer.duration - this.offset
        this.offset = 0
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
}
