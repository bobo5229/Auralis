import { describe, expect, it } from 'vitest'
import {
  getSplashBrandCharFrame,
  getSplashMotionFrame,
  SPLASH_FORMATION_MS,
  SPLASH_RESONANCE_PATH,
} from './splashMotion'

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
    expect(getSplashBrandCharFrame(604, 1)).toEqual(first)
    expect(getSplashBrandCharFrame(720, 0)).toEqual({ opacity: 1, offset: 0, accentPercent: 0 })
  })

  it('lets only the final s overshoot gently and settle continuously with the logo', () => {
    expect(getSplashBrandCharFrame(704, 6).offset).toBeCloseTo(7)
    expect(getSplashBrandCharFrame(740, 6).offset).toBeGreaterThan(0)
    const overshoot = getSplashBrandCharFrame(810, 6).offset
    expect(overshoot).toBeLessThan(-0.8)
    expect(overshoot).toBeGreaterThan(-1.2)
    expect(getSplashBrandCharFrame(870, 6).offset).toBeGreaterThan(overshoot)
    expect(getSplashBrandCharFrame(899, 6).offset).toBeLessThan(0)
    expect(getSplashBrandCharFrame(899, 6).offset).toBeGreaterThan(-0.001)
    expect(getSplashBrandCharFrame(900, 6).offset).toBe(0)
    for (let ms = 560; ms <= SPLASH_FORMATION_MS; ms += 10) {
      for (let index = 0; index < 6; index += 1) {
        expect(getSplashBrandCharFrame(ms, index).offset).toBeGreaterThanOrEqual(0)
      }
    }
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
