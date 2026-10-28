import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { DOMParser } from '@xmldom/xmldom'

const manifest = JSON.parse(
  await readFile(new URL('assets/manifest.json', import.meta.url), 'utf8'),
)
assert.equal(Object.keys(manifest.sourceAssetHashes).length, 44)
for (const [path, expected] of Object.entries(manifest.sourceAssetHashes)) {
  const bytes = await readFile(new URL(`../${path}`, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path)
}
for (const [state, maps] of Object.entries(manifest.states)) {
  for (const [kind, path] of Object.entries(maps)) {
    const image = sharp(fileURLToPath(new URL(path, import.meta.url)))
    const meta = await image.metadata()
    assert.equal(meta.width, 1320, path)
    assert.equal(meta.height, 1480, path)
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    if (['base', 'material', 'height'].includes(kind)) {
      const corners = [
        0,
        info.width - 1,
        (info.height - 1) * info.width,
        info.width * info.height - 1,
      ]
      for (const i of corners) assert.equal(data[i * 4 + 3], 0, `${path}: corner alpha`)
      assert.ok(
        data.some((value, i) => i % 4 === 3 && value === 255),
        `${path}: empty image`,
      )
    }
    if (kind === 'material') {
      const totals = [0, 0, 0]
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 3] > 200) for (let c = 0; c < 3; c++) totals[c] += data[i + c]
      assert.ok(totals[0] > 100000, 'silver mask missing')
      if (state === 'lit') {
        assert.ok(totals[1] > 100000, 'enamel mask missing')
        assert.ok(totals[2] > 100000, 'opal mask missing')
      } else {
        assert.equal(totals[1], 0)
        assert.equal(totals[2], 0)
      }
    }
  }
  const source = await readFile(new URL(`assets/${state}-base.svg`, import.meta.url), 'utf8')
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  assert.equal(doc.getElementsByTagName('linearGradient').length, 0)
  assert.equal(doc.getElementsByTagName('radialGradient').length, 0)
  assert.equal(doc.getElementsByTagName('script').length, 0)
  assert.doesNotMatch(source, /class="sheen"|url\(#[^)]*(?:gloss|pool)/)
  const ids = new Set(Array.from(source.matchAll(/\bid="([^"]+)"/g), (m) => m[1]))
  for (const match of source.matchAll(/url\(#([^)]+)\)/g))
    assert.ok(ids.has(match[1]), `Missing ${match[1]}`)
}
console.log(
  'Passed: 44 source hashes; two material sets; dimensions, transparent corners, material coverage and de-lit SVG references.',
)
