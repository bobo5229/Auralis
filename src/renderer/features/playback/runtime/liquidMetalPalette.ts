import { convertLrgbToOklab, convertRgbToLrgb } from 'culori/fn'
import type { DeepReadonly } from 'vue'
import type { ArtworkPalette, RgbColor } from '../types'
import { getOklabDistance } from '../utils/colorSpace'

export interface LiquidMetalPalette {
  colors: Float32Array
  weights: Float32Array
}

/** Match at most six colors once per transition, independent of coverage ordering. */
export function alignLiquidMetalPalette(source: LiquidMetalPalette, target: LiquidMetalPalette) {
  const count = source.weights.length
  const labs = (palette: LiquidMetalPalette) =>
    Array.from(palette.weights, (_, index) =>
      convertLrgbToOklab({
        r: palette.colors[index * 3],
        g: palette.colors[index * 3 + 1],
        b: palette.colors[index * 3 + 2],
      }),
    )
  const sourceLabs = labs(source)
  const targetLabs = labs(target)
  let bestMissing = Infinity
  let bestDistance = Infinity
  let best: number[] = []
  const order: number[] = []
  const used = new Set<number>()
  function visit(missing: number, distance: number): void {
    const slot = order.length
    if (slot === count) {
      if (missing < bestMissing || (missing === bestMissing && distance < bestDistance)) {
        bestMissing = missing
        bestDistance = distance
        best = [...order]
      }
      return
    }
    for (let next = 0; next < count; next++) {
      if (used.has(next)) continue
      const fromActive = source.weights[slot] > 0
      const toActive = target.weights[next] > 0
      // First maximize active-to-active matches; only then minimize perceptual distance.
      const nextMissing = missing + Number(fromActive !== toActive)
      const nextDistance =
        distance +
        (fromActive && toActive ? getOklabDistance(sourceLabs[slot], targetLabs[next]) ** 2 : 0)
      if (nextMissing > bestMissing) continue
      order.push(next)
      used.add(next)
      visit(nextMissing, nextDistance)
      used.delete(next)
      order.pop()
    }
  }
  visit(0, 0)
  const from = { colors: source.colors.slice(), weights: source.weights.slice() }
  const to = { colors: new Float32Array(source.colors.length), weights: new Float32Array(count) }
  best.forEach((next, slot) => {
    to.colors.set(target.colors.subarray(next * 3, next * 3 + 3), slot * 3)
    to.weights[slot] = target.weights[next]
    // Empty slots have no color identity: fade coverage, never interpolate through black.
    if (!from.weights[slot]) from.colors.set(to.colors.subarray(slot * 3, slot * 3 + 3), slot * 3)
    if (!to.weights[slot]) to.colors.set(from.colors.subarray(slot * 3, slot * 3 + 3), slot * 3)
  })
  return { source: from, target: to }
}

export function toLiquidMetalPalette(palette: DeepReadonly<ArtworkPalette>): LiquidMetalPalette {
  const colors = new Float32Array(18)
  const weights = new Float32Array(6)
  const entries: ReadonlyArray<{
    rgb: Readonly<RgbColor>
    sourceRgb?: Readonly<RgbColor>
    weight: number
  }> =
    palette.quality === 'fallback'
      ? [{ rgb: { r: 112, g: 115, b: 120 }, weight: 1 }]
      : [...palette.accents].sort((a, b) => b.weight - a.weight).slice(0, 6)
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  entries.forEach((entry, index) => {
    // UI accents are tone-mapped; the metal body must retain the original artwork colors.
    const rgb = entry.sourceRgb ?? entry.rgb
    const linear = convertRgbToLrgb({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 })
    colors.set([linear.r, linear.g, linear.b], index * 3)
    weights[index] = total > 0 ? entry.weight / total : 0
  })
  return { colors, weights }
}
