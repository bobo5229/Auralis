export function resolveMiniPlayerSourceBounds(
  isFullScreen: boolean,
  isMaximized: boolean,
  bounds: Electron.Rectangle,
  normalBounds: Electron.Rectangle,
): Electron.Rectangle {
  return isFullScreen || isMaximized ? normalBounds : bounds
}

/** F11 / exclusive fullscreen often matches the display pixel rect, not the work area. */
export function windowOccupiesDisplay(
  bounds: Electron.Rectangle,
  displayBounds: Electron.Rectangle,
  tolerance = 2,
): boolean {
  return (
    bounds.width >= displayBounds.width - tolerance &&
    bounds.height >= displayBounds.height - tolerance
  )
}

export function miniPlayerBoundsApplied(
  actual: Pick<Electron.Rectangle, 'width' | 'height'>,
  expected: Pick<Electron.Rectangle, 'width' | 'height'>,
  tolerance = 4,
): boolean {
  return (
    Math.abs(actual.width - expected.width) <= tolerance &&
    Math.abs(actual.height - expected.height) <= tolerance
  )
}
