import type {
  AlbumTransitionRect,
  AlbumTransitionTarget,
  AlbumTransitionVisual,
} from './albumGridTransitionController'

export interface AlbumTransitionPlanSource {
  key: string
  rect: AlbumTransitionRect
  opacity: number
  destination: AlbumTransitionRect | null
}

export function planAlbumGridTransition(
  from: readonly Pick<AlbumTransitionVisual, 'key' | 'rect' | 'opacity'>[],
  to: readonly AlbumTransitionTarget[],
): { from: AlbumTransitionPlanSource[]; to: readonly AlbumTransitionTarget[] } {
  const destinations = new Map(to.map((target) => [target.key, target.rect]))
  const fromKeys = new Set(from.map((visual) => visual.key))
  return {
    from: from.map(({ key, rect, opacity }) => ({
      key,
      rect,
      opacity,
      destination: destinations.get(key) ?? null,
    })),
    // A matched album is represented by its moving source snapshot. Keep a
    // destination snapshot only for albums that become newly visible, or the
    // same album is rendered twice while the source moves across the grid.
    to: to.filter((target) => !fromKeys.has(target.key)),
  }
}

export function findAlbumTransitionFocusTarget(
  cards: Iterable<Pick<HTMLElement, 'dataset' | 'querySelector'>>,
  albumKey: string,
  selector: string,
): HTMLElement | null {
  for (const card of cards) {
    if (card.dataset.albumKey !== albumKey) continue
    return card.querySelector<HTMLElement>(selector)
  }
  return null
}
