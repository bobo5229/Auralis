import { readonly, ref, type Ref, watch } from 'vue'

interface RgbColor {
  r: number
  g: number
  b: number
}

interface WeightedColor extends RgbColor {
  weight: number
}

const paletteCache = new Map<string, RgbColor[] | null>()
const SAMPLE_SIZE = 56
const COLOR_BUCKET_SIZE = 24
const CLOSE_COLOR_DISTANCE = 42
const DISTINCT_COLOR_DISTANCE = 58
const THIRD_COLOR_DISTANCE = 72
const MIN_THIRD_WEIGHT_RATIO = 0.08

function getArtworkUrl(key: string): string {
  return `auralis-artwork://${key}`
}

function getColorDistance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load artwork for palette extraction'))
    image.src = url
  })
}

function quantizeChannel(value: number): number {
  return Math.round(value / COLOR_BUCKET_SIZE) * COLOR_BUCKET_SIZE
}

function getBucketKey(r: number, g: number, b: number): string {
  return `${quantizeChannel(r)},${quantizeChannel(g)},${quantizeChannel(b)}`
}

function mergeCloseColors(colors: WeightedColor[]): WeightedColor[] {
  const merged: WeightedColor[] = []

  for (const color of colors) {
    const existing = merged.find((item) => getColorDistance(item, color) < CLOSE_COLOR_DISTANCE)

    if (!existing) {
      merged.push({ ...color })
      continue
    }

    const nextWeight = existing.weight + color.weight
    existing.r = Math.round((existing.r * existing.weight + color.r * color.weight) / nextWeight)
    existing.g = Math.round((existing.g * existing.weight + color.g * color.weight) / nextWeight)
    existing.b = Math.round((existing.b * existing.weight + color.b * color.weight) / nextWeight)
    existing.weight = nextWeight
  }

  return merged.sort((a, b) => b.weight - a.weight)
}

function selectRepresentativeColors(colors: WeightedColor[]): RgbColor[] {
  if (colors.length === 0) return []

  const selected: WeightedColor[] = [colors[0]]

  for (const color of colors.slice(1)) {
    if (selected.length >= 2) break
    if (selected.every((item) => getColorDistance(item, color) >= DISTINCT_COLOR_DISTANCE)) {
      selected.push(color)
    }
  }

  if (selected.length < 2) {
    const fallback = colors
      .slice(1)
      .find((color) =>
        selected.every((item) => getColorDistance(item, color) >= CLOSE_COLOR_DISTANCE),
      )

    if (fallback) {
      selected.push(fallback)
    }
  }

  const totalWeight = colors.reduce((sum, color) => sum + color.weight, 0)
  const third = colors.find((color) => {
    if (selected.includes(color)) return false
    if (color.weight / totalWeight < MIN_THIRD_WEIGHT_RATIO) return false
    return selected.every((item) => getColorDistance(item, color) >= THIRD_COLOR_DISTANCE)
  })

  if (third) {
    selected.push(third)
  }

  return selected.slice(0, 3).map(({ r, g, b }) => ({ r, g, b }))
}

async function extractArtworkPalette(artworkCacheKey: string): Promise<RgbColor[] | null> {
  if (paletteCache.has(artworkCacheKey)) {
    return paletteCache.get(artworkCacheKey) ?? null
  }

  try {
    const image = await createImage(getArtworkUrl(artworkCacheKey))
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE

    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!context) {
      paletteCache.set(artworkCacheKey, null)
      return null
    }

    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
    const buckets = new Map<string, WeightedColor>()

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3]
      if (alpha < 128) continue

      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const key = getBucketKey(r, g, b)
      const existing = buckets.get(key)

      if (existing) {
        existing.r += r
        existing.g += g
        existing.b += b
        existing.weight += 1
      } else {
        buckets.set(key, {
          r,
          g,
          b,
          weight: 1,
        })
      }
    }

    const bucketColors = Array.from(buckets.values())
      .map((color) => ({
        r: Math.round(color.r / color.weight),
        g: Math.round(color.g / color.weight),
        b: Math.round(color.b / color.weight),
        weight: color.weight,
      }))
      .sort((a, b) => b.weight - a.weight)

    const palette = selectRepresentativeColors(mergeCloseColors(bucketColors))
    const result = palette.length > 0 ? palette : null
    paletteCache.set(artworkCacheKey, result)
    return result
  } catch {
    paletteCache.set(artworkCacheKey, null)
    return null
  }
}

export function useArtworkPalette(artworkCacheKey: Ref<string | null>) {
  const colors = ref<RgbColor[] | null>(null)

  watch(
    artworkCacheKey,
    async (key, _previousKey, onCleanup) => {
      let isStale = false
      onCleanup(() => {
        isStale = true
      })

      if (!key) {
        colors.value = null
        return
      }

      const nextColors = await extractArtworkPalette(key)
      if (!isStale) {
        colors.value = nextColors
      }
    },
    { immediate: true },
  )

  return {
    colors: readonly(colors),
  }
}
