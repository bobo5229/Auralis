import type {
  AlbumTransitionRect,
  AlbumTransitionTarget,
  AlbumTransitionVisual,
} from './albumGridTransitionController'

export interface AlbumTransitionPlanSource {
  key: string
  rect: AlbumTransitionRect
  opacity: number
}

export function planAlbumGridTransition(
  from: readonly Pick<AlbumTransitionVisual, 'key' | 'rect' | 'opacity'>[],
  to: readonly AlbumTransitionTarget[],
): { from: AlbumTransitionPlanSource[]; to: readonly AlbumTransitionTarget[] } {
  return {
    from: from.map(({ key, rect, opacity }) => ({ key, rect, opacity })),
    // Each layout is a separate fixed surface, including albums visible in both.
    to,
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
