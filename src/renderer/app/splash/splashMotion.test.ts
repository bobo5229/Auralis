import { describe, expect, it } from 'vitest'
import {
  getSplashBrandCharFrame,
  getSplashMotionFrame,
  getSplashPlaceboCompletion,
  getSplashPlaceboProgress,
  SPLASH_FORMATION_MS,
  SPLASH_RESONANCE_PATH,
} from './splashMotion'

describe('placebo progress', () => {
  it('advances along the demo curve without claiming completion before readiness', () => {
    expect(getSplashPlaceboProgress(-10)).toBe(0)
    expect(getSplashPlaceboProgress(0)).toBe(0)
    expect(getSplashPlaceboProgress(300)).toBeCloseTo(0.32)
    expect(getSplashPlaceboProgress(900)).toBeCloseTo(0.78)
    expect(getSplashPlaceboProgress(1_200)).toBeCloseTo(0.92)
    expect(getSplashPlaceboProgress(60_000)).toBeCloseTo(0.92)
    expect(getSplashPlaceboCompletion(0, 0.78)).toBe(0.78)
    expect(getSplashPlaceboCompletion(80, 0.78)).toBe(1)
  })
})

describe('one sound forms Auralis', () => {
  it('reveals the sound before the letter and the wordmark', () => {
    const beginning = getSplashMotionFrame(0)
    expect(beginning.waveOpacity).toBe(0)
    expect(beginning.legProgress).toBe(0)
    expect(getSplashBrandCharFrame(0, 0).opacity).toBe(0)
    const sound = getSplashMotionFrame(180)
    expect(sound.waveOpacity).toBe(1)
    expect(sound.legProgress).toBe(0)
    expect(getSplashBrandCharFrame(180, 0).opacity).toBe(0)
    const forming = getSplashMotionFrame(420)
    expect(forming.legProgress).toBeGreaterThan(0)
    expect(forming.legProgress).toBeLessThan(1)
    expect(forming.joined).toBe(false)
    expect(getSplashBrandCharFrame(420, 0).opacity).toBe(0)
  })

  it('joins the letter, settles the sound and returns to the exact source mark', () => {
    expect(getSplashMotionFrame(620).joined).toBe(true)
    expect(getSplashMotionFrame(680).wavePath).not.toBe(getSplashMotionFrame(620).wavePath)
    expect(getSplashMotionFrame(SPLASH_FORMATION_MS)).toEqual({
      wavePath: SPLASH_RESONANCE_PATH,
      waveOpacity: 1,
      legProgress: 1,
      joined: true,
    })
  })

  it('clamps before the beginning and stays still after completion', () => {
    expect(getSplashMotionFrame(-200)).toEqual(getSplashMotionFrame(0))
    expect(getSplashMotionFrame(2_000)).toEqual(getSplashMotionFrame(SPLASH_FORMATION_MS))
  })
})

describe('brand resonance cascade', () => {
  it('reveals letters from left to right with a theme accent echo', () => {
    expect(getSplashBrandCharFrame(560, 0)).toEqual({ opacity: 0, offset: 7, accentPercent: 0 })
    const first = getSplashBrandCharFrame(580, 0)
    expect(first.opacity).toBeGreaterThan(0)
    expect(first.offset).toBeGreaterThan(0)
    expect(first.offset).toBeLessThan(7)
    expect(first.accentPercent).toBeGreaterThan(0)
    expect(getSplashBrandCharFrame(580, 1).opacity).toBe(0)
    expect(getSplashBrandCharFrame(612, 1)).toEqual(first)
    expect(getSplashBrandCharFrame(720, 0)).toEqual({ opacity: 1, offset: 0, accentPercent: 0 })
  })

  it('leaves every letter fully visible and still at formation completion', () => {
    for (let index = 0; index < 7; index += 1) {
      expect(getSplashBrandCharFrame(-200, index)).toEqual({
        opacity: 0,
        offset: 7,
        accentPercent: 0,
      })
      expect(getSplashBrandCharFrame(SPLASH_FORMATION_MS, index)).toEqual({
        opacity: 1,
        offset: 0,
        accentPercent: 0,
      })
      expect(getSplashBrandCharFrame(2_000, index)).toEqual(
        getSplashBrandCharFrame(SPLASH_FORMATION_MS, index),
      )
    }
  })
})
