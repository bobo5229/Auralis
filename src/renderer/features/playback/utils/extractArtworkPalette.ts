import { distance, palette, utils } from 'image-q'
import type { ArtworkPalette, OklabColor, PaletteColor, RgbColor } from '../types'
import { getOklabChroma, getOklabDistance, oklabToRgb, rgbToOklab } from './colorSpace'
import { FALLBACK_PALETTE } from './artworkPaletteDefaults'

export { FALLBACK_PALETTE } from './artworkPaletteDefaults'

interface Sample {
  rgb: RgbColor
  oklab: OklabColor
}

interface Cluster {
  center: OklabColor
  samples: Sample[]
}

const MAX_COLORS = 5
const MIN_WEIGHT = 0.015
const MERGE_DISTANCE = 0.035
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

function mergeClusters(colors: PaletteColor[]): PaletteColor[] {
  const merged: PaletteColor[] = []

  for (const color of colors.sort((a, b) => b.weight - a.weight)) {
    const target = merged.find(
      (candidate) => getOklabDistance(candidate.oklab, color.oklab) < MERGE_DISTANCE,
    )
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

  return merged
}

function fitDisplayColor(color: OklabColor, lightness: number, chromaBoost = 1): OklabColor {
  let a = color.a * chromaBoost
  let b = color.b * chromaBoost
  let result = oklabToRgb({ l: lightness, a, b })

  for (let i = 0; i < 8; i += 1) {
    if (
      result.r > 1 &&
      result.r < 254 &&
      result.g > 1 &&
      result.g < 254 &&
      result.b > 1 &&
      result.b < 254
    ) {
      break
    }
    a *= 0.9
    b *= 0.9
    result = oklabToRgb({ l: lightness, a, b })
  }

  return { l: lightness, a, b }
}

function toPaletteColor(cluster: Cluster, totalSamples: number): PaletteColor {
  return {
    rgb: oklabToRgb(cluster.center),
    oklab: cluster.center,
    weight: cluster.samples.length / totalSamples,
    chroma: getOklabChroma(cluster.center),
  }
}

function selectAccents(colors: PaletteColor[]): PaletteColor[] {
  const ranked = [...colors].sort((a, b) => {
    const getScore = (color: PaletteColor): number => {
      const extremePenalty =
        color.oklab.l < 0.08 || (color.oklab.l > 0.94 && color.chroma < 0.03) ? 0.35 : 1
      return color.weight * (0.08 + color.chroma * 3.2) * extremePenalty
    }
    return getScore(b) - getScore(a)
  })
  const selected: PaletteColor[] = []

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
  return selected.map((color) => {
    const displayOklab = fitDisplayColor(
      color.oklab,
      Math.min(0.64, Math.max(0.3, color.oklab.l)),
      1.35,
    )
    return {
      ...color,
      sourceRgb: color.rgb,
      oklab: displayOklab,
      rgb: oklabToRgb(displayOklab),
      chroma: getOklabChroma(displayOklab),
    }
  })
}

export function extractArtworkPalette(key: string, pixels: Uint8ClampedArray): ArtworkPalette {
  const samples: Sample[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
    samples.push({ rgb, oklab: rgbToOklab(rgb) })
  }
  if (samples.length === 0) return { ...FALLBACK_PALETTE, key }

  const clustered = clusterSamples(samples).map((cluster) =>
    toPaletteColor(cluster, samples.length),
  )
  const meaningful = clustered.filter((color) => color.weight >= MIN_WEIGHT)
  const merged = mergeClusters(meaningful.length > 0 ? meaningful : clustered.slice(0, 1))
  const accents = selectAccents(merged)
  if (accents.length === 0) return { ...FALLBACK_PALETTE, key }

  const dominant = [...merged].sort((a, b) => b.weight - a.weight)[0]
  const backgroundOklab = fitDisplayColor(
    dominant.oklab,
    Math.min(0.18, Math.max(0.08, dominant.oklab.l * 0.26)),
  )

  return {
    key,
    dominant: dominant.rgb,
    background: oklabToRgb(backgroundOklab),
    accents,
    textTone: 'light',
    quality: accents.length === MAX_COLORS ? 'full' : 'reduced',
  }
}
