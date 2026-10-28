const PLAY_COUNT_THRESHOLD_RATIO = 0.55
const PLAY_COUNT_TICK_MS = 1000
const MAX_REALTIME_DELTA_SECONDS = 2.5
const MIN_COUNTABLE_DURATION_SECONDS = 5
const MAX_COUNTABLE_DURATION_SECONDS = 24 * 60 * 60
const SEEK_FALLBACK_MS = 300
const RECORD_RETRY_BASE_MS = 1000
const RECORD_RETRY_MAX_MS = 30_000

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
  durationSeconds: number | null
  isPlaying: boolean
  counted: boolean
}

interface PendingEffectivePlay {
  payload: EffectivePlayPayload
  inFlight: boolean
  attempts: number
  nextAttemptAt: number
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
  private disposed = false
  private readonly pendingRecords = new Map<string, PendingEffectivePlay>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: EffectivePlayTrackerOptions) {
    this.monotonicNow = options.monotonicNow ?? (() => performance.now())
    this.epochNow = options.epochNow ?? (() => Date.now())
    this.randomToken = options.randomToken ?? (() => Math.random().toString(36).slice(2))
  }

  start(trackId: number): void {
    if (this.disposed) return
    this.end()
    const now = this.monotonicNow()
    this.session = {
      sessionId: `${trackId}-${this.epochNow()}-${this.randomToken()}`,
      trackId,
      lastSampleAt: now,
      realPlayedSeconds: 0,
      durationSeconds: this.readDuration(),
      isPlaying: this.options.isPlaybackCountable(trackId),
      counted: false,
    }
    this.sampleTimer = setInterval(() => this.sample(), PLAY_COUNT_TICK_MS)
  }

  end(): void {
    // The backend may already expose the next track (or idle). Use the old
    // session's duration and playback state to settle its final interval.
    if (this.session) this.accumulate(this.session)
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
    }
    this.clearSeekFallback()
    this.seeking = false
    this.buffering = false
    this.session = null
  }

  hasSession(trackId: number): boolean {
    return this.session?.trackId === trackId
  }

  setPlaying(isPlaying: boolean): void {
    const session = this.session
    if (!session || session.isPlaying === isPlaying) return
    this.accumulate(session)
    session.isPlaying = isPlaying
  }

  updateDuration(): void {
    const session = this.session
    if (!session) return
    const duration = this.readDuration()
    if (duration !== null) session.durationSeconds = duration
    this.checkThreshold(session)
  }

  setBuffering(buffering: boolean): void {
    if (this.buffering === buffering) return
    if (this.session) this.accumulate(this.session)
    this.buffering = buffering
  }

  beginSeekingWithFallback(): void {
    if (this.disposed) return
    if (this.session) this.accumulate(this.session)
    this.seeking = true
    this.clearSeekFallback()
    this.seekFallbackTimer = setTimeout(() => {
      if (this.session) this.accumulate(this.session)
      this.seeking = false
      this.seekFallbackTimer = null
    }, SEEK_FALLBACK_MS)
  }

  endSeeking(): void {
    this.clearSeekFallback()
    if (this.session) this.accumulate(this.session)
    this.seeking = false
  }

  sample(): void {
    if (this.disposed) return
    const session = this.session
    if (session && !session.counted) {
      this.updateDuration()
      this.accumulate(session, this.options.isPlaybackCountable(session.trackId))
    }
    this.retryPendingRecords()
  }

  private accumulate(session: EffectivePlaySession, hasCurrentData = true): void {
    const now = this.monotonicNow()
    if (
      !session.counted &&
      session.isPlaying &&
      hasCurrentData &&
      !this.buffering &&
      !this.seeking
    ) {
      const deltaSeconds = Math.max(
        0,
        Math.min((now - session.lastSampleAt) / 1000, MAX_REALTIME_DELTA_SECONDS),
      )
      session.realPlayedSeconds += deltaSeconds
    }
    session.lastSampleAt = now

    this.checkThreshold(session)
  }

  private readDuration(): number | null {
    const duration = this.options.getDurationSeconds()
    if (
      duration === null ||
      !Number.isFinite(duration) ||
      duration < MIN_COUNTABLE_DURATION_SECONDS ||
      duration > MAX_COUNTABLE_DURATION_SECONDS
    ) {
      return null
    }
    return duration
  }

  private checkThreshold(session: EffectivePlaySession): void {
    const duration = session.durationSeconds
    if (session.counted || duration === null) return
    // Avoid delaying an exact 55% boundary because of floating-point rounding.
    if (session.realPlayedSeconds + 1e-9 < duration * PLAY_COUNT_THRESHOLD_RATIO) return

    session.counted = true
    const pending: PendingEffectivePlay = {
      payload: {
        trackId: session.trackId,
        sessionId: session.sessionId,
        playedAtIso: new Date(this.epochNow()).toISOString(),
      },
      inFlight: false,
      attempts: 0,
      nextAttemptAt: this.monotonicNow(),
    }
    this.pendingRecords.set(session.sessionId, pending)
    void this.persist(pending)
  }

  private clearSeekFallback(): void {
    if (!this.seekFallbackTimer) return
    clearTimeout(this.seekFallbackTimer)
    this.seekFallbackTimer = null
  }

  private async persist(pending: PendingEffectivePlay): Promise<void> {
    if (this.disposed || pending.inFlight) return
    pending.inFlight = true
    pending.attempts += 1
    try {
      const result = await this.options.recordEffectivePlay(pending.payload)
      this.pendingRecords.delete(pending.payload.sessionId)
      // Main returns ok:false for invalid input or a deleted track. Only
      // transport/database exceptions are transient and should be retried.
      if (!result.ok) this.options.onRecordError?.(new Error('Effective play record was rejected'))
    } catch (error: unknown) {
      this.options.onRecordError?.(error)
    } finally {
      pending.inFlight = false
      pending.nextAttemptAt =
        this.monotonicNow() +
        Math.min(RECORD_RETRY_BASE_MS * 2 ** Math.min(pending.attempts - 1, 5), RECORD_RETRY_MAX_MS)
      this.scheduleRetry()
    }
  }

  private retryPendingRecords(): void {
    const now = this.monotonicNow()
    for (const pending of this.pendingRecords.values()) {
      if (!pending.inFlight && pending.nextAttemptAt <= now) void this.persist(pending)
    }
    this.scheduleRetry()
  }

  discardPendingRecords(): void {
    this.pendingRecords.clear()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    if (this.disposed) return
    let nextAttemptAt = Infinity
    for (const pending of this.pendingRecords.values()) {
      if (!pending.inFlight) nextAttemptAt = Math.min(nextAttemptAt, pending.nextAttemptAt)
    }
    if (!Number.isFinite(nextAttemptAt)) return
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null
        this.retryPendingRecords()
      },
      Math.max(0, nextAttemptAt - this.monotonicNow()),
    )
  }

  dispose(): void {
    if (this.disposed) return
    this.end()
    this.disposed = true
    this.discardPendingRecords()
  }
}
