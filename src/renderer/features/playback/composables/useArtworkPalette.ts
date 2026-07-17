import { readonly, ref, type Ref, watch } from 'vue'
import type { ArtworkPalette } from '../types'
import { FALLBACK_PALETTE } from '../utils/extractArtworkPalette'
import { extractArtworkPaletteInWorker } from '../utils/artworkPaletteWorkerClient'

type PaletteCacheEntry =
  | { state: 'pending'; promise: Promise<ArtworkPalette> }
  | { state: 'resolved'; value: ArtworkPalette }
  | { state: 'failed'; retryAfter: number }

const SAMPLE_SIZE = 48
const CACHE_LIMIT = 100
const FAILURE_RETRY_MS = 30_000
const paletteCache = new Map<string, PaletteCacheEntry>()

function getArtworkUrl(key: string): string {
  return `auralis-artwork://${key}`
}

function touchCacheEntry(key: string, entry: PaletteCacheEntry): void {
  paletteCache.delete(key)
  paletteCache.set(key, entry)
  while (paletteCache.size > CACHE_LIMIT) {
    const oldestKey = paletteCache.keys().next().value
    if (!oldestKey) break
    paletteCache.delete(oldestKey)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Required when webSecurity is on and artwork is served via auralis-artwork://
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load artwork for palette extraction'))
    image.src = url
  })
}

async function calculateArtworkPalette(key: string): Promise<ArtworkPalette> {
  const image = await loadImage(getArtworkUrl(key))
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE

  const context = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  })
  if (!context) throw new Error('Unable to create palette extraction canvas')

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  return extractArtworkPaletteInWorker(key, pixels)
}

function getArtworkPalette(key: string): Promise<ArtworkPalette> {
  const cached = paletteCache.get(key)
  if (cached?.state === 'resolved') {
    touchCacheEntry(key, cached)
    return Promise.resolve(cached.value)
  }
  if (cached?.state === 'pending') return cached.promise
  if (cached?.state === 'failed' && cached.retryAfter > Date.now()) {
    return Promise.resolve({ ...FALLBACK_PALETTE, key })
  }

  const promise = calculateArtworkPalette(key)
    .then((value) => {
      touchCacheEntry(key, { state: 'resolved', value })
      return value
    })
    .catch((error: unknown) => {
      console.warn('[Auralis fluid background] Artwork palette extraction failed', {
        key: key.slice(0, 8),
        error,
      })
      touchCacheEntry(key, { state: 'failed', retryAfter: Date.now() + FAILURE_RETRY_MS })
      return { ...FALLBACK_PALETTE, key }
    })

  touchCacheEntry(key, { state: 'pending', promise })
  return promise
}

export function useArtworkPalette(artworkCacheKey: Ref<string | null>) {
  const palette = ref<ArtworkPalette>(FALLBACK_PALETTE)
  let requestToken = 0

  watch(
    artworkCacheKey,
    async (key) => {
      const token = ++requestToken
      if (!key) {
        palette.value = FALLBACK_PALETTE
        return
      }

      const nextPalette = await getArtworkPalette(key)
      if (token === requestToken) palette.value = nextPalette
    },
    { immediate: true },
  )

  return {
    palette: readonly(palette),
  }
}
