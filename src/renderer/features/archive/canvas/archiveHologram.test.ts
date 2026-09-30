import { describe, expect, it } from 'vitest'
import { hologramFrame } from './archiveHologram.js'

describe('archive hologram timing', () => {
  it('reveals upward with distortion, then flashes only after the cover is complete', () => {
    expect(hologramFrame(0).scan).toBe(512)
    const middle = hologramFrame(576)
    expect(middle.scan).toBeGreaterThan(0)
    expect(middle.scan).toBeLessThan(512)
    expect(middle.distortion).toBeGreaterThan(0)
    expect(middle.flash).toBe(0)
    expect(hologramFrame(1200)).toMatchObject({ scan: 0, distortion: 0, flash: 0 })
    expect(hologramFrame(1360)).toMatchObject({ scan: 0, distortion: 0, flash: 1 })
    expect(hologramFrame(1500)).toMatchObject({ scan: 0, distortion: 0, flash: 0, active: false })
  })
})
