const PLAY_COUNT_THRESHOLD_RATIO = 0.55
const PLAY_COUNT_TICK_MS = 1000
const MAX_REALTIME_DELTA_SECONDS = 2.5
const MIN_COUNTABLE_DURATION_SECONDS = 5
const MAX_COUNTABLE_DURATION_SECONDS = 24 * 60 * 60
const SEEK_FALLBACK_MS = 300

export interface EffectivePlayPayload {
  trackId: number
  sessionId: string
  playedAtIso: string
}

export interface EffectivePlayTrackerOptions {
  isPlaybackCountable: (trackId: number) => boolean
  getDurationSeconds: () => number | null
  recordEffectivePlay: (payload: EffectivePlayPayload) => Promise<{ ok: boolean }>
  onRecordError?: (error: unknown) => void
  monotonicNow?: () => number
  epochNow?: () => number
  randomToken?: () => string
}

interface EffectivePlaySession {
  sessionId: string
  trackId: number
  lastSampleAt: number
  realPlayedSeconds: number
  counted: boolean
  countInFlight: boolean
}

export class EffectivePlayTracker {
  private readonly monotonicNow: () => number
  private readonly epochNow: () => number
  private readonly randomToken: () => string
  private session: EffectivePlaySession | null = null
  private sampleTimer: ReturnType<typeof setInterval> | null = null
  private seekFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private buffering = false
  private seeking = false

  constructor(private readonly options: EffectivePlayTrackerOptions) {
    this.monotonicNow = options.monotonicNow ?? (() => performance.now())
    this.epochNow = options.epochNow ?? (() => Date.now())
    this.randomToken = options.randomToken ?? (() => Math.random().toString(36).slice(2))
  }

  start(trackId: number): void {
    this.end()
    const now = this.monotonicNow()
    this.session = {
      sessionId: `${trackId}-${this.epochNow()}-${this.randomToken()}`,
      trackId,
      lastSampleAt: now,
      realPlayedSeconds: 0,
      counted: false,
      countInFlight: false,
    }
    this.sampleTimer = setInterval(() => this.sample(), PLAY_COUNT_TICK_MS)
  }

  end(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
    }
    this.clearSeekFallback()
    this.seeking = false
    this.buffering = false
    this.session = null
  }

  resetSample(): void {
    if (this.session) this.session.lastSampleAt = this.monotonicNow()
  }

  setBuffering(buffering: boolean): void {
    this.buffering = buffering
    this.resetSample()
  }

  beginSeekingWithFallback(): void {
    this.seeking = true
    this.clearSeekFallback()
    this.seekFallbackTimer = setTimeout(() => {
      this.seeking = false
      this.resetSample()
      this.seekFallbackTimer = null
    }, SEEK_FALLBACK_MS)
    this.resetSample()
  }

  endSeeking(): void {
    this.clearSeekFallback()
    this.seeking = false
    this.resetSample()
  }

  sample(): void {
    const session = this.session
    if (!session || session.counted || session.countInFlight) return

    const now = this.monotonicNow()
    if (!this.buffering && !this.seeking && this.options.isPlaybackCountable(session.trackId)) {
      const deltaSeconds = Math.min((now - session.lastSampleAt) / 1000, MAX_REALTIME_DELTA_SECONDS)
      session.realPlayedSeconds += deltaSeconds
    }
    session.lastSampleAt = now

    const duration = this.options.getDurationSeconds()
    if (
      !duration ||
      duration < MIN_COUNTABLE_DURATION_SECONDS ||
      duration > MAX_COUNTABLE_DURATION_SECONDS
    ) {
      return
    }

    if (session.realPlayedSeconds >= duration * PLAY_COUNT_THRESHOLD_RATIO) {
      this.record(session)
    }
  }

  private clearSeekFallback(): void {
    if (!this.seekFallbackTimer) return
    clearTimeout(this.seekFallbackTimer)
    this.seekFallbackTimer = null
  }

  private record(session: EffectivePlaySession): void {
    if (session.counted || session.countInFlight) return
    session.countInFlight = true

    void this.options
      .recordEffectivePlay({
        trackId: session.trackId,
        sessionId: session.sessionId,
        playedAtIso: new Date(this.epochNow()).toISOString(),
      })
      .then((result) => {
        if (result.ok) session.counted = true
      })
      .catch((error: unknown) => {
        this.options.onRecordError?.(error)
      })
      .finally(() => {
        session.countInFlight = false
      })
  }
}
