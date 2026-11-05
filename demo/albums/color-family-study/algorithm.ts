import { distance, palette, utils } from 'image-q'
import { analyzeArtworkColors } from '../../../src/renderer/shared/artwork/artworkAnalysis'
import { refineArtworkPalette } from '../../../src/renderer/shared/artwork/refineArtworkPalette'
import { getOklabChroma, getOklabDistance, oklabToRgb, rgbToOklab } from '../../../src/renderer/shared/color/colorMath'
import type { OklabColor, RgbColor } from '../../../src/renderer/shared/color/types'

type Bucket = { rgb: RgbColor; lab: OklabColor; chroma: number; count: number; center: number }
type Family = { lab: OklabColor; count: number; center: number; chroma: number; rgb: RgbColor }

/** Experimental demo-only rule: group similar hues before judging prominent foreground colors. */
export function compareArtwork(pixels: Uint8ClampedArray) {
  const baseline = analyzeArtworkColors(pixels)
  if (!baseline) throw new Error('图片没有可取色的不透明像素。')
  const current = refineArtworkPalette(pixels, baseline)
  const main = current.dominant
  const neutral = main.oklab.l < 0.3 || main.oklab.l > 0.92 || main.chroma < 0.03
  const families: Family[] = []
  let winner: Family | null = null
  let total = 0
  if (neutral) {
    const rgba: number[] = []
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] >= 128) rgba.push(pixels[i], pixels[i + 1], pixels[i + 2], 255)
    }
    total = rgba.length / 4
    const q = new palette.WuQuant(new distance.EuclideanBT709NoAlpha(), 16, 4)
    q.sample(utils.PointContainer.fromUint8Array(Uint8Array.from(rgba), total, 1))
    const buckets: Bucket[] = q.quantizeSync().getPointContainer().getPointArray().map(({ r, g, b }) => {
      const rgb = { r, g, b }, lab = rgbToOklab(rgb)
      return { rgb, lab, chroma: getOklabChroma(lab), count: 0, center: 0 }
    })
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue
      const lab = rgbToOklab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] })
      const nearest = buckets.reduce((a, b) => getOklabDistance(lab, a.lab) <= getOklabDistance(lab, b.lab) ? a : b)
      nearest.count++
      const x = i / 4 % 48, y = Math.floor(i / 4 / 48)
      if (x >= 10 && x < 38 && y >= 10 && y < 38) nearest.center++
    }
    for (const bucket of buckets.filter(b => b.count > 0 && b.chroma >= 0.06).sort((a,b) => b.count - a.count)) {
      const family = families.find(f => {
        const diff = Math.abs(Math.atan2(f.lab.b, f.lab.a) - Math.atan2(bucket.lab.b, bucket.lab.a))
        return Math.min(diff, Math.PI * 2 - diff) <= Math.PI / 6
      })
      if (!family) { families.push({ lab: { ...bucket.lab }, rgb: bucket.rgb, count: bucket.count, center: bucket.center, chroma: bucket.chroma }); continue }
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
    const eligible = families.filter(f => f.count / total >= 0.07 && f.chroma >= 0.08 && f.center / f.count >= 0.5)
    eligible.sort((a,b) => b.count * b.chroma - a.count * a.chroma)
    winner = eligible[0] ?? null
  }
  families.sort((a,b) => b.count - a.count)
  return { current, families, total, winner, patched: winner?.rgb ?? main.rgb, neutral }
}
