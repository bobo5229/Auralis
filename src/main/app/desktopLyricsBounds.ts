export interface DesktopLyricsRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopLyricsDisplayWorkArea {
  id: number
  workArea: DesktopLyricsRect
}

export interface DesktopLyricsSavedBounds {
  x: number
  y: number
  displayId: number | null
}

export const DESKTOP_LYRICS_HEIGHT = 150
export const DESKTOP_LYRICS_MIN_WIDTH = 640
export const DESKTOP_LYRICS_MAX_WIDTH = 980
export const DESKTOP_LYRICS_SIDE_INSET = 160
export const DESKTOP_LYRICS_BOTTOM_GAP = 96

export function resolveDesktopLyricsWidth(workAreaWidth: number): number {
  const usable = Math.max(1, workAreaWidth - DESKTOP_LYRICS_SIDE_INSET)
  const preferred = Math.min(DESKTOP_LYRICS_MAX_WIDTH, Math.max(DESKTOP_LYRICS_MIN_WIDTH, usable))
  return Math.min(preferred, Math.max(1, workAreaWidth))
}

export function resolveDefaultDesktopLyricsBounds(workArea: DesktopLyricsRect): DesktopLyricsRect {
  const width = resolveDesktopLyricsWidth(workArea.width)
  const height = Math.min(DESKTOP_LYRICS_HEIGHT, Math.max(1, workArea.height))
  return clampDesktopLyricsBounds(
    {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + workArea.height - height - DESKTOP_LYRICS_BOTTOM_GAP),
      width,
      height,
    },
    workArea,
  )
}

export function clampDesktopLyricsBounds(
  bounds: DesktopLyricsRect,
  workArea: DesktopLyricsRect,
): DesktopLyricsRect {
  const width = Math.min(Math.max(1, bounds.width), Math.max(1, workArea.width))
  const height = Math.min(Math.max(1, bounds.height), Math.max(1, workArea.height))
  const maxX = workArea.x + Math.max(0, workArea.width - width)
  const maxY = workArea.y + Math.max(0, workArea.height - height)
  return {
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY),
    width,
    height,
  }
}

export function pickDesktopLyricsDisplay(
  point: { x: number; y: number },
  displays: readonly DesktopLyricsDisplayWorkArea[],
  preferredId: number | null,
): DesktopLyricsDisplayWorkArea | null {
  if (displays.length === 0) return null

  const preferred =
    preferredId == null ? undefined : displays.find((display) => display.id === preferredId)
  if (preferred) return preferred

  const containing = displays.find((display) => pointInRect(point, display.workArea))
  if (containing) return containing

  return displays.reduce((closest, display) => {
    const closestDistance = distanceToRect(point, closest.workArea)
    const nextDistance = distanceToRect(point, display.workArea)
    return nextDistance < closestDistance ? display : closest
  })
}

export function resolveDesktopLyricsRestoreBounds(input: {
  saved: DesktopLyricsSavedBounds | null
  displays: readonly DesktopLyricsDisplayWorkArea[]
}): DesktopLyricsRect {
  const primary = input.displays[0]
  if (!primary) {
    return {
      x: 0,
      y: 0,
      width: DESKTOP_LYRICS_MIN_WIDTH,
      height: DESKTOP_LYRICS_HEIGHT,
    }
  }

  if (!input.saved) {
    return resolveDefaultDesktopLyricsBounds(primary.workArea)
  }

  const display = pickDesktopLyricsDisplay(
    { x: input.saved.x, y: input.saved.y },
    input.displays,
    input.saved.displayId,
  )
  const workArea = display?.workArea ?? primary.workArea
  const width = resolveDesktopLyricsWidth(workArea.width)
  const height = Math.min(DESKTOP_LYRICS_HEIGHT, Math.max(1, workArea.height))
  return clampDesktopLyricsBounds({ x: input.saved.x, y: input.saved.y, width, height }, workArea)
}

export function parseDesktopLyricsSavedBounds(raw: unknown): DesktopLyricsSavedBounds | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!Number.isFinite(record.x) || !Number.isFinite(record.y)) return null

  const displayId =
    record.displayId == null
      ? null
      : Number.isFinite(record.displayId)
        ? Number(record.displayId)
        : null

  return {
    x: Number(record.x),
    y: Number(record.y),
    displayId,
  }
}

function pointInRect(point: { x: number; y: number }, rect: DesktopLyricsRect): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  )
}

function distanceToRect(point: { x: number; y: number }, rect: DesktopLyricsRect): number {
  const nearestX = Math.min(Math.max(point.x, rect.x), rect.x + rect.width)
  const nearestY = Math.min(Math.max(point.y, rect.y), rect.y + rect.height)
  const dx = point.x - nearestX
  const dy = point.y - nearestY
  return dx * dx + dy * dy
}
