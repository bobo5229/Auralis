import type { CSSProperties } from 'vue'

export type MiniPopover = 'queue' | 'mode' | 'volume' | null

const MINI_POPOVER_GAP = 10
const MINI_VOLUME_POPOVER_WIDTH = 92
const MINI_POPOVER_SURFACE_HEIGHTS: Record<Exclude<MiniPopover, null>, number> = {
  queue: 300,
  mode: 220,
  volume: 220,
}

export function getMiniPopoverRegionHeight(popover: MiniPopover): number {
  return popover ? MINI_POPOVER_SURFACE_HEIGHTS[popover] + MINI_POPOVER_GAP : 0
}

export function resolveMiniPopoverStyle(
  popover: Exclude<MiniPopover, null>,
  bodyWidth: number,
  regionHeight: number,
): CSSProperties {
  const surfaceHeight = Math.max(0, regionHeight - MINI_POPOVER_GAP)
  const isMode = popover === 'mode'
  const isVolume = popover === 'volume'

  return {
    width: `${isMode ? bodyWidth / 2 : isVolume ? MINI_VOLUME_POPOVER_WIDTH : bodyWidth}px`,
    maxHeight: `${surfaceHeight}px`,
    ...(isMode ? { alignSelf: 'center' } : {}),
    ...(isVolume ? { alignSelf: 'flex-end' } : {}),
    ...(popover === 'queue' || isVolume ? { height: `${surfaceHeight}px` } : {}),
  }
}

export const MINI_POPOVER_GAP_PX = MINI_POPOVER_GAP
