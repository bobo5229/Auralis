import type { ArtworkPalette, OklabColor, PaletteColor, RgbColor } from '../types'
import { getOklabChroma, getOklabDistance, oklabToRgb, rgbToOklab } from './colorSpace'

interface Sample {
  rgb: RgbColor
  oklab: OklabColor
}

interface Cluster {
  center: OklabColor
  samples: Sample[]
}

const MAX_COLORS = 5
const MAX_ITERATIONS = 16
const CONVERGENCE_DELTA = 0.0015
const MIN_WEIGHT = 0.015
const MERGE_DISTANCE = 0.035
const MIN_ACCENT_DISTANCE = 0.05

export const FALLBACK_PALETTE: ArtworkPalette = {
  key: 'fallback',
  background: { r: 14, g: 17, b: 23 },
  accents: [
    {
      rgb: { r: 64, g: 92, b: 128 },
      oklab: rgbToOklab({ r: 64, g: 92, b: 128 }),
      weight: 1,
      chroma: 0.073,
    },
  ],
  textTone: 'light',
  quality: 'fallback',
}

function hashKey(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRandom(seed: number): () => number {
  let state = seed || 0x9e3779b9
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function averageOklab(samples: Sample[]): OklabColor {
  const sum = samples.reduce(
    (result, sample) => ({
      l: result.l + sample.oklab.l,
      a: result.a + sample.oklab.a,
      b: result.b + sample.oklab.b,
    }),
    { l: 0, a: 0, b: 0 },
  )
  return {
    l: sum.l / samples.length,
    a: sum.a / samples.length,
    b: sum.b / samples.length,
  }
}

function initializeCenters(samples: Sample[], count: number, key: string): OklabColor[] {
  const random = createRandom(hashKey(key))
  const mean = averageOklab(samples)
  const first = samples.reduce((nearest, sample) =>
    getOklabDistance(sample.oklab, mean) < getOklabDistance(nearest.oklab, mean) ? sample : nearest,
  )
  const centers = [{ ...first.oklab }]

  while (centers.length < count) {
    const distances = samples.map((sample) => {
      const nearest = Math.min(...centers.map((center) => getOklabDistance(sample.oklab, center)))
      return nearest * nearest
    })
    const total = distances.reduce((sum, distance) => sum + distance, 0)
    if (total <= Number.EPSILON) break

    let target = random() * total
    let selectedIndex = distances.length - 1
    for (let i = 0; i < distances.length; i += 1) {
      target -= distances[i]
      if (target <= 0) {
        selectedIndex = i
        break
      }
    }
    centers.push({ ...samples[selectedIndex].oklab })
  }

  return centers
}

function clusterSamples(samples: Sample[], key: string): Cluster[] {
  const uniqueColors = new Set(samples.map(({ rgb }) => `${rgb.r},${rgb.g},${rgb.b}`)).size
  let centers = initializeCenters(samples, Math.min(MAX_COLORS, uniqueColors), key)
  let clusters: Cluster[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    clusters = centers.map((center) => ({ center, samples: [] }))
    for (const sample of samples) {
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      centers.forEach((center, index) => {
        const distance = getOklabDistance(sample.oklab, center)
        if (distance < nearestDistance) {
          nearestIndex = index
          nearestDistance = distance
        }
      })
      clusters[nearestIndex].samples.push(sample)
    }

    const nextCenters = clusters.map((cluster) => {
      if (cluster.samples.length > 0) return averageOklab(cluster.samples)
      return samples.reduce(
        (farthest, sample) => {
          const error = Math.min(...centers.map((center) => getOklabDistance(sample.oklab, center)))
          return error > farthest.error ? { sample, error } : farthest
        },
        { sample: samples[0], error: -1 },
      ).sample.oklab
    })
    const movement = centers.reduce(
      (sum, center, index) => sum + getOklabDistance(center, nextCenters[index]),
      0,
    )
    centers = nextCenters
    if (movement < CONVERGENCE_DELTA) break
  }

  return clusters.filter((cluster) => cluster.samples.length > 0)
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
      return color.weight * (0.35 + color.chroma) * extremePenalty
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
      Math.min(0.76, Math.max(0.36, color.oklab.l)),
      1.15,
    )
    return {
      ...color,
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

  const clustered = clusterSamples(samples, key).map((cluster) =>
    toPaletteColor(cluster, samples.length),
  )
  const meaningful = clustered.filter((color) => color.weight >= MIN_WEIGHT)
  const merged = mergeClusters(meaningful.length > 0 ? meaningful : clustered.slice(0, 1))
  const accents = selectAccents(merged)
  if (accents.length === 0) return { ...FALLBACK_PALETTE, key }

  const dominant = [...merged].sort((a, b) => b.weight - a.weight)[0]
  const backgroundOklab = fitDisplayColor(
    dominant.oklab,
    Math.min(0.24, Math.max(0.12, dominant.oklab.l * 0.35)),
  )

  return {
    key,
    background: oklabToRgb(backgroundOklab),
    accents,
    textTone: 'light',
    quality: accents.length === MAX_COLORS ? 'full' : 'reduced',
  }
}
