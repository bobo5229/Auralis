/** Resting geometry of `.page-search-tools` in `main.css`. */
export const LIBRARY_SEARCH_BAR_WIDTH_PX = 360
export const PAGE_PARAMETER_TRIGGER_WIDTH_PX = 38
export const PAGE_SEARCH_TOOLS_GAP_PX = 8
export const LIBRARY_SEARCH_BAR_GUTTER_PX = 48
export const LIBRARY_SEARCH_BAR_TOP_PX = 8
export const LIBRARY_SEARCH_BAR_HEIGHT_PX = 38

export interface LibrarySearchBarBox {
  left: number
  right: number
  top: number
  bottom: number
}

export function librarySearchBarWidth(containerWidth: number, hasParameters = false): number {
  return Math.min(
    LIBRARY_SEARCH_BAR_WIDTH_PX +
      (hasParameters ? PAGE_PARAMETER_TRIGGER_WIDTH_PX + PAGE_SEARCH_TOOLS_GAP_PX : 0),
    Math.max(0, containerWidth - LIBRARY_SEARCH_BAR_GUTTER_PX),
  )
}

/** Hit target used before the search bar element is mounted. */
export function resolveHiddenLibrarySearchBarRect(
  container: { left: number; top: number; width: number },
  hasParameters = false,
): LibrarySearchBarBox {
  const width = librarySearchBarWidth(container.width, hasParameters)
  const left = container.left + (container.width - width) / 2
  const top = container.top + LIBRARY_SEARCH_BAR_TOP_PX
  return {
    left,
    right: left + width,
    top,
    bottom: top + LIBRARY_SEARCH_BAR_HEIGHT_PX,
  }
}

export function containsLibrarySearchPoint(
  clientX: number,
  clientY: number,
  rect: LibrarySearchBarBox,
): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}

export function isLibrarySearchBarHovered(
  clientX: number,
  clientY: number,
  container: { left: number; top: number; width: number },
  barRect: LibrarySearchBarBox | null,
  hasParameters = false,
): boolean {
  const rect = barRect ?? resolveHiddenLibrarySearchBarRect(container, hasParameters)
  return containsLibrarySearchPoint(clientX, clientY, rect)
}
