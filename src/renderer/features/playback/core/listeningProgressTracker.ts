import type { ListeningProgressBatch, ListeningSample } from '@shared/types/listeningEvidence'

interface Options {
  getEpoch: () => Promise<number>
  record: (batch: ListeningProgressBatch) => Promise<{ ok: boolean; epoch: number }>
  snapshot: () => {
    trackId: number | null
    position: number
    duration: number
    playing: boolean
    hasData: boolean
  }
  onError: (error: unknown) => void
  now?: () => number
  epochNow?: () => number
}
/** Tracks elapsed listening and content coverage independently of the 55% play-count rule. */
export class ListeningProgressTracker {
  private epoch: number | null = null
  private revision = 0
  private trackId: number | null = null
  private sessionId = ''
  private sequence = 0
  private baseline: { position: number; time: number; date: number } | null = null
  private playing = false
  private buffering = false
  private seeking = false
  private samples: ListeningSample[] = []
  private queue: Array<Omit<ListeningProgressBatch, 'epoch'> & { epoch: number | null }> = []
  private timer: ReturnType<typeof setInterval> | undefined
  private retry: ReturnType<typeof setTimeout> | undefined
  private seekTimer: ReturnType<typeof setTimeout> | undefined
  private sending = false
  private disposed = false
  private readonly now: () => number
  private readonly epochNow: () => number
  constructor(private readonly options: Options) {
    this.now = options.now ?? (() => performance.now())
    this.epochNow = options.epochNow ?? (() => Date.now())
    void this.refreshEpoch()
  }
  private async refreshEpoch() {
    const owner = ++this.revision
    this.epoch = null
    try {
      const epoch = await this.options.getEpoch()
      if (this.disposed || owner !== this.revision) return
      this.epoch = epoch
      for (const batch of this.queue) if (batch.epoch === null) batch.epoch = epoch
      this.flush()
      void this.persist()
    } catch (error) {
      this.options.onError(error)
      if (!this.disposed && owner === this.revision)
        this.retry = setTimeout(() => void this.refreshEpoch(), 2000)
    }
  }
  start(trackId: number) {
    this.end()
    this.trackId = trackId
    this.sessionId = crypto.randomUUID()
    this.sequence = 0
    this.playing = this.options.snapshot().playing
    this.resetBaseline()
    this.timer = setInterval(() => this.sample(), 1000)
  }
  private resetBaseline() {
    this.baseline = {
      position: this.options.snapshot().position,
      time: this.now(),
      date: this.epochNow(),
    }
  }
  sample(terminalPosition?: number) {
    if (this.disposed || this.trackId === null) return
    const snapshot =
        terminalPosition === undefined
          ? this.options.snapshot()
          : {
              ...this.options.snapshot(),
              trackId: this.trackId,
              position: terminalPosition,
              duration: terminalPosition,
              hasData: true,
            },
      previous = this.baseline!
    const time = this.now(),
      date = this.epochNow(),
      elapsed = (time - previous.time) / 1000
    const distance = snapshot.position - previous.position
    if (
      this.playing &&
      !this.buffering &&
      !this.seeking &&
      snapshot.trackId === this.trackId &&
      snapshot.hasData &&
      snapshot.duration > 0 &&
      previous.position < snapshot.duration &&
      elapsed >= 0.001 &&
      elapsed <= 2.5 &&
      distance >= 0.001 &&
      distance <= elapsed + 0.35
    ) {
      this.samples.push({
        startedAtIso: new Date(previous.date).toISOString(),
        startSeconds: previous.position,
        endSeconds: Math.min(snapshot.position, snapshot.duration),
        playedSeconds: Math.min(elapsed, distance),
      })
    }
    this.baseline = { position: snapshot.position, time, date }
    if (this.samples.length >= 5) this.flush()
  }
  setPlaying(playing: boolean) {
    if (this.playing === playing) return
    const snapshot = this.options.snapshot()
    // Native ended publishes an idle snapshot before its onEnded callback.
    // Settle the old baseline before changing its playing state.
    if (
      !playing &&
      snapshot.trackId === null &&
      snapshot.duration > 0 &&
      snapshot.position >= snapshot.duration - 0.001
    )
      this.sample(snapshot.duration)
    else this.sample()
    this.playing = playing
    this.resetBaseline()
    if (!playing) this.flush()
  }
  setBuffering(buffering: boolean) {
    if (this.buffering === buffering) return
    this.sample()
    this.buffering = buffering
    this.resetBaseline()
    if (buffering) this.flush()
  }
  beginSeekingWithFallback() {
    this.sample()
    this.seeking = true
    this.flush()
    if (this.seekTimer) clearTimeout(this.seekTimer)
    this.seekTimer = setTimeout(() => this.endSeeking(), 300)
  }
  endSeeking() {
    if (this.seekTimer) clearTimeout(this.seekTimer)
    this.seekTimer = undefined
    this.resetBaseline()
    this.seeking = false
  }
  private flush() {
    while (this.samples.length) {
      this.queue.push({
        epoch: this.epoch,
        sessionId: this.sessionId,
        sequence: ++this.sequence,
        trackId: this.trackId!,
        samples: this.samples.splice(0, 32),
      })
    }
    void this.persist()
  }
  private async persist() {
    const pending = this.queue[0]
    if (this.sending || !pending || pending.epoch === null || this.disposed) return
    this.sending = true
    const revision = this.revision,
      batch: ListeningProgressBatch = { ...pending, epoch: pending.epoch }
    try {
      const result = await this.options.record(batch)
      if (revision !== this.revision) return
      if (result.epoch !== this.epoch) {
        this.discardPendingRecords()
        return
      }
      this.queue.shift()
      if (!result.ok) this.options.onError(new Error('Listening evidence was rejected'))
    } catch (error) {
      this.options.onError(error)
      if (!this.disposed && revision === this.revision)
        this.retry = setTimeout(() => {
          this.retry = undefined
          void this.persist()
        }, 2000)
      return
    } finally {
      this.sending = false
      if (revision !== this.revision) void this.persist()
    }
    if (!this.disposed) void this.persist()
  }
  finish(duration: number) {
    this.sample(duration)
    this.end()
  }
  end() {
    if (this.trackId !== null) {
      this.sample()
      this.flush()
    }
    if (this.timer) clearInterval(this.timer)
    if (this.seekTimer) clearTimeout(this.seekTimer)
    this.timer = this.seekTimer = undefined
    this.trackId = null
    this.samples = []
    this.baseline = null
    this.buffering = this.seeking = false
  }
  discardPendingRecords() {
    this.queue = []
    this.samples = []
    if (this.retry) clearTimeout(this.retry)
    this.retry = undefined
    this.resetBaseline()
    void this.refreshEpoch()
  }
  dispose() {
    this.end()
    this.disposed = true
    this.revision++
    if (this.retry) clearTimeout(this.retry)
    this.queue = []
  }
}
