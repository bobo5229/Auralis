import { pinyin } from 'pinyin-pro'

export const ARTIST_INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'] as const
export type ArtistIndexLetter = (typeof ARTIST_INDEX_LETTERS)[number]

export function resolveIndexArtist(
  albumArtist: string | null | undefined,
  artist?: string | null,
): string | null {
  return albumArtist?.trim() ? albumArtist : artist?.trim() ? artist : null
}

export function createArtistIndex() {
  const cache = new Map<string, { key: string; letter: ArtistIndexLetter }>()
  const collator = new Intl.Collator('zh-Hans-u-co-pinyin', { sensitivity: 'base', numeric: true })
  function classify(name: string | null | undefined) {
    const normalized = name?.trim() || ''
    let result = cache.get(normalized)
    if (!result) {
      const key = pinyin(normalized, { toneType: 'none', type: 'string', nonZh: 'consecutive' })
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      const first = key[0]
      const letter =
        normalized !== 'Unknown Artist' && first && first >= 'a' && first <= 'z'
          ? (first.toUpperCase() as ArtistIndexLetter)
          : '#'
      result = { key, letter }
      cache.set(normalized, result)
    }
    return result
  }
  function compare(left: string | null | undefined, right: string | null | undefined): number {
    const a = classify(left),
      b = classify(right)
    if (a.letter !== b.letter)
      return a.letter === '#' ? 1 : b.letter === '#' ? -1 : a.letter.localeCompare(b.letter)
    if (!left?.trim() || !right?.trim()) return !left?.trim() ? (!right?.trim() ? 0 : 1) : -1
    return collator.compare(a.key, b.key) || collator.compare(left, right)
  }
  return { classify, compare }
}

export function buildArtistAnchors<T>(
  items: readonly T[],
  artist: (item: T) => string | null | undefined,
) {
  const index = createArtistIndex()
  const first = new Map<ArtistIndexLetter, number>()
  items.forEach((item, position) => {
    const letter = index.classify(artist(item)).letter
    if (!first.has(letter)) first.set(letter, position)
  })
  return ARTIST_INDEX_LETTERS.map((letter) => ({ letter, rowIndex: first.get(letter) ?? null }))
}
