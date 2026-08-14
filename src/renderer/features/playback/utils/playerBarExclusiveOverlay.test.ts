import { describe, expect, it } from 'vitest'
import { MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX } from './modernPlayerBarLayout'
import {
  activatePlayerBarVolumeOverlay,
  countOpenPlayerBarOverlays,
  isPlayerBarVolumeOverlayRetreatActive,
  MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX,
  PLAYER_BAR_OVERLAYS_CLOSED,
  resolveVolumeHoverOverlayFlags,
  togglePlayerBarExclusiveOverlay,
  type PlayerBarOverlayFlags,
} from './playerBarExclusiveOverlay'

function flags(partial: Partial<PlayerBarOverlayFlags>): PlayerBarOverlayFlags {
  return { ...PLAYER_BAR_OVERLAYS_CLOSED, ...partial }
}

describe('togglePlayerBarExclusiveOverlay', () => {
  it('opens exactly one overlay from a closed bar', () => {
    const next = togglePlayerBarExclusiveOverlay(PLAYER_BAR_OVERLAYS_CLOSED, 'queue')
    expect(next).toEqual(flags({ queue: true }))
    expect(countOpenPlayerBarOverlays(next)).toBe(1)
  })

  it('closes the active overlay when toggled again', () => {
    expect(togglePlayerBarExclusiveOverlay(flags({ overflow: true }), 'overflow')).toEqual(
      PLAYER_BAR_OVERLAYS_CLOSED,
    )
  })

  it('opening queue dismisses mode, overflow, and volume', () => {
    const next = togglePlayerBarExclusiveOverlay(
      flags({ mode: true, overflow: true, volume: true }),
      'queue',
    )
    expect(next).toEqual(flags({ queue: true }))
    expect(countOpenPlayerBarOverlays(next)).toBe(1)
  })

  it('opening mode dismisses overflow so the two panels cannot stack', () => {
    const next = togglePlayerBarExclusiveOverlay(flags({ overflow: true }), 'mode')
    expect(next.mode).toBe(true)
    expect(next.overflow).toBe(false)
    expect(next.queue).toBe(false)
    expect(next.volume).toBe(false)
  })

  it('opening overflow dismisses queue and mode', () => {
    const next = togglePlayerBarExclusiveOverlay(flags({ queue: true, mode: true }), 'overflow')
    expect(next).toEqual(flags({ overflow: true }))
  })
})

describe('activatePlayerBarVolumeOverlay', () => {
  it('leaves only volume open', () => {
    const next = activatePlayerBarVolumeOverlay()
    expect(next).toEqual(flags({ volume: true }))
    expect(countOpenPlayerBarOverlays(next)).toBe(1)
  })
})

describe('isPlayerBarVolumeOverlayRetreatActive', () => {
  it('follows the modern island 800px collapse', () => {
    expect(
      isPlayerBarVolumeOverlayRetreatActive({
        presentation: 'modern',
        surfaceInlineSizePx: MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX,
      }),
    ).toBe(true)
    expect(
      isPlayerBarVolumeOverlayRetreatActive({
        presentation: 'modern',
        surfaceInlineSizePx: MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX + 1,
      }),
    ).toBe(false)
  })

  it('follows the manuscript 760px collapse', () => {
    expect(MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX).toBe(760)
    expect(
      isPlayerBarVolumeOverlayRetreatActive({
        presentation: 'manuscript',
        surfaceInlineSizePx: MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX,
      }),
    ).toBe(true)
    expect(
      isPlayerBarVolumeOverlayRetreatActive({
        presentation: 'manuscript',
        surfaceInlineSizePx: MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX + 1,
      }),
    ).toBe(false)
  })
})

describe('resolveVolumeHoverOverlayFlags', () => {
  it('keeps queue and mode open when the inline slider is still visible', () => {
    const current = flags({ queue: true, mode: false })
    expect(resolveVolumeHoverOverlayFlags(current, false)).toEqual(current)
  })

  it('dismisses other overlays when the volume overlay is the active control', () => {
    expect(resolveVolumeHoverOverlayFlags(flags({ queue: true, overflow: true }), true)).toEqual(
      flags({ volume: true }),
    )
  })
})
