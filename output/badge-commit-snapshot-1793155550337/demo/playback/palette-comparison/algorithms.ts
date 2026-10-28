import { palette, distance, utils } from 'image-q'
import { convertOklabToRgb } from 'culori/fn'
import { extractArtworkPalette } from '../../../src/renderer/features/playback/utils/extractArtworkPalette'
import {
  rgbToOklab,
  oklabToRgb,
  getContrastRatio,
} from '../../../src/renderer/shared/color/colorMath'

export type RGB = { r: number; g: number; b: number }
type Lab = { l: number; a: number; b: number }
export type Cluster = { lab: Lab; rgb: RGB; weight: number }
export type Extraction = {
  id: string
  title: string
  source: RGB
  clusters: Cluster[]
  weight: number
}
const sq = (a: Lab, b: Lab) => (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2
const chroma = (a: Lab) => Math.hypot(a.a, a.b)
const K = 5

function centroid(labs: Lab[]): Lab {
  const sum = labs.reduce((a, b) => ({ l: a.l + b.l, a: a.a + b.a, b: a.b + b.b }), {
    l: 0,
    a: 0,
    b: 0,
  })
  return { l: sum.l / labs.length, a: sum.a / labs.length, b: sum.b / labs.length }
}

function assign(labs: Lab[], centers: Lab[]): Lab[][] {
  const groups = centers.map(() => [] as Lab[])
  for (const lab of labs) {
    let best = 0
    for (let j = 1; j < centers.length; j++)
      if (sq(lab, centers[j]) < sq(lab, centers[best])) best = j
    groups[best].push(lab)
  }
  return groups
}

function clustersFrom(labs: Lab[], centers: Lab[]): Cluster[] {
  return assign(labs, centers)
    .filter((g) => g.length > 0)
    .map((g) => {
      const lab = centroid(g)
      return { lab, rgb: oklabToRgb(lab), weight: g.length / labs.length }
    })
}

function merge(clusters: Cluster[], sameHue = false): Cluster[] {
  const output: Cluster[] = []
  // Same order, threshold and weighted centroid as the production extractor.
  for (const c of [...clusters].sort((a, b) => b.weight - a.weight)) {
    const target = output.find((a) => {
      if (sq(a.lab, c.lab) < 0.035 ** 2) return true
      if (!sameHue || chroma(a.lab) < 0.025 || chroma(c.lab) < 0.025) return false
      const angle = Math.abs(Math.atan2(a.lab.b, a.lab.a) - Math.atan2(c.lab.b, c.lab.a))
      return (
        Math.min(angle, Math.PI * 2 - angle) <= Math.PI / 10 && Math.abs(a.lab.l - c.lab.l) <= 0.22
      )
    })
    if (!target) {
      output.push({ ...c, lab: { ...c.lab } })
      continue
    }
    const weight = target.weight + c.weight
    target.lab = {
      l: (target.lab.l * target.weight + c.lab.l * c.weight) / weight,
      a: (target.lab.a * target.weight + c.lab.a * c.weight) / weight,
      b: (target.lab.b * target.weight + c.lab.b * c.weight) / weight,
    }
    target.weight = weight
    target.rgb = oklabToRgb(target.lab)
  }
  return output.sort((a, b) => b.weight - a.weight)
}

function meaningful(clusters: Cluster[]): Cluster[] {
  const filtered = clusters.filter((c) => c.weight >= 0.015)
  return filtered.length ? filtered : clusters.slice(0, 1)
}

function adjustedSelection(clusters: Cluster[]) {
  const merged = merge(meaningful(clusters), true)
  // Area dominates. Chroma is a bounded 0–10% bonus, never a grayscale veto.
  const score = (c: Cluster) => c.weight * (0.9 + 0.1 * Math.min(1, chroma(c.lab) / 0.12))
  const selected = [...merged].sort((a, b) => score(b) - score(a))[0]
  return { selected, merged }
}

function kmeans(labs: Lab[]): Cluster[] {
  const histogram = new Map<string, { lab: Lab; count: number }>()
  for (const lab of labs) {
    const key = [lab.l, lab.a, lab.b].map((v) => Math.round(v * 64)).join(',')
    const entry = histogram.get(key)
    if (entry) entry.count++
    else histogram.set(key, { lab, count: 1 })
  }
  const entries = [...histogram.values()]
  entries.sort((a, b) => b.count - a.count)
  const centers = [{ ...entries[0].lab }]
  // Deterministic weighted farthest-point initialization; no Math.random().
  while (centers.length < K) {
    let best: Lab | null = null,
      bestScore = 0
    for (const e of entries) {
      const score = Math.min(...centers.map((c) => sq(c, e.lab))) * e.count
      if (score > bestScore) {
        bestScore = score
        best = e.lab
      }
    }
    if (!best || bestScore < 1e-12) break
    centers.push({ ...best })
  }
  for (let iteration = 0; iteration < 30; iteration++) {
    const groups = assign(labs, centers)
    let shift = 0
    groups.forEach((group, i) => {
      if (!group.length) return
      const next = centroid(group)
      shift = Math.max(shift, sq(centers[i], next))
      centers[i] = next
    })
    if (shift < 1e-10) break
  }
  return clustersFrom(labs, centers)
}

export function extractAll(pixels: Uint8ClampedArray): Extraction[] {
  const labs: Lab[] = [],
    rgba: number[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    labs.push(rgbToOklab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }))
    rgba.push(pixels[i], pixels[i + 1], pixels[i + 2], 255)
  }
  if (!labs.length) throw new Error('图片中没有可取色的不透明像素，请换一张封面。')
  const quantizer = new palette.WuQuant(new distance.EuclideanBT709NoAlpha(), K, 3)
  quantizer.sample(utils.PointContainer.fromUint8Array(new Uint8Array(rgba), labs.length, 1))
  const centers = quantizer.quantizeSync().getPointContainer().getPointArray().map(rgbToOklab)
  const wu = clustersFrom(labs, centers)
  const baseline = merge(meaningful(wu))
  // The baseline source is taken from the ACTUAL production extractor, not a reimplementation.
  const source = extractArtworkPalette('comparison', pixels).dominant!
  const adjusted = adjustedSelection(wu)
  const km = adjustedSelection(kmeans(labs))
  return [
    { id: 'wu', title: '现有 Wu', source, clusters: baseline, weight: baseline[0].weight },
    {
      id: 'adjusted',
      title: '调整选色后的 Wu',
      source: adjusted.selected.rgb,
      clusters: adjusted.merged,
      weight: adjusted.selected.weight,
    },
    {
      id: 'kmeans',
      title: 'OKLab K-means',
      source: km.selected.rgb,
      clusters: km.merged,
      weight: km.selected.weight,
    },
  ]
}

export const hex = (c: RGB) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
export const contrast = getContrastRatio
export function composite(bg: RGB, alpha: number): RGB {
  return {
    r: Math.round(255 * alpha + bg.r * (1 - alpha)),
    g: Math.round(255 * alpha + bg.g * (1 - alpha)),
    b: Math.round(255 * alpha + bg.b * (1 - alpha)),
  }
}

export function adapt(source: RGB, lightness: number, maxChroma: number) {
  const lab = rgbToOklab(source)
  const originalChroma = chroma(lab)
  const h = Math.atan2(lab.b, lab.a)
  let low = 0,
    high = Math.min(maxChroma, originalChroma)
  const toRgb = (c: number) =>
    convertOklabToRgb({ l: lightness, a: Math.cos(h) * c, b: Math.sin(h) * c })
  const fits = (c: number) => {
    const r = toRgb(c)
    return [r.r, r.g, r.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  }
  if (fits(high)) low = high
  else
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2
      if (fits(mid)) low = mid
      else high = mid
    }
  const rgb = toRgb(low)
  const bg = { r: Math.round(rgb.r * 255), g: Math.round(rgb.g * 255), b: Math.round(rgb.b * 255) }
  // Check actual rounded sRGB foregrounds, including opacity compositing.
  const alphaFor = (start: number, minimum: number) => {
    let alpha = start
    while (alpha < 1 && contrast(bg, composite(bg, alpha)) < minimum)
      alpha = Math.min(1, alpha + 0.01)
    return alpha
  }
  const primary = composite(bg, alphaFor(0.96, 4.5))
  const secondary = composite(bg, alphaFor(0.7, 4.5))
  const control = composite(bg, alphaFor(0.5, 3))
  return {
    bg,
    primary,
    secondary,
    control,
    primaryContrast: contrast(bg, primary),
    secondaryContrast: contrast(bg, secondary),
    controlContrast: contrast(bg, control),
  }
}
