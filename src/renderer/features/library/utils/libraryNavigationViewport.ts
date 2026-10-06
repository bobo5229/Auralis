import type { LibraryRouteScope } from './libraryRouteScope'
import type { LibraryViewMode } from '../types/libraryInteraction'

/** Renderer-session state only: no track snapshots, DOM nodes or persisted preferences. */
export interface LibraryNavigationViewport {
  scrollTop: number
  viewMode: LibraryViewMode
  anchorTrackIds: number[]
  anchorOffset: number
  anchorRowHeight: number
}

export class LibraryNavigationViewportStore {
  private readonly positions = new Map<string, LibraryNavigationViewport>()

  private key(scope: LibraryRouteScope): string {
    return scope.kind === 'library' ? 'library' : `${scope.kind}:${scope.id}`
  }

  get(scope: LibraryRouteScope): LibraryNavigationViewport | undefined {
    return this.positions.get(this.key(scope))
  }

  save(scope: LibraryRouteScope, position: LibraryNavigationViewport | null): void {
    // Loading, empty and detached lists must not overwrite the last valid viewport.
    if (position) this.positions.set(this.key(scope), position)
  }
}

export const libraryNavigationViewportStore = new LibraryNavigationViewportStore()

export function resolveNavigationScrollTop(
  saved: LibraryNavigationViewport,
  current: {
    viewMode: LibraryViewMode
    anchorTop: number | null
    rowHeight: number
    headerHeight: number
    maxScrollTop: number
  },
): number {
  let target = saved.scrollTop
  if (saved.scrollTop === 0) target = 0
  else if (current.anchorTop !== null) {
    // Scale offsets inside a row when its height changes. Keep surrounding gaps
    // in pixels within the same view; across views retain only the row fraction.
    const fraction = saved.anchorOffset / saved.anchorRowHeight
    const offset =
      saved.viewMode !== current.viewMode
        ? Math.max(0, Math.min(1, fraction)) * current.rowHeight
        : Math.abs(fraction) <= 1
          ? fraction * current.rowHeight
          : saved.anchorOffset
    target = current.anchorTop - current.headerHeight + offset
  }
  return Math.max(0, Math.min(current.maxScrollTop, target))
}
