import { buildPaletteSync, utils } from 'image-q'
import { converter, formatHex } from 'culori'

const rgb = converter('rgb'),
  linear = converter('lrgb'),
  lab = converter('oklab')

export function makePalette(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  return entries.map((entry) => {
    const color = rgb(entry.color),
      light = linear(color)
    return {
      color: formatHex(color),
      linear: [light.r, light.g, light.b],
      weight: entry.weight / total,
    }
  })
}

export async function paletteFromFile(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 48
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#f2f0e8'
    ctx.fillRect(0, 0, 48, 48)
    ctx.drawImage(bitmap, 0, 0, 48, 48)
    const pixels = ctx.getImageData(0, 0, 48, 48)
    const pointContainer = utils.PointContainer.fromImageData(pixels)
    const palette = buildPaletteSync([pointContainer], {
      colors: 6,
      paletteQuantization: 'wuquant',
      colorDistanceFormula: 'euclidean-bt709',
    })
    const entries = palette
      .getPointContainer()
      .getPointArray()
      .map((point) => {
        const color = { mode: 'rgb', r: point.r / 255, g: point.g / 255, b: point.b / 255 }
        return { color, lab: lab(color), weight: 0 }
      })
    // Recover coverage in perceptual space so a small accent cannot dominate the background.
    for (let i = 0; i < pixels.data.length; i += 4) {
      const sample = lab({
        mode: 'rgb',
        r: pixels.data[i] / 255,
        g: pixels.data[i + 1] / 255,
        b: pixels.data[i + 2] / 255,
      })
      let nearest = 0,
        distance = Infinity
      entries.forEach((entry, index) => {
        const delta =
          (entry.lab.l - sample.l) ** 2 +
          (entry.lab.a - sample.a) ** 2 +
          (entry.lab.b - sample.b) ** 2
        if (delta < distance) {
          distance = delta
          nearest = index
        }
      })
      entries[nearest].weight++
    }
    return makePalette(
      entries.filter((entry) => entry.weight > 0).sort((a, b) => b.weight - a.weight),
    )
  } finally {
    bitmap.close()
  }
}
