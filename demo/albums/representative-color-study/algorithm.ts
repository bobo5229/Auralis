import { analyzeArtworkColors, type ArtworkColor } from '@renderer/shared/artwork/artworkAnalysis'
import { refineArtworkPalette } from '@renderer/shared/artwork/refineArtworkPalette'
import { compareArtworkColors as compareRepresentative } from '@renderer/shared/artwork/representativeArtworkColor'

/** Experimental only: preserve the current result unless the candidate is well supported. */
export function compareArtworkColors(pixels: Uint8ClampedArray): {
  current: ArtworkColor
  proposed: ArtworkColor
  reason: string
} | null {
  const analysis = analyzeArtworkColors(pixels)
  if (!analysis) return null
  const current = refineArtworkPalette(pixels, analysis).dominant
  return compareRepresentative(pixels, analysis, current)
}
