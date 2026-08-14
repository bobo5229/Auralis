import { shouldCollapseModernInlineVolume } from './modernPlayerBarLayout'

export type PlayerBarExclusiveOverlay = 'queue' | 'mode' | 'overflow' | 'volume'

/** Matches `@container manuscript-player-bar (max-width: 760px)`. */
export const MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX = 760

export interface PlayerBarOverlayFlags {
  queue: boolean
  mode: boolean
  overflow: boolean
  volume: boolean
}

export const PLAYER_BAR_OVERLAYS_CLOSED: PlayerBarOverlayFlags = {
  queue: false,
  mode: false,
  overflow: false,
  volume: false,
}

function only(target: PlayerBarExclusiveOverlay): PlayerBarOverlayFlags {
  return {
    queue: target === 'queue',
    mode: target === 'mode',
    overflow: target === 'overflow',
    volume: target === 'volume',
  }
}

/**
 * Queue, mode, overflow, and volume overlays are mutually exclusive.
 * Toggling an already-open target closes every overlay.
 */
export function togglePlayerBarExclusiveOverlay(
  current: PlayerBarOverlayFlags,
  target: Exclude<PlayerBarExclusiveOverlay, 'volume'>,
): PlayerBarOverlayFlags {
  if (current[target]) {
    return { ...PLAYER_BAR_OVERLAYS_CLOSED }
  }
  return only(target)
}

/** Opening the volume overlay dismisses queue, mode, and overflow. */
export function activatePlayerBarVolumeOverlay(): PlayerBarOverlayFlags {
  return only('volume')
}

export function isPlayerBarVolumeOverlayRetreatActive(input: {
  presentation: 'modern' | 'manuscript'
  surfaceInlineSizePx: number
}): boolean {
  if (input.presentation === 'modern') {
    return shouldCollapseModernInlineVolume(input.surfaceInlineSizePx)
  }
  return input.surfaceInlineSizePx <= MANUSCRIPT_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX
}

/**
 * Hovering the always-visible volume group only steals exclusivity when the
 * upward overlay is actually the active control (inline slider collapsed).
 */
export function resolveVolumeHoverOverlayFlags(
  current: PlayerBarOverlayFlags,
  overlayRetreatActive: boolean,
): PlayerBarOverlayFlags {
  if (!overlayRetreatActive) {
    return current
  }
  return activatePlayerBarVolumeOverlay()
}

export function countOpenPlayerBarOverlays(flags: PlayerBarOverlayFlags): number {
  return Number(flags.queue) + Number(flags.mode) + Number(flags.overflow) + Number(flags.volume)
}
