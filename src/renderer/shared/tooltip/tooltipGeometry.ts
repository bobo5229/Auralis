export function isTooltipTextClipped(element: {
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
}): boolean {
  return (
    element.clientWidth > 0 &&
    element.clientHeight > 0 &&
    (element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1)
  )
}

export type TooltipPlacement = 'above' | 'right'

export function placeTooltip(
  anchor: { left: number; right: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: TooltipPlacement = 'above',
): { left: number; top: number } {
  const margin = 8

  if (placement === 'right') {
    const left = anchor.right + margin
    if (left + size.width <= viewport.width - margin) {
      const top = anchor.top + (anchor.bottom - anchor.top - size.height) / 2
      return {
        left,
        top: Math.max(margin, Math.min(top, viewport.height - size.height - margin)),
      }
    }
    // 右侧放不下时退回默认的上/下定位。
  }

  const above = anchor.top - size.height - margin
  const preferredTop = above >= margin ? above : anchor.bottom + margin
  return {
    left: Math.max(
      margin,
      Math.min((anchor.left + anchor.right - size.width) / 2, viewport.width - size.width - margin),
    ),
    top: Math.max(margin, Math.min(preferredTop, viewport.height - size.height - margin)),
  }
}
