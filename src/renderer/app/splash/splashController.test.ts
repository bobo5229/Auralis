import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SPLASH_FADE_OUT_MS,
  shouldPlaySplash,
  startSplashLifecycle,
  type SplashEnvironment,
} from './splashController'
import { SPLASH_FORMATION_MS } from './splashMotion'

interface Harness {
  env: SplashEnvironment
  frames: number[]
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
  const frames: number[] = []
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
    renderMotion: (elapsed) => {
      frames.push(elapsed)
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
    frames,
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

  it('does not start formation before the window becomes visible', () => {
    const harness = createHarness()
    startSplashLifecycle(harness.env)
    harness.pumpFrames(2_000)
    expect(harness.frames).toEqual([])
  })

  it('starts timing when visible and finishes on the exact formation frame', () => {
    const harness = createHarness()
    const stop = startSplashLifecycle(harness.env)
    harness.setVisible(true)

    expect(harness.frames).toEqual([0])
    for (let step = 0; step < 3; step += 1) {
      harness.pumpFrames(SPLASH_FORMATION_MS / 12)
    }
    expect(harness.frames.at(-1)).toBe(SPLASH_FORMATION_MS / 4)

    harness.pumpFrames(SPLASH_FORMATION_MS)
    expect(harness.frames.at(-1)).toBe(SPLASH_FORMATION_MS)
    const frameCount = harness.frames.length
    harness.pumpFrames(500)
    expect(harness.frames).toHaveLength(frameCount)
    stop()
  })

  it('fades out only after formation and app readiness, exactly once', () => {
    const harness = createHarness({ visible: true })
    const stop = startSplashLifecycle(harness.env)

    harness.pumpFrames(SPLASH_FORMATION_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS * 2)
    expect(harness.frames.at(-1)).toBe(SPLASH_FORMATION_MS)
    expect(harness.fadeCount()).toBe(0)
    expect(harness.finishCount()).toBe(0)

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

  it('waits for formation when app readiness arrives early', () => {
    const harness = createHarness({ visible: true })
    const stop = startSplashLifecycle(harness.env)
    harness.setAppReady(true)

    harness.pumpFrames(SPLASH_FORMATION_MS / 4)
    expect(harness.fadeCount()).toBe(0)
    expect(harness.finishCount()).toBe(0)

    harness.pumpFrames(SPLASH_FORMATION_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS)
    expect(harness.finishCount()).toBe(1)
    stop()
  })

  it('skips motion and fade entirely under reduced motion', () => {
    const harness = createHarness({ reducedMotion: true, visible: true })
    const stop = startSplashLifecycle(harness.env)
    expect(harness.frames).toEqual([])

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
    harness.pumpFrames(SPLASH_FORMATION_MS)
    vi.advanceTimersByTime(SPLASH_FADE_OUT_MS)
    expect(harness.finishCount()).toBe(1)
  })
})
