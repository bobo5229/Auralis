import { expect, it, vi } from 'vitest'
import type { MotionQuery } from '@renderer/shared/animation/motionPreference'
import { createHeatmapRipple } from './heatmapRipple'

function fixture() {
  let reduced = false
  let time = 0
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const motion: MotionQuery = {
    get matches() { return reduced },
    addEventListener: vi.fn((_type, listener) => { listeners.add(listener) }),
    removeEventListener: vi.fn((_type, listener) => { listeners.delete(listener) }),
  }
  const cells = Array.from({ length: 12 }, (_, column) => Array.from({ length: 7 }, (_, row) => {
    const pulses: { frames: Keyframe[]; options: KeyframeAnimationOptions; animation: { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null; playState: AnimationPlayState } }[] = []
    const dot = {
      animate: vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
        const animation = {
          cancel: vi.fn(), onfinish: null as (() => void) | null,
          playState: 'running' as AnimationPlayState,
          effect: {
            setKeyframes(next: Keyframe[]): void { frames = next },
            updateTiming(next: KeyframeAnimationOptions): void {
              options = { ...options, ...next }
              pulses.push({ frames, options, animation })
            },
          },
        }
        pulses.push({ frames, options, animation })
        return animation as unknown as Animation
      }),
    }
    const cell = { querySelector: () => column === 0 && row === 0 ? null : dot }
    return { dot, cell, pulses }
  }))
  let weeks = cells.map(column => ({ children: column.map(({ cell }) => cell) }))
  const attributes = new Set<string>()
  const root = {
    querySelectorAll: () => weeks,
    setAttribute: (name: string) => attributes.add(name),
    removeAttribute: (name: string) => attributes.delete(name),
  } as unknown as HTMLElement
  const ripple = createHeatmapRipple(root, motion, () => time)
  return {
    cells, ripple, motion,
    rippling: () => attributes.has('data-rippling'),
    advance: (milliseconds: number) => { time += milliseconds },
    trigger: (column: number, row: number) => ripple.trigger(cells[column][row].cell as unknown as HTMLElement),
    reduce() {
      reduced = true
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent)
    },
    replaceCalendar() { weeks = [] },
  }
}

function sample(pulse: ReturnType<typeof fixture>['cells'][number][number]['pulses'][number], time: number): number {
  const duration = Number(pulse.options.duration)
  const offset = time / duration
  const frames = pulse.frames
  const scale = (frame: Keyframe) => Number(String(frame.transform).slice(6, -1))
  for (let i = 1; i < frames.length; i++) {
    const left = Number(frames[i - 1].offset), right = Number(frames[i].offset)
    if (offset <= right) {
      let progress = (offset - left) / (right - left)
      const easing = frames[i - 1].easing?.match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number)
      if (easing) {
        const u = progress
        progress = 3 * (1 - u) ** 2 * u * easing[1] + 3 * (1 - u) * u ** 2 * easing[3] + u ** 3
      }
      return scale(frames[i - 1]) + (scale(frames[i]) - scale(frames[i - 1])) * progress
    }
  }
  return scale(frames.at(-1)!)
}

it('propagates in distance order, eases through its peak and returns without undershoot', () => {
  const f = fixture()
  f.trigger(6, 3)
  const pulse = (column: number, row = 3) => f.cells[column][row].pulses[0]
  expect(sample(pulse(7), 47)).toBe(1)
  expect(sample(pulse(7), 65)).toBeGreaterThan(1)
  expect(sample(pulse(8), 95)).toBe(1)
  expect(sample(pulse(8), 115)).toBeGreaterThan(1)
  expect(sample(pulse(6), 168)).toBeCloseTo(1.32, 5)
  expect(sample(pulse(7), 216)).toBeLessThan(sample(pulse(6), 168))
  expect(sample(pulse(5), 200)).toBeCloseTo(sample(pulse(7), 200), 5)
  expect(f.cells[10][3].pulses).toHaveLength(0)
  const scales = pulse(6).frames.map(frame => Number(String(frame.transform).slice(6, -1)))
  expect(Math.min(...scales)).toBe(1)
  expect(Math.max(...scales)).toBeCloseTo(1.32, 5)
  expect(pulse(6).frames.at(-1)?.transform).toBe('scale(1)')
  expect(pulse(6).options.easing).toBe('linear')
  expect(pulse(6).frames.length).toBeLessThanOrEqual(4)
  f.ripple.dispose()
})

it('merges overlapping arrivals instead of dropping the new wave on busy neighbors', () => {
  const f = fixture()
  f.trigger(6, 3)
  const before = f.cells[8][3].pulses[0]
  f.advance(100)
  f.trigger(7, 3)
  const after = f.cells[8][3].pulses[1]
  expect(before.animation.cancel).not.toHaveBeenCalled()
  expect(after.animation).toBe(before.animation)
  expect(sample(after, 0)).toBeCloseTo(sample(before, 100), 3)
  expect(sample(after, 200)).toBeGreaterThan(sample(before, 300))
  expect(f.cells[7][3].pulses).toHaveLength(2)
  after.animation.playState = 'finished'
  after.animation.onfinish?.()
  expect(after.animation.cancel).toHaveBeenCalledOnce()
  f.ripple.dispose()
})

it("retains a shrinking dot's direction when it becomes the origin again", () => {
  const f = fixture()
  f.trigger(6, 3)
  const before = f.cells[6][3].pulses[0]
  f.advance(240)
  f.trigger(6, 3)
  const after = f.cells[6][3].pulses[1]
  expect(sample(after, 0)).toBeCloseTo(sample(before, 240), 3)
  expect(sample(after, 1)).toBeLessThan(sample(after, 0))
  const previousVelocity = sample(before, 240) - sample(before, 239)
  const nextVelocity = sample(after, 1) - sample(after, 0)
  expect(Math.abs(nextVelocity - previousVelocity)).toBeLessThan(0.0003)
  f.ripple.dispose()
})

it('bounds the combined scale during rapid repeated arrivals', () => {
  const f = fixture()
  for (let i = 0; i < 50; i++) {
    f.trigger(5 + i % 3, 3)
    f.advance(8)
  }
  for (const cell of f.cells.flat()) {
    for (const pulse of cell.pulses) {
      for (const frame of pulse.frames) {
        const scale = Number(String(frame.transform).slice(6, -1))
        expect(scale).toBeGreaterThanOrEqual(1)
        expect(scale).toBeLessThanOrEqual(1.32)
      }
      // Check the native cubic control points too, so bounds hold between keyframes.
      for (let i = 0; i < pulse.frames.length - 1; i++) {
        const from = Number(String(pulse.frames[i].transform).slice(6, -1))
        const to = Number(String(pulse.frames[i + 1].transform).slice(6, -1))
        const controls = pulse.frames[i].easing!.match(/cubic-bezier\(([^)]+)\)/)![1].split(',').map(Number)
        for (const normalized of [controls[1], controls[3]]) {
          const scale = from + (to - from) * normalized
          expect(scale).toBeGreaterThanOrEqual(1 - 1e-9)
          expect(scale).toBeLessThanOrEqual(1.32 + 1e-9)
        }
      }
    }
  }
  f.ripple.dispose()
})

it('ignores calendar padding and never repeats a completed wave on its own', () => {
  const f = fixture()
  f.trigger(1, 1)
  expect(f.cells[0][0].pulses).toHaveLength(0)
  for (const cell of f.cells.flat()) {
    for (const pulse of cell.pulses) {
      pulse.animation.playState = 'finished'
      pulse.animation.onfinish?.()
    }
    expect(cell.pulses.length).toBeLessThanOrEqual(1)
  }
  f.ripple.reset()
  f.trigger(0, 0)
  expect(f.cells[0][0].pulses).toHaveLength(0)
  f.ripple.dispose()
})

it('cancels active and delayed pulses when motion is reduced and blocks new waves', () => {
  const f = fixture()
  f.trigger(6, 3)
  f.reduce()
  expect(f.cells[6][3].pulses[0].animation.cancel).toHaveBeenCalledOnce()
  expect(f.cells[8][3].pulses[0].animation.cancel).toHaveBeenCalledOnce()
  f.trigger(6, 3)
  expect(f.cells[6][3].pulses).toHaveLength(1)
  f.ripple.dispose()
  expect(f.motion.removeEventListener).toHaveBeenCalledOnce()
})

it('releases old calendar animations on refresh, reset and disposal', () => {
  const f = fixture()
  f.trigger(6, 3)
  const first = f.cells[6][3].pulses[0]
  f.ripple.reset()
  expect(first.animation.cancel).toHaveBeenCalledOnce()
  f.trigger(6, 3)
  f.replaceCalendar()
  f.ripple.refresh()
  expect(f.cells[6][3].pulses[1].animation.cancel).toHaveBeenCalledOnce()
  f.trigger(6, 3)
  f.ripple.dispose()
  f.trigger(6, 3)
  expect(f.cells[6][3].pulses).toHaveLength(2)
})

it('keeps details revealed until the last pulse finishes, and ignores a stale finish event', () => {
  const f = fixture()
  f.trigger(6, 3)
  expect(f.rippling()).toBe(true)
  f.advance(100)
  f.trigger(7, 3)
  const cell = f.cells[6][3]
  const latest = cell.pulses.at(-1)!.animation
  latest.onfinish?.()
  expect(f.rippling()).toBe(true)
  expect(latest.cancel).not.toHaveBeenCalled()
  const animations = new Set(f.cells.flat().flatMap(n => n.pulses.map(pulse => pulse.animation)))
  for (const animation of animations) {
    animation.playState = 'finished'
    animation.onfinish?.()
  }
  expect(f.rippling()).toBe(false)
  f.trigger(6, 3)
  expect(f.rippling()).toBe(true)
  f.ripple.reset()
  expect(f.rippling()).toBe(false)
  f.ripple.dispose()
})
