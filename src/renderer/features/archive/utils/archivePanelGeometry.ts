export interface PanelRect {
  left: number
  top: number
  width: number
  height: number
}

/** Expand over the calendar, keeping the whole panel inside the viewport. */
export function archivePanelPosition(
  source: PanelRect,
  width: number,
  height: number,
  viewport: { width: number; height: number },
) {
  const margin = 12
  const left = Math.min(
    viewport.width - width - margin,
    Math.max(margin, source.left + source.width / 2 - width / 2),
  )
  const below = source.top + height <= viewport.height - margin
  const top = Math.min(
    viewport.height - height - margin,
    Math.max(margin, below ? source.top : source.top + source.height - height),
  )
  return { left, top }
}

/** Only the panel surface scales; its text keeps its normal geometry. */
export function archivePanelTransform(source: PanelRect, target: PanelRect, progress: number) {
  const remaining = 1 - progress
  return `translate(${(source.left - target.left) * remaining}px, ${(source.top - target.top) * remaining}px) scale(${source.width / target.width + (1 - source.width / target.width) * progress}, ${source.height / target.height + (1 - source.height / target.height) * progress})`
}
