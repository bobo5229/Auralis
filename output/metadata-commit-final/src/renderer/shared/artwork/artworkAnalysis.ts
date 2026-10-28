import { distance, palette, utils } from 'image-q'
import type { RgbColor, OklabColor } from '../color/types'
import { getOklabChroma, getOklabDistance, oklabToRgb, rgbToOklab } from '../color/colorMath'

export interface ArtworkColor {
  rgb: RgbColor
  oklab: OklabColor
  weight: number
  chroma: number
}
export interface ArtworkAnalysis {
  dominant: ArtworkColor
  colors: ArtworkColor[]
}

interface Sample {
  rgb: RgbColor
  oklab: OklabColor
}

interface Cluster {
  center: OklabColor
  samples: Sample[]
}

export const MAX_ARTWORK_COLORS = 5
const MAX_COLORS = MAX_ARTWORK_COLORS

const MIN_WEIGHT = 0.015

const MERGE_DISTANCE = 0.035

const MIN_HUE_MERGE_CHROMA = 0.025

const MAX_HUE_MERGE_ANGLE = Math.PI / 10

const MAX_HUE_MERGE_LIGHTNESS = 0.22

const MIN_ACCENT_DISTANCE = 0.05

function clusterSamples(samples: Sample[]): Cluster[] {
  // Three histogram bits per channel bound Wu's four-dimensional working set
  // for the existing 48 × 48 artwork sample. Output still uses full RGB values.
  const quantizer = new palette.WuQuant(new distance.EuclideanBT709NoAlpha(), MAX_COLORS, 3)
  const pixels = new Uint8Array(samples.flatMap(({ rgb }) => [rgb.r, rgb.g, rgb.b, 255]))
  quantizer.sample(utils.PointContainer.fromUint8Array(pixels, samples.length, 1))
  const clusters: Cluster[] = quantizer
    .quantizeSync()
    .getPointContainer()
    .getPointArray()
    .map(({ r, g, b }) => ({ center: rgbToOklab({ r, g, b }), samples: [] }))
  for (const sample of samples) {
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    clusters.forEach((cluster, index) => {
      const value = getOklabDistance(sample.oklab, cluster.center)
      if (value < nearestDistance) {
        nearestIndex = index
        nearestDistance = value
      }
    })
    clusters[nearestIndex].samples.push(sample)
  }
  return clusters
    .filter((cluster) => cluster.samples.length > 0)
    .map((cluster) => {
      const sum = cluster.samples.reduce(
        (result, sample) => ({
          l: result.l + sample.oklab.l,
          a: result.a + sample.oklab.a,
          b: result.b + sample.oklab.b,
        }),
        { l: 0, a: 0, b: 0 },
      )
      return {
        ...cluster,
        center: {
          l: sum.l / cluster.samples.length,
          a: sum.a / cluster.samples.length,
          b: sum.b / cluster.samples.length,
        },
      }
    })
}

function mergeClusters(colors: ArtworkColor[]): ArtworkColor[] {
  const merged: ArtworkColor[] = []

  for (const color of colors.sort((a, b) => b.weight - a.weight)) {
    const target = merged.find((candidate) => {
      if (getOklabDistance(candidate.oklab, color.oklab) < MERGE_DISTANCE) return true
      if (candidate.chroma < MIN_HUE_MERGE_CHROMA || color.chroma < MIN_HUE_MERGE_CHROMA) {
        return false
      }
      const angle = Math.abs(
        Math.atan2(candidate.oklab.b, candidate.oklab.a) - Math.atan2(color.oklab.b, color.oklab.a),
      )
      return (
        Math.min(angle, Math.PI * 2 - angle) <= MAX_HUE_MERGE_ANGLE &&
        Math.abs(candidate.oklab.l - color.oklab.l) <= MAX_HUE_MERGE_LIGHTNESS
      )
    })
    if (!target) {
      merged.push({ ...color, rgb: { ...color.rgb }, oklab: { ...color.oklab } })
      continue
    }

    const weight = target.weight + color.weight
    target.oklab = {
      l: (target.oklab.l * target.weight + color.oklab.l * color.weight) / weight,
      a: (target.oklab.a * target.weight + color.oklab.a * color.weight) / weight,
      b: (target.oklab.b * target.weight + color.oklab.b * color.weight) / weight,
    }
    target.weight = weight
    target.rgb = oklabToRgb(target.oklab)
    target.chroma = getOklabChroma(target.oklab)
  }

  // Preserve the prototype's area order before stable score sorting, including ties.
  return merged.sort((a, b) => b.weight - a.weight)
}

function getRepresentativeScore(color: ArtworkColor): number {
  // Area dominates; chroma is a bounded bonus and never excludes black, white or gray.
  return color.weight * (0.9 + 0.1 * Math.min(1, color.chroma / 0.12))
}

function toArtworkColor(cluster: Cluster, totalSamples: number): ArtworkColor {
  return {
    rgb: oklabToRgb(cluster.center),
    oklab: cluster.center,
    weight: cluster.samples.length / totalSamples,
    chroma: getOklabChroma(cluster.center),
  }
}

function selectSourceColors(ranked: ArtworkColor[]): ArtworkColor[] {
  const selected: ArtworkColor[] = []

  for (const color of ranked) {
    if (
      selected.length === 0 ||
      selected.every(
        (candidate) => getOklabDistance(candidate.oklab, color.oklab) >= MIN_ACCENT_DISTANCE,
      )
    ) {
      selected.push(color)
    }
    if (selected.length === MAX_COLORS) break
  }

  if (selected.length === 0 && ranked[0]) selected.push(ranked[0])
  return selected
}

/** Analyze source pixels without applying any screen's brightness or accent policy. */
export function analyzeArtworkColors(pixels: Uint8ClampedArray): ArtworkAnalysis | null {
  const samples: Sample[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
    samples.push({ rgb, oklab: rgbToOklab(rgb) })
  }
  if (samples.length === 0) return null
  const clustered = clusterSamples(samples).map((cluster) =>
    toArtworkColor(cluster, samples.length),
  )
  const meaningful = clustered.filter((color) => color.weight >= MIN_WEIGHT)
  const merged = mergeClusters(meaningful.length > 0 ? meaningful : clustered.slice(0, 1))
  const ranked = [...merged].sort((a, b) => getRepresentativeScore(b) - getRepresentativeScore(a))
  const colors = selectSourceColors(ranked)
  return colors.length ? { dominant: ranked[0], colors } : null
}
