interface TrackRange {
  samples: number[]
  sinceEstimate: number
  reference: number
  target: number
}

/** Track-relative low-frequency envelope. Attack/release adapted from
 * Butterchurn AudioLevels (MIT, Jordan Berg), commit
 * 99e69b35d315eea03954d75b5862f4e09212338b. See THIRD_PARTY_NOTICES.md.
 */
export class BassEnvelope {
  private readonly tracks = new Map<number, TrackRange>()
  private range: TrackRange | null = null
  private average = 0
  value = 0

  useTrack(id: number): void {
    // Bound session memory while preserving recent songs across seek and replay.
    const existing = this.tracks.get(id)
    if (existing) {
      this.tracks.delete(id)
      this.tracks.set(id, existing)
    }
    if (!this.tracks.has(id)) {
      if (this.tracks.size >= 32) this.tracks.delete(this.tracks.keys().next().value!)
      this.tracks.set(id, { samples: [], sinceEstimate: 0, reference: 0.08, target: 0.08 })
    }
    this.range = this.tracks.get(id)!
    this.reset()
  }

  /** Observe audio frames, not animation frames: calibration is independent of display FPS. */
  observe(amplitude: number, seconds = 1 / 30): void {
    if (!this.range || !Number.isFinite(amplitude)) return
    const input = Math.max(0, Math.min(1, amplitude))
    const range = this.range
    if (!range.samples.length) range.reference = range.target = Math.max(0.08, input)
    range.samples.push(input)
    if (range.samples.length > 512) range.samples.shift()
    if (++range.sinceEstimate >= 12) {
      range.sinceEstimate = 0
      const sorted = [...range.samples].sort((a, b) => a - b)
      // A robust high level over roughly 20 seconds, with a quiet-passage gain floor.
      range.target = Math.max(0.08, sorted[Math.floor((sorted.length - 1) * 0.9)])
    }
    const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(0.2, seconds)) : 0
    // Gain settles quickly for a loud section, and recovers slowly for a quiet
    // one. Use audio time so an occasional delayed render cannot inflate gain.
    const tau = range.target > range.reference ? 0.15 : 10
    range.reference += (range.target - range.reference) * (1 - Math.exp(-dt / tau))
  }

  update(amplitude: number, seconds: number): number {
    const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(0.1, seconds)) : 0
    const input = Number.isFinite(amplitude) ? Math.max(0, Math.min(1, amplitude)) : 0
    const range = this.range
    const ratio = input / (range?.reference ?? 0.08)
    // Lift medium strengths while keeping quiet passages subtle. Reference
    // strength uses about 61% of travel; the smooth shoulder preserves headroom.
    const target = -Math.expm1(-0.95 * ratio ** 1.6)
    // Butterchurn AudioLevels attack/release coefficients;
    // Uses a track-relative normalization and a smooth transfer curve. MIT notice
    // and original source are recorded in THIRD_PARTY_NOTICES.md.
    const rate = (target > this.average ? 0.2 : 0.5) ** (dt * 30)
    this.average = this.average * rate + target * (1 - rate)
    this.value = this.average
    if (input === 0 && this.value < 0.0001) this.value = this.average = 0
    return this.value
  }

  /** Pause/seek clear motion while retaining this song's learned range. */
  reset(): void {
    this.value = this.average = 0
  }
}
