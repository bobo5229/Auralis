import { extractArtworkPalette } from '../utils/extractArtworkPalette'

interface PaletteWorkerRequest {
  id: number
  key: string
  pixels: Uint8ClampedArray
}

self.onmessage = (event: MessageEvent<PaletteWorkerRequest>): void => {
  const { id, key, pixels } = event.data
  try {
    const palette = extractArtworkPalette(key, pixels)
    self.postMessage({ id, palette })
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
