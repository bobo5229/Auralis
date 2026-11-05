import { distance, palette, utils } from 'image-q'
import { getOklabChroma, getOklabDistance, oklabToRgb, rgbToOklab } from '../color/colorMath'
import type { ArtworkAnalysis, ArtworkColor } from './artworkAnalysis'
import type { OklabColor, RgbColor } from '../color/types'

const SAMPLE_SIZE = 48
const MIN_CENTER = 10
const MAX_CENTER = 38
// Weakly tinted neutrals do not have a stable hue after cover downsampling.
const MIN_RELIABLE_HUE_CHROMA = 0.03

const hueDistance = (a: OklabColor, b: OklabColor): number => {
  const difference = Math.abs(Math.atan2(a.b, a.a) - Math.atan2(b.b, b.a))
  return Math.min(difference, Math.PI * 2 - difference)
}

interface Candidate {
  rgb: RgbColor
  lab: OklabColor
  chroma: number
  count: number
  center: number
}

/** Refine a muted main color only when a substantial central color meets the demo's limits. */
export function refineArtworkPalette(
  pixels: Uint8ClampedArray,
  analysis: ArtworkAnalysis,
): ArtworkAnalysis {
  const source = analysis.dominant
  const familyEligible = source.oklab.l < 0.3 || source.oklab.l > 0.92 || source.chroma < 0.03
  if (
    pixels.length !== SAMPLE_SIZE * SAMPLE_SIZE * 4 ||
    (source.chroma >= 0.055 && !familyEligible)
  ) {
    return analysis
  }

  const rgba: number[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] >= 128) rgba.push(pixels[i], pixels[i + 1], pixels[i + 2], 255)
  }
  if (!rgba.length) return analysis
  const quantizer = new palette.WuQuant(new distance.EuclideanBT709NoAlpha(), 16, 4)
  quantizer.sample(utils.PointContainer.fromUint8Array(Uint8Array.from(rgba), rgba.length / 4, 1))
  const candidates: Candidate[] = quantizer
    .quantizeSync()
    .getPointContainer()
    .getPointArray()
    .map(({ r, g, b }) => {
      const rgb = { r, g, b }
      const lab = rgbToOklab(rgb)
      return { rgb, lab, chroma: getOklabChroma(lab), count: 0, center: 0 }
    })
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const lab = rgbToOklab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] })
    const nearest = candidates.reduce((a, b) =>
      getOklabDistance(lab, a.lab) <= getOklabDistance(lab, b.lab) ? a : b,
    )
    nearest.count++
    const pos = i / 4
    const x = pos % SAMPLE_SIZE
    const y = Math.floor(pos / SAMPLE_SIZE)
    if (x >= MIN_CENTER && x < MAX_CENTER && y >= MIN_CENTER && y < MAX_CENTER) nearest.center++
  }
  const total = rgba.length / 4
  const eligible =
    source.chroma < 0.055
      ? candidates.filter((candidate) => {
          const difference = Math.abs(
            Math.atan2(candidate.lab.b, candidate.lab.a) -
              Math.atan2(source.oklab.b, source.oklab.a),
          )
          const angle = Math.min(difference, Math.PI * 2 - difference)
          return (
            candidate.count / total >= 0.035 &&
            candidate.chroma >= 0.085 &&
            candidate.chroma >= source.chroma * 1.8 &&
            candidate.center / candidate.count >= 0.55 &&
            (source.chroma < MIN_RELIABLE_HUE_CHROMA || angle <= Math.PI / 4)
          )
        })
      : []
  eligible.sort((a, b) => b.count * b.chroma - a.count * a.chroma)
  const selected = eligible[0]
  let dominant: ArtworkColor | null = selected
    ? {
        rgb: selected.rgb,
        oklab: selected.lab,
        chroma: selected.chroma,
        weight: selected.count / total,
      }
    : null

  let selectedFamily = false
  const current = dominant ?? source
  const currentNeedsFamily =
    current.oklab.l < 0.3 || current.oklab.l > 0.92 || current.chroma < 0.03
  if (currentNeedsFamily) {
    const families: Candidate[] = []
    for (const bucket of candidates
      .filter((candidate) => candidate.count > 0 && candidate.chroma >= 0.06)
      .sort((a, b) => b.count - a.count)) {
      const family = families.find((candidate) => {
        return hueDistance(candidate.lab, bucket.lab) <= Math.PI / 6
      })
      if (!family) {
        families.push({ ...bucket, lab: { ...bucket.lab } })
        continue
      }
      const count = family.count + bucket.count
      family.lab = {
        l: (family.lab.l * family.count + bucket.lab.l * bucket.count) / count,
        a: (family.lab.a * family.count + bucket.lab.a * bucket.count) / count,
        b: (family.lab.b * family.count + bucket.lab.b * bucket.count) / count,
      }
      family.count = count
      family.center += bucket.center
      family.chroma = getOklabChroma(family.lab)
      family.rgb = oklabToRgb(family.lab)
    }
    const suitable = families.filter(
      (family) =>
        family.count / total >= 0.07 &&
        family.chroma >= 0.08 &&
        family.center / family.count >= 0.5,
    )
    suitable.sort((a, b) => b.count * b.chroma - a.count * a.chroma)
    const best = suitable[0]
    if (best) {
      dominant = { rgb: best.rgb, oklab: best.lab, chroma: best.chroma, weight: best.count / total }
      selectedFamily = true
    }
  }
  if (!dominant) return analysis
  // Replace the leading cluster; the refined family can overlap it.
  const colors = [
    dominant,
    ...analysis.colors
      .slice(1)
      .filter(
        (color) =>
          getOklabDistance(color.oklab, dominant.oklab) >= 0.05 &&
          (!selectedFamily ||
            color.chroma < 0.06 ||
            hueDistance(color.oklab, dominant.oklab) > Math.PI / 6),
      ),
  ]
  return { dominant, colors }
}
