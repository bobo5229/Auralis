import type { ArtistIndexLetter } from '@shared/utils/artistIndex'

export function visibleIndex(
  rows: readonly { index: number; start: number; size: number }[],
  offset: number,
): number | null {
  return (
    rows.find((row) => row.start + row.size > Math.max(0, offset))?.index ??
    rows.at(-1)?.index ??
    null
  )
}

export function currentArtistLetter(
  anchors: readonly { letter: ArtistIndexLetter; rowIndex: number | null }[],
  index: number | null,
): ArtistIndexLetter | null {
  if (index === null) return null
  let current: ArtistIndexLetter | null = null
  let best = -1
  for (const anchor of anchors) {
    if (anchor.rowIndex !== null && anchor.rowIndex <= index && anchor.rowIndex > best) {
      current = anchor.letter
      best = anchor.rowIndex
    }
  }
  return current
}
