import { describe, expect, it } from 'vitest'
import { cdPlaybackWavePath, cdPlaybackWaveRadius, cdPlaybackWaveSeed } from './cdPlaybackWave'

describe('CD playback wave', () => {
  it('keeps most peaks restrained while retaining local high-energy regions', () => {
    const seed = cdPlaybackWaveSeed('album-key')
    const offsets = Array.from({ length: 720 }, (_, index) =>
      Math.abs(cdPlaybackWaveRadius((index / 720) * Math.PI * 2, seed) - 216),
    ).sort((left, right) => left - right)

    expect(offsets[Math.floor(offsets.length * 0.5)]).toBeLessThan(5)
    expect(offsets.at(-1)).toBeGreaterThan(12)
  })

  it('changes local radii during playback without changing path topology', () => {
    const seed = cdPlaybackWaveSeed('another-album')
    const still = cdPlaybackWavePath(seed)
    const moving = cdPlaybackWavePath(seed, 0.37, true)

    expect(moving).not.toBe(still)
    expect(moving.split('L')).toHaveLength(still.split('L').length)
    expect(cdPlaybackWaveSeed('another-album')).toBe(seed)
  })

  it('keeps inward troughs clear of the disc throughout playback', () => {
    let minimum = Infinity
    for (const seed of [0, 0.17, 0.43, 0.76, 1]) {
      for (let frame = 0; frame < 60; frame++) {
        for (let sample = 0; sample < 720; sample++) {
          const radius = cdPlaybackWaveRadius(
            (sample / 720) * Math.PI * 2,
            seed,
            frame * 0.137,
            frame !== 0,
          )
          minimum = Math.min(minimum, radius)
        }
      }
    }
    // Includes the inward half of the rendered stroke, not just its centreline.
    expect(minimum - 1.5 / 2 - 200).toBeGreaterThanOrEqual(7)
  })
})
