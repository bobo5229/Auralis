import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
const output = new URL('./assets/', import.meta.url)
await mkdir(output, { recursive: true })
let seed = 0x41555241
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 4294967296
}
const size = 768
const heights = new Float32Array(size * size)
for (let i = 0; i < heights.length; i++) heights[i] = 0.5 + (random() - 0.5) * 0.035
for (let i = 0; i < 23000; i++) {
  const cx = random() * size,
    cy = random() * size
  const rx = 0.8 + Math.pow(random(), 1.6) * 2.7,
    ry = rx * (0.65 + random() * 0.7)
  const depth = 0.2 + random() * 0.35
  for (let py = Math.floor(cy - ry * 2); py <= cy + ry * 2; py++)
    for (let px = Math.floor(cx - rx * 2); px <= cx + rx * 2; px++) {
      const distance = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2
      if (distance < 4)
        heights[((py + size) % size) * size + ((px + size) % size)] -=
          Math.exp(-distance * 1.4) * depth
    }
}
const foam = Buffer.alloc(size * size * 3)
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const i = y * size + x
    const dx = heights[y * size + ((x + 1) % size)] - heights[y * size + ((x + size - 1) % size)]
    const dy = heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]
    const value = Math.max(
      5,
      Math.min(70, 22 + heights[i] * 29 - dx * 24 - dy * 31 + (random() - 0.5) * 2.5),
    )
    foam[i * 3] = value
    foam[i * 3 + 1] = value * 1.02
    foam[i * 3 + 2] = value * 0.99
  }
await writeFile(
  new URL('foam.png', output),
  await sharp(foam, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer(),
)
const width = 768,
  height = 256,
  brush = Buffer.alloc(width * height * 3)
const lines = Array.from({ length: height }, () => (random() - 0.5) * 38)
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const value = 128 + lines[y] + (random() - 0.5) * 13 + Math.sin(x / 130 + y * 0.7) * 3
    const i = (y * width + x) * 3
    brush[i] = value
    brush[i + 1] = value
    brush[i + 2] = value
  }
await writeFile(
  new URL('brushed-aluminium.png', output),
  await sharp(brush, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer(),
)
await writeFile(
  new URL('provenance.json', output),
  JSON.stringify(
    {
      source:
        'Procedurally authored by generate-materials.mjs; no external imagery or image editing',
      seed: '0x41555241',
      foam: {
        size: [768, 768],
        cssTile: [384, 384],
        method:
          'Periodic micro-pore height field, fixed upper-left diffuse light, matte black foam',
      },
      aluminium: {
        size: [768, 256],
        cssTile: [384, 128],
        method: 'Horizontal seeded machining variation; rough brushed grain; neutral grey overlay',
      },
    },
    null,
    2,
  ),
)
console.log('Generated deterministic foam and brushed aluminium textures')
