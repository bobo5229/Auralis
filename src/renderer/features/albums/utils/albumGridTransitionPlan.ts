import type {
  AlbumTransitionRect,
  AlbumTransitionTarget,
  AlbumTransitionVisual,
} from '../components/AlbumGridTransitionLayer.vue'

export interface AlbumTransitionSourcePlan extends AlbumTransitionVisual {
  destination: AlbumTransitionRect | null
}

export function planAlbumGridTransition(
  from: readonly AlbumTransitionVisual[],
  to: readonly AlbumTransitionTarget[],
): { from: AlbumTransitionSourcePlan[]; to: readonly AlbumTransitionTarget[] } {
  const destinations = new Map(to.map((target) => [target.key, target.rect]))
  const fromKeys = new Set(from.map((visual) => visual.key))
  return {
    from: from.map((visual) => ({
      ...visual,
      destination: destinations.get(visual.key) ?? null,
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
