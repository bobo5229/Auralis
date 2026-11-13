import { createReducedMotionQuery, type MotionQuery } from '@renderer/shared/animation/motionPreference'

const RADIUS = 3.5
const DURATION = 420
const STEP_DELAY = 48
const RISE = 0.4
const AMPLITUDE = 0.32
const BRAKE_DURATION = 48

interface MotionPoint {
  scale: number
  velocity: number
}
interface Segment {
  start: number
  end: number
  from: MotionPoint
  to: MotionPoint
}
interface DotMotion {
  animation: Animation
  segments: Segment[]
}
const rest = (): MotionPoint => ({ scale: 1, velocity: 0 })
const bound = (scale: number) => Math.max(1, Math.min(1 + AMPLITUDE, scale))

function pointAt(segments: Segment[], time: number): MotionPoint {
  const segment = segments.find(part => time >= part.start && time <= part.end)
  if (!segment) return rest()
  const duration = segment.end - segment.start
  const u = (time - segment.start) / duration
  const u2 = u * u, u3 = u2 * u
  const { from, to } = segment
  return {
    scale: bound((2 * u3 - 3 * u2 + 1) * from.scale + (u3 - 2 * u2 + u) * duration * from.velocity
      + (-2 * u3 + 3 * u2) * to.scale + (u3 - u2) * duration * to.velocity),
    velocity: ((6 * u2 - 6 * u) * from.scale + (3 * u2 - 4 * u + 1) * duration * from.velocity
      + (-6 * u2 + 6 * u) * to.scale + (3 * u2 - 2 * u) * duration * to.velocity) / duration,
  }
}

/** Preserve the old trajectory until arrival, then merge the new impulse without reversing velocity. */
function mergeWave(previous: Segment[], time: number, arrival: number, strength: number): Segment[] {
  const segments: Segment[] = []
  for (const part of previous) {
    const start = Math.max(time, part.start), end = Math.min(arrival, part.end)
    if (end > start) segments.push({ start, end, from: pointAt([part], start), to: pointAt([part], end) })
  }
  const prefixEnd = segments.at(-1)?.end ?? time
  if (prefixEnd < arrival) segments.push({ start: prefixEnd, end: arrival, from: rest(), to: rest() })
  const current = pointAt(previous, arrival)
  const velocity = current.velocity
  const room = velocity >= 0 ? 1 + AMPLITUDE - current.scale : current.scale - 1
  // A short braking segment preserves momentum; its control points stay inside the scale limits.
  const braking = Math.abs(velocity) > 1e-8 ? Math.min(BRAKE_DURATION, 2 * room / Math.abs(velocity)) : 0
  const turn = { scale: bound(current.scale + velocity * braking / 2), velocity: 0 }
  if (braking > 0) segments.push({ start: arrival, end: arrival + braking, from: current, to: turn })
  const peak = { scale: turn.scale + (1 + AMPLITUDE - turn.scale) * strength, velocity: 0 }
  segments.push({ start: arrival + braking, end: arrival + RISE * DURATION, from: turn, to: peak })
  segments.push({ start: arrival + RISE * DURATION, end: arrival + DURATION, from: peak, to: rest() })
  return segments
}

/** Cubic endpoint slopes reproduce each segment in WAAPI, without dense sampling or per-frame JS. */
function waveFrames(segments: Segment[], start: number, end: number): Keyframe[] {
  const frames = segments.map(part => {
    const delta = part.to.scale - part.from.scale
    const duration = part.end - part.start
    const outgoing = Math.abs(delta) > 1e-9
      ? (bound(part.from.scale + part.from.velocity * duration / 3) - part.from.scale) / delta : 0
    const incoming = Math.abs(delta) > 1e-9
      ? (bound(part.to.scale - part.to.velocity * duration / 3) - part.from.scale) / delta : 1
    return {
      offset: (part.start - start) / (end - start),
      transform: `scale(${part.from.scale})`,
      easing: `cubic-bezier(0.333333, ${outgoing}, 0.666667, ${incoming})`,
    }
  })
  frames.push({ offset: 1, transform: 'scale(1)', easing: 'linear' })
  return frames
}

export function createHeatmapRipple(
  root: HTMLElement,
  motion: MotionQuery = createReducedMotionQuery(),
  now: () => number = () => {
    const time = document.timeline.currentTime
    return typeof time === 'number' ? time : performance.now()
  },
) {
  const animations = new Map<HTMLElement, DotMotion>()
  const positions = new Map<HTMLElement, { column: number; row: number }>()
  let dots: (HTMLElement | null)[][] = []
  let disposed = false

  function reset(): void {
    for (const { animation } of animations.values()) animation.cancel()
    animations.clear()
    root.removeAttribute('data-rippling')
  }

  function refresh(): void {
    reset()
    positions.clear()
    if (disposed) return
    dots = Array.from(root.querySelectorAll('.heatmap-week'), (week, column) =>
      Array.from(week.children, (cell, row) => {
        const dot = cell.querySelector<HTMLElement>('.heatmap-dot')
        if (dot) positions.set(cell as HTMLElement, { column, row })
        return dot
      }),
    )
  }

  function trigger(cell: HTMLElement): void {
    const origin = positions.get(cell)
    if (disposed || motion.matches || !origin) return
    const time = now()
    if (!animations.size) root.setAttribute('data-rippling', '')
    const reach = Math.ceil(RADIUS)
    for (let column = Math.max(0, origin.column - reach); column <= origin.column + reach; column++) {
      const week = dots[column]
      if (!week) continue
      for (let row = Math.max(0, origin.row - reach); row <= Math.min(6, origin.row + reach); row++) {
        const distance = Math.hypot(column - origin.column, row - origin.row)
        const dot = week[row]
        if (distance > RADIUS || !dot) continue
        const previous = animations.get(dot)
        const arrival = time + distance * STEP_DELAY
        const strength = 1 - distance / (RADIUS + 1)
        const segments = mergeWave(previous?.segments ?? [], time, arrival, strength)
        const end = arrival + DURATION
        const frames = waveFrames(segments, time, end)
        const timing = { duration: end - time, easing: 'linear' }
        const animation = previous?.animation ?? dot.animate(frames, timing)
        if (previous) {
          const effect = animation.effect as KeyframeEffect
          effect.setKeyframes(frames)
          effect.updateTiming(timing)
        }
        // Keep the native animation and its layer alive, on the same document clock.
        animation.startTime = time
        animations.set(dot, { animation, segments })
        animation.onfinish = () => {
          if (animation.playState !== 'finished') return
          if (animations.get(dot)?.animation === animation) animations.delete(dot)
          if (!animations.size) root.removeAttribute('data-rippling')
          animation.cancel()
        }
      }
    }
  }

  const motionChanged = () => { if (motion.matches) reset() }
  motion.addEventListener('change', motionChanged)
  refresh()
  return {
    trigger,
    reset,
    refresh,
    dispose(): void {
      disposed = true
      reset()
      dots = []
      positions.clear()
      motion.removeEventListener('change', motionChanged)
    },
  }
}
