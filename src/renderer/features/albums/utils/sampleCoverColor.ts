/** Reuse a one-pixel canvas while sampling an object-fit image. */
export function createCoverColorSampler(
  image: HTMLImageElement,
  fit: 'cover' | 'contain' = 'cover',
): (clientX: number, clientY: number) => string | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Cover unavailable')
  let last: { x: number; y: number; source: string; color: string | null } | null = null
  return (clientX, clientY) => {
    const rect = image.getBoundingClientRect()
    const scale = (fit === 'contain' ? Math.min : Math.max)(
      rect.width / image.naturalWidth,
      rect.height / image.naturalHeight,
    )
    const x = Math.floor(
      (clientX - rect.left + (image.naturalWidth * scale - rect.width) / 2) / scale,
    )
    const y = Math.floor(
      (clientY - rect.top + (image.naturalHeight * scale - rect.height) / 2) / scale,
    )
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Cover unavailable')
    if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) return null
    const source = image.currentSrc || image.src
    if (last?.x === x && last.y === y && last.source === source) return last.color
    context.clearRect(0, 0, 1, 1)
    context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1)
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
    // The preference stores opaque RGB; do not discard a sampled pixel's transparency.
    const color =
      alpha === 255
        ? `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
        : null
    last = { x, y, source, color }
    return color
  }
}
