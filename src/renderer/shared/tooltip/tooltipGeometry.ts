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

export function placeTooltip(
  anchor: { left: number; right: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const margin = 8
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
