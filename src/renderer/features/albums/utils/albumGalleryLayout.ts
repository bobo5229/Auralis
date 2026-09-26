export function albumGalleryCapacity(width: number, cardWidth: number, gap: number): number {
  if (width <= 0 || cardWidth <= 0) return 0
  return Math.max(0, Math.floor((width + gap) / (cardWidth + gap)))
}

/** Keep the current visit's order; shuffle only newly available candidates. */
export function updateRandomAlbumOrder(
  previous: readonly string[],
  candidates: readonly string[],
  random: () => number = Math.random,
): string[] {
  const available = new Set(candidates)
  const retained = previous.filter((key) => available.has(key))
  const retainedKeys = new Set(retained)
  const added = [...available].filter((key) => !retainedKeys.has(key))
  for (let index = added.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[added[index], added[target]] = [added[target]!, added[index]!]
  }
  return [...retained, ...added]
}
