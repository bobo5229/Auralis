import { type ArtworkAnalysis, type ArtworkColor } from '@renderer/shared/artwork/artworkAnalysis'
import { getOklabChroma, rgbToOklab } from '@renderer/shared/color/colorMath'

/** Preserve the current result unless a competing surface is well supported. */
export function compareArtworkColors(
  pixels: Uint8ClampedArray,
  analysis: ArtworkAnalysis,
  current: ArtworkColor,
): {
  current: ArtworkColor
  proposed: ArtworkColor
  reason: string
} | null {
  const baseline = analysis.dominant
  if (pixels.length !== 48 * 48 * 4) return { current, proposed: current, reason: 'invalid-size' }

  let opaque = 0
  let dark = 0
  const hueBuckets = new Array<number>(12).fill(0)
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    opaque++
    const lab = rgbToOklab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] })
    if (lab.l < 0.2 && getOklabChroma(lab) < 0.03) dark++
    if (getOklabChroma(lab) >= 0.09 && lab.l >= 0.3) {
      const angle = (Math.atan2(lab.b, lab.a) + Math.PI * 2) % (Math.PI * 2)
      hueBuckets[Math.floor((angle / (Math.PI * 2)) * hueBuckets.length)]++
    }
  }
  if (!opaque) return { current, proposed: current, reason: 'empty' }
  const diverseHues = hueBuckets.filter((count) => count / opaque >= 0.025).length
  if (baseline.oklab.l < 0.2 && dark / opaque >= 0.3 && diverseHues >= 5) {
    return { current, proposed: baseline, reason: 'dark-diverse' }
  }

  const brightBackground = analysis.colors.find(
    (candidate) =>
      candidate.oklab.l >= 0.86 &&
      candidate.chroma >= 0.05 &&
      candidate.weight >= 0.3 &&
      candidate.weight >= baseline.weight * 0.7,
  )
  if (
    baseline.oklab.l >= 0.3 &&
    baseline.oklab.l < 0.65 &&
    baseline.chroma < 0.08 &&
    brightBackground
  ) {
    return { current, proposed: brightBackground, reason: 'bright-background' }
  }
  return { current, proposed: current, reason: 'unchanged' }
}
