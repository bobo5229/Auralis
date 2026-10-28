import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { prepareSvg, deriveSvg, normalFromHeight } from './materialPipeline.mjs'
import { profiles, selectProfiles } from './profiles.mjs'

const custom = {
  id: 'new-badge',
  enamel: '#234567',
  groups: [],
  removeStrokes: [],
  gradients: { ivory: { material: 'paper', color: '#eee5d5', height: 0.6 } },
}
const svg = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 370">${content}</svg>`
const derive = (source, mode, profile = custom) =>
  deriveSvg(prepareSvg(source, profile, false).doc, profile, false, mode, 330, 370)

test('a new profile produces material and finish maps without adding its ID to the pipeline', async () => {
  const source = svg(
    '<defs><linearGradient id="new-badge-ivory"><stop stop-color="#fff"/></linearGradient></defs><rect x="10" y="10" width="40" height="40" fill="url(#new-badge-ivory)"/><rect x="70" y="10" width="40" height="40" fill="#123456"/>',
  )
  const { data, info } = await sharp(Buffer.from(derive(source, 'finish')))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const at = (x, y, c) => data[(y * info.width + x) * 4 + c]
  assert.ok(at(20, 20, 0) > 180)
  assert.equal(at(20, 20, 1), 0)
  assert.ok(at(80, 20, 0) < 80)
  assert.equal(at(80, 20, 1), 255)
})
test('unknown gradients fail instead of silently becoming enamel', () => {
  assert.throws(
    () =>
      derive(
        svg(
          '<defs><linearGradient id="new-badge-mystery"/></defs><path fill="url(#new-badge-mystery)" d="M0 0h20v20z"/>',
        ),
        'base',
      ),
    /unclassified paint/,
  )
})
test('unknown physical materials fail clearly', () => {
  const source = svg(
    '<defs><linearGradient id="new-badge-ivory"/></defs><rect width="20" height="20" fill="url(#new-badge-ivory)"/>',
  )
  assert.throws(
    () =>
      derive(source, 'base', {
        ...custom,
        gradients: { ivory: { material: 'mystery', color: '#aaa', height: 0.5 } },
      }),
    /unknown material/,
  )
  assert.throws(
    () =>
      derive(svg('<g data-new=""><rect width="20" height="20" fill="#aaa"/></g>'), 'finish', {
        ...custom,
        groups: [{ attribute: 'data-new', material: 'mystery', height: 0.5 }],
      }),
    /unknown material/,
  )
})
test('unexpanded text and external image geometry are rejected', () => {
  for (const content of ['<text>12</text>', '<image href="file:///private.png"/>'])
    assert.throws(() => prepareSvg(svg(content), custom, false), /unsupported SVG element/)
})
test('transparent holes remain open after de-lighting', async () => {
  const source = svg(
    '<path fill="#123456" fill-rule="evenodd" d="M10 10h100v100H10z M40 40v40h40V40z"/>',
  )
  const { data, info } = await sharp(Buffer.from(derive(source, 'base')))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert.equal(data[(50 * info.width + 50) * 4 + 3], 0)
  assert.equal(data[(20 * info.width + 20) * 4 + 3], 255)
})
test('height comes from semantics, not the brightness of literal paint', () => {
  const source = (color) => svg(`<rect x="10" y="10" width="40" height="40" fill="${color}"/>`)
  assert.equal(derive(source('#ffffff'), 'height'), derive(source('#000000'), 'height'))
  assert.notEqual(derive(source('#ffffff'), 'base'), derive(source('#000000'), 'base'))
})
test('flat height generates a finite forward-facing normal', async () => {
  const height = await sharp(Buffer.from(svg('<rect width="330" height="370" fill="#808080"/>')))
    .png()
    .toBuffer()
  const { data, info } = await sharp(await normalFromHeight(height, 330, 370))
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert.deepEqual(
    [...data.subarray((180 * info.width + 160) * 3, (180 * info.width + 160) * 3 + 3)],
    [128, 128, 255],
  )
})
test('the accepted sample retains its exact de-lit geometry and materials', async () => {
  const profile = profiles.find((profile) => profile.id === 'hours-100')
  const source = await readFile(
    new URL('../../demo/archive/enamel-milestone/hours/assets/hours-100.svg', import.meta.url),
    'utf8',
  )
  const prepared = prepareSvg(source, profile, false)
  const result = deriveSvg(prepared.doc, profile, false, 'base', 1320, 1480)
  const baseline = await readFile(
    new URL('../../demo/archive/enamel-milestone/glsl/assets/lit-base.svg', import.meta.url),
    'utf8',
  )
  // Serialization whitespace between elements is not badge geometry or paint.
  const compact = (svg) => svg.replace(/>\s+</g, '><').trim()
  assert.equal(compact(result), compact(baseline))
})
test('selection rejects typos and supports arbitrary subsets of the registry', () => {
  assert.throws(() => selectProfiles('days-300'), /Unknown badge/)
  assert.equal(selectProfiles('days-30,albums-live').length, 2)
  assert.equal(selectProfiles().length, profiles.length)
})
