export const CD_COMPOSER_VISIBLE_LIMIT = 4

export interface CdTrackComposerPresentation {
  names: string[]
  visible: string[]
  overflow: number
}

export function presentCdTrackComposers(
  value: string | null | undefined,
): CdTrackComposerPresentation | null {
  const names =
    value
      ?.split(';')
      .map((name) => name.trim())
      .filter(Boolean) ?? []
  if (names.length === 0) return null
  if (names.length <= CD_COMPOSER_VISIBLE_LIMIT) {
    return { names, visible: names, overflow: 0 }
  }
  return {
    names,
    visible: names.slice(0, CD_COMPOSER_VISIBLE_LIMIT),
    overflow: names.length - CD_COMPOSER_VISIBLE_LIMIT,
  }
}
