import { BassEnvelope } from '@shared/audio/bassEnvelope'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'

export type CdVibrationStyle = 'smooth' | 'elastic'
export const CD_VIBRATION_MAX_PX = 6
const STALE_FRAME_MS = 300

/** User-approved normal motion: shared amplitude, two ways of returning to rest. */
export function createCdVibrationMotion(
  paint: (offset: number) => void,
  style: () => CdVibrationStyle = () => 'smooth',
) {
  const envelope = new BassEnvelope()
  let animation = 0
  let lastAt = 0
  let frameAt = 0
  let observedTime: number | null = null
  let spring = 0,
    velocity = 0
  let amplitude = 0
  let epoch = -1
  let trackId: number | null = null

  function stop(): void {
    if (animation) cancelAnimationFrame(animation)
    animation = lastAt = amplitude = spring = velocity = 0
    observedTime = null
    envelope.reset()
    paint(0)
  }

  function tick(now: number): void {
    animation = 0
    if (now - frameAt > STALE_FRAME_MS) {
      stop()
      return
    }
    const dt = Math.min(0.05, lastAt ? (now - lastAt) / 1000 : 1 / 60)
    const value = envelope.update(amplitude, dt)
    lastAt = now
    const steps = Math.max(1, Math.ceil(dt * 120)),
      step = dt / steps
    for (let i = 0; i < steps; i++) {
      velocity += ((value - spring) * 625 - 30 * velocity) * step
      spring += velocity * step
    }
    paint(
      CD_VIBRATION_MAX_PX * (style() === 'elastic' ? Math.max(-0.12, Math.min(1, spring)) : value),
    )
    if (amplitude > 0 || value > 0 || Math.abs(spring) > 0.001)
      animation = requestAnimationFrame(tick)
    else paint(0)
  }

  function receive(frame: PlaybackSpectrumFrame): void {
    if (frame.status !== 'ready') {
      stop()
      return
    }
    if (epoch !== frame.epoch || trackId !== frame.trackId) stop()
    if (trackId !== frame.trackId && frame.trackId !== null) envelope.useTrack(frame.trackId)
    epoch = frame.epoch
    trackId = frame.trackId
    // Discard numerical leakage and inaudibly small tails, not kick onsets.
    amplitude = Number.isFinite(frame.bass) && frame.bass > 0.00025 ? Math.min(1, frame.bass) : 0
    frameAt = performance.now()
    if (observedTime !== frame.currentTime) {
      envelope.observe(
        amplitude,
        observedTime === null ? 1 / 30 : Math.abs(frame.currentTime - observedTime),
      )
      observedTime = frame.currentTime
    }
    if (!animation && (amplitude > 0 || envelope.value > 0)) {
      lastAt = 0
      animation = requestAnimationFrame(tick)
    }
  }

  return { receive, stop }
}
