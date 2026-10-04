import { describe, expect, it } from 'vitest'
import { getSplashMotionFrame, SPLASH_FORMATION_MS, SPLASH_RESONANCE_PATH } from './splashMotion'

describe('one sound forms Auralis', () => {
  it('reveals the sound before the letter and the wordmark', () => {
    const beginning = getSplashMotionFrame(0)
    expect(beginning.waveOpacity).toBe(0)
    expect(beginning.legProgress).toBe(0)
    expect(beginning.brandOpacity).toBe(0)
    const sound = getSplashMotionFrame(180)
    expect(sound.waveOpacity).toBe(1)
    expect(sound.legProgress).toBe(0)
    expect(sound.brandOpacity).toBe(0)
    const forming = getSplashMotionFrame(420)
    expect(forming.legProgress).toBeGreaterThan(0)
    expect(forming.legProgress).toBeLessThan(1)
    expect(forming.joined).toBe(false)
    expect(forming.brandOpacity).toBe(0)
  })

  it('joins the letter, settles the sound and returns to the exact source mark', () => {
    expect(getSplashMotionFrame(620).joined).toBe(true)
    expect(getSplashMotionFrame(680).wavePath).not.toBe(getSplashMotionFrame(620).wavePath)
    expect(getSplashMotionFrame(SPLASH_FORMATION_MS)).toEqual({
      wavePath: SPLASH_RESONANCE_PATH,
      waveOpacity: 1,
      legProgress: 1,
      joined: true,
      brandOpacity: 1,
      brandOffset: 0,
    })
  })

  it('clamps before the beginning and stays still after completion', () => {
    expect(getSplashMotionFrame(-200)).toEqual(getSplashMotionFrame(0))
    expect(getSplashMotionFrame(2_000)).toEqual(getSplashMotionFrame(SPLASH_FORMATION_MS))
  })
})
