import { describe, expect, it } from 'vitest'
import { getMiniPopoverRegionHeight, resolveMiniPopoverStyle } from './miniPlayerPopoverContract'

describe('miniPlayerPopoverContract', () => {
  it('maps each surface to its native window region height', () => {
    expect(getMiniPopoverRegionHeight(null)).toBe(0)
    expect(getMiniPopoverRegionHeight('queue')).toBe(310)
    expect(getMiniPopoverRegionHeight('mode')).toBe(230)
    expect(getMiniPopoverRegionHeight('volume')).toBe(230)
  })

  it('keeps queue, mode, and volume geometry distinct', () => {
    expect(resolveMiniPopoverStyle('queue', 320, 310)).toMatchObject({
      width: '320px',
      height: '300px',
      maxHeight: '300px',
    })
    expect(resolveMiniPopoverStyle('mode', 320, 230)).toMatchObject({
      width: '160px',
      maxHeight: '220px',
      alignSelf: 'center',
    })
    expect(resolveMiniPopoverStyle('volume', 320, 230)).toMatchObject({
      width: '92px',
      height: '220px',
      alignSelf: 'flex-end',
    })
  })
})
