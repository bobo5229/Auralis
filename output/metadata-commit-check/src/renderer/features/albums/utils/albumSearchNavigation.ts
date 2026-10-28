export interface AlbumSearchNavigationResult {
  targetIndex: number | null
  matchPosition: number | null
  totalMatches: number
  wrapped: boolean
}

export function resolveNextAlbumSearchMatch(
  matchingIndices: readonly number[],
  lastMatchedIndex: number,
  isNewQuery: boolean,
): AlbumSearchNavigationResult {
  if (matchingIndices.length === 0) {
    return {
      targetIndex: null,
      matchPosition: null,
      totalMatches: 0,
      wrapped: false,
    }
  }

  let matchPosition = matchingIndices.findIndex((index) => index > lastMatchedIndex)
  const wrapped = !isNewQuery && matchPosition < 0
  if (matchPosition < 0) matchPosition = 0

  return {
    targetIndex: matchingIndices[matchPosition],
    matchPosition: matchPosition + 1,
    totalMatches: matchingIndices.length,
    wrapped,
  }
}
