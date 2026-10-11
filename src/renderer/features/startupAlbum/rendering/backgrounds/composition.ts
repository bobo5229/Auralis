import { cardLayout } from '../cardLayout'

// Separate broad colour from fine detail. Lettering keeps the local surface
// colour while sharp motifs fade into its blurred counterpart; this avoids
// dark panels or flat stripes. Side rails retain the original crisp detail.
export function composePattern(
  c: CanvasRenderingContext2D,
  draw: (pattern: CanvasRenderingContext2D) => void,
) {
  const { width, height, header, footer } = cardLayout
  const scale = c.canvas.width / width
  const layer = document.createElement('canvas')
  layer.width = c.canvas.width
  layer.height = Math.round(height * scale)
  const pattern = layer.getContext('2d')!
  pattern.scale(scale, scale)
  pattern.drawImage(c.canvas, 0, 0, width, height)
  pattern.save()
  draw(pattern)
  pattern.restore()

  c.save()
  c.filter = `blur(${20 * scale}px)`
  c.drawImage(layer, 0, 0, width, height)
  c.restore()

  const mask = document.createElement('canvas')
  mask.width = layer.width
  mask.height = layer.height
  const m = mask.getContext('2d')!
  m.scale(scale, scale)
  m.fillStyle = '#fff'
  m.fillRect(0, 0, width, height)
  m.globalCompositeOperation = 'destination-out'
  for (const band of [header, footer]) {
    const fade = 30
    const gradient = m.createLinearGradient(0, band.y - fade, 0, band.y + band.height + fade)
    gradient.addColorStop(0, '#ffffff00')
    gradient.addColorStop(fade / (band.height + fade * 2), '#ffffffe6')
    gradient.addColorStop(1 - fade / (band.height + fade * 2), '#ffffffe6')
    gradient.addColorStop(1, '#ffffff00')
    m.fillStyle = gradient
    m.fillRect(0, band.y - fade, width, band.height + fade * 2)
  }
  m.globalCompositeOperation = 'source-over'
  const edges = m.createLinearGradient(0, 0, width, 0)
  for (const [x, alpha] of [
    [0, 1],
    [24, 0.9],
    [44, 0.45],
    [76, 0],
    [width - 76, 0],
    [width - 44, 0.45],
    [width - 24, 0.9],
    [width, 1],
  ])
    edges.addColorStop(x / width, `rgba(255,255,255,${alpha})`)
  m.fillStyle = edges
  m.fillRect(0, 0, width, height)
  pattern.globalCompositeOperation = 'destination-in'
  pattern.drawImage(mask, 0, 0, width, height)
  c.drawImage(layer, 0, 0, width, height)
}
