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
