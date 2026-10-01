import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SPLASH_DOT_TRAVEL_MS,
  SPLASH_FADE_OUT_MS,
  easeInOutCubic,
  shouldPlaySplash,
  startSplashLifecycle,
  type SplashEnvironment,
} from './splashController'

const TOTAL_LENGTH = 100

interface Harness {
  env: SplashEnvironment
  positions: Array<{ x: number; y: number }>
  fadeCount(): number
  finishCount(): number
  setVisible(visible: boolean): void
  setAppReady(ready: boolean): void
  pumpFrames(stepMs: number): void
}

function createHarness(options?: { reducedMotion?: boolean; visible?: boolean }): Harness {
  let currentTime = 0
  let visible = options?.visible ?? false
  let appReady = false
  let pendingFrames: Array<(now: number) => void> = []

  const visibilityListeners: Array<() => void> = []
  const appReadyListeners: Array<() => void> = []
  const positions: Array<{ x: number; y: number }> = []
  let fadeCount = 0
  let finishCount = 0

  const env: SplashEnvironment = {
    isDocumentVisible: () => visible,
    isAppReady: () => appReady,
    isReducedMotion: () => options?.reducedMotion ?? false,
    onVisibilityChange: (listener) => {
      visibilityListeners.push(listener)
      return () => {
        const index = visibilityListeners.indexOf(listener)
        if (index !== -1) visibilityListeners.splice(index, 1)
      }
    },
    onAppReady: (listener) => {
      appReadyListeners.push(listener)
      return () => {
        const index = appReadyListeners.indexOf(listener)
        if (index !== -1) appReadyListeners.splice(index, 1)
      }
    },
    requestFrame: (callback) => {
      pendingFrames.push(callback)
      return () => {
        pendingFrames = pendingFrames.filter((frame) => frame !== callback)
      }
    },
    now: () => currentTime,
    getTotalLength: () => TOTAL_LENGTH,
    getPointAtLength: (length) => ({ x: length, y: 0 }),
    setDotPosition: (x, y) => {
      positions.push({ x, y })
    },
    startFadeOut: () => {
      fadeCount += 1
    },
    finishSplash: () => {
      finishCount += 1
    },
  }

  return {
    env,
    positions,
    fadeCount: () => fadeCount,
    finishCount: () => finishCount,
    setVisible(next) {
      visible = next
      for (const listener of [...visibilityListeners]) listener()
    },
    setAppReady(next) {
      appReady = next
      for (const listener of [...appReadyListeners]) listener()
    },
    pumpFrames(stepMs) {
      currentTime += stepMs
      const frames = pendingFrames
      pendingFrames = []
      for (const frame of frames) frame(currentTime)
    },
  }
}

describe('easeInOutCubic', () => {
  it('starts at zero, ends at one and slows at both ends', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    // 中段加速：0.25 处显著落后于线性进度。
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25)
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75)
  })

  it('is monotonic and clamps out-of-range input', () => {
    let previous = -1
    for (let step = 0; step <= 100; step += 1) {
      const value = easeInOutCubic(step / 100)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('shouldPlaySplash', () => {
  it('skips ordinary and cache-bypassing reloads while retaining cold navigation', () => {
    expect(shouldPlaySplash('', 'reload')).toBe(false)
    expect(shouldPlaySplash('?splash=1', 'reload')).toBe(false)
    expect(shouldPlaySplash('', 'navigate')).toBe(true)
  })
  it('plays for the first window and skips a later window', () => {
    expect(shouldPlaySplash('')).toBe(true)
    expect(shouldPlaySplash('?splash=0')).toBe(false)
  })
})

describe('startSplashLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start the dot before the window becomes visible', () => {
    const harness = createHarness()
    startSplashLifecycle(harness.env)
    harness.pumpFrames(2_000)
    expect(harness.positions).toEqual([])
  })

  it('starts timing from the first visible frame and docks at the path end', () => {
    const harness = createHarness()
    const stop = startSplashLifecycle(harness.env)
    harness.setVisible(true)

    // 前半程逐帧推进：位置严格由 easeInOutCubic(progress) 驱动，落后于线性进度。
    for (let step = 0; step < 3; step += 1) {
      harness.pumpFrames(SPLASH_DOT_TRAVEL_MS / 12)
    }
    const last = harness.positions.at(-1)!
    expect(last.x).toBeCloseTo(easeInOutCubic(0.25) * TOTAL_LENGTH, 5)
    expect(last.x).toBeLessThan(0.25 * TOTAL_LENGTH)

    harness.pumpFrames(SPLASH_DOT_TRAVEL_MS)
    expect(harness.positions.at(-1)).toEqual({ x: TOTAL_LENGTH, y: 0 })
    stop()
  })

  it('fades out only after the dot docks and the app is ready, exactly once', () => {
    const harness = createHarness({ visible: true })
    const stop = startSplashLifecycle(harness.env)

    harness.pumpFrames(SPLASH_DOT_TRAVEL_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS * 2)
    expect(harness.positions.at(-1)).toEqual({ x: TOTAL_LENGTH, y: 0 })

    harness.setAppReady(true)
    expect(harness.fadeCount()).toBe(1)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS - 1)
    expect(harness.finishCount()).toBe(0)
    vi.advanceTimersByTime(1)
    expect(harness.finishCount()).toBe(1)

    harness.setAppReady(false)
    harness.setAppReady(true)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS * 2)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('keeps the full logo when the app is ready but the dot has not docked', () => {
    const harness = createHarness({ visible: true })
    const stop = startSplashLifecycle(harness.env)
    harness.setAppReady(true)

    harness.pumpFrames(SPLASH_DOT_TRAVEL_MS / 4)
    expect(harness.finishCount()).toBe(0)

    harness.pumpFrames(SPLASH_DOT_TRAVEL_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('skips motion and fade entirely under reduced motion', () => {
    const harness = createHarness({ reducedMotion: true, visible: true })
    const stop = startSplashLifecycle(harness.env)
    expect(harness.positions).toEqual([])

    harness.setAppReady(true)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(0)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('shows a static frame before finishing when the app was already ready', () => {
    const harness = createHarness({ reducedMotion: true, visible: true })
    harness.setAppReady(true)
    const stop = startSplashLifecycle(harness.env)
    expect(harness.finishCount()).toBe(0)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(0)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('waits for a visible static frame when reduced motion app readiness arrives while hidden', () => {
    const harness = createHarness({ reducedMotion: true })
    const stop = startSplashLifecycle(harness.env)
    harness.setAppReady(true)
    harness.pumpFrames(100)
    expect(harness.finishCount()).toBe(0)
    harness.setVisible(true)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(0)
    harness.pumpFrames(16)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('ignores later signals after the returned cleanup runs', () => {
    const harness = createHarness({ visible: true })
    const stop = startSplashLifecycle(harness.env)
    stop()
    expect(harness.finishCount()).toBe(1)

    harness.setAppReady(true)
    harness.pumpFrames(SPLASH_DOT_TRAVEL_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS)
    expect(harness.finishCount()).toBe(1)
  })
})
