import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import sharp from 'sharp'

const directory = new URL('./', import.meta.url)
const output = new URL('assets/', directory)
const width = 1320
const height = 1480
const scale = 4
const serializer = new XMLSerializer()
const geometry = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'])
const silver = new Set(['#e6f5f1', '#d6e5df', '#9ba7ad', '#a8b1b4', '#b9c1c3'])
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const elements = (node) => Array.from(node.childNodes).filter((child) => child.nodeType === 1)
const parse = (source) =>
  new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`)
    },
  }).parseFromString(source, 'image/svg+xml')

// This adapter deliberately targets the two restored hours-100 SVGs. It does not
// guess surface height from the luminance of the original, already lit artwork.
function prepare(source, unlit) {
  const doc = parse(source)
  const root = doc.documentElement
  let layer = 0
  for (const node of elements(root)) {
    if (node.tagName === 'defs') {
      const gradient = elements(node).find((child) => /-metal\d$/.test(child.getAttribute('id')))
      if (gradient) layer = Number(gradient.getAttribute('id').slice(-1))
    } else node.setAttribute('data-layer', String(layer))
  }
  const removed = []
  function clean(node) {
    const fill = node.getAttribute('fill')
    const stroke = node.getAttribute('stroke')
    const transform = node.getAttribute('transform')
    const clip = node.getAttribute('clip-path')
    const remove =
      /-(gloss|pool)\d/.test(fill) ||
      /-clip4\)/.test(clip) ||
      node.getAttribute('class') === 'sheen' ||
      (node.tagName === 'ellipse' && fill === '#f0fff4') ||
      (stroke === '#8ee5ff' && node.getAttribute('opacity') !== '.13') ||
      (/-bevel3\)/.test(stroke) && transform === 'translate(-.45 -.6)') ||
      (unlit && ['#a8b1b4', '#78858c'].includes(stroke))
    if (remove) {
      removed.push(`${node.tagName}:${fill || stroke || clip}`)
      node.parentNode.removeChild(node)
      return
    }
    if (/-contact\d\)/.test(node.getAttribute('filter'))) {
      // Keep contact occlusion, centered under the geometry, without a baked light direction.
      node.setAttribute('data-occlusion', 'true')
      node.removeAttribute('transform')
    }
    if (node.getAttribute('filter') && (fill === 'none' || node.tagName === 'path'))
      node.setAttribute('data-occlusion', 'true')
    if (node.tagName !== 'defs') for (const child of elements(node)) clean(child)
  }
  for (const node of elements(root)) if (node.tagName !== 'defs') clean(node)
  return { doc, removed }
}

function surface(paint, context, unlit) {
  if (paint === 'none') return null
  if (unlit)
    return {
      kind: 0,
      color: /-(rim|bevel|stamp)\)/.test(paint) || silver.has(paint) ? '#89939b' : '#424b53',
      height: /-well\)/.test(paint) ? 0.27 : /-stamp\)/.test(paint) ? 0.64 : 0.48,
    }
  if (/-opal\d\)/.test(paint) || context.opal)
    return { kind: 2, color: /url\(/.test(paint) ? '#9fbfc9' : paint, height: 0.39 }
  if (/-metal\d\)|-bevel\d\)/.test(paint) || silver.has(paint)) {
    return { kind: 0, color: '#aeb9c2', height: context.layer === 3 ? 0.73 : 0.53 }
  }
  if (/-enamel\d\)/.test(paint))
    return {
      kind: 1,
      color: context.layer === 2 ? '#164c82' : '#1965a0',
      height: context.layer === 2 ? 0.34 : 0.27,
    }
  return { kind: 1, color: paint, height: context.layer === 2 ? 0.33 : 0.27 }
}

function derive(prepared, mode, unlit) {
  const doc = prepared.cloneNode(true)
  const root = doc.documentElement
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  if (mode === 'ao') {
    const white = doc.createElement('rect')
    white.setAttribute('width', '330')
    white.setAttribute('height', '370')
    white.setAttribute('fill', '#fff')
    root.insertBefore(white, root.firstChild)
  }
  function visit(node, inherited) {
    if (node.tagName === 'defs' || ['title', 'desc'].includes(node.tagName)) return
    const context = { ...inherited }
    for (const key of ['fill', 'stroke'])
      if (node.hasAttribute(key)) context[key] = node.getAttribute(key)
    if (node.hasAttribute('data-layer')) context.layer = Number(node.getAttribute('data-layer'))
    if (/-completion-ring\)/.test(node.getAttribute('clip-path'))) context.opal = true
    if (node.hasAttribute('data-occlusion')) context.occlusion = true
    if (geometry.has(node.tagName)) {
      if (mode === 'ao') {
        if (!context.occlusion) {
          node.parentNode.removeChild(node)
          return
        }
        for (const key of ['fill', 'stroke'])
          node.setAttribute(key, context[key] === 'none' ? 'none' : '#89939b')
      } else {
        if (context.occlusion) {
          node.parentNode.removeChild(node)
          return
        }
        node.removeAttribute('filter')
        for (const key of ['fill', 'stroke']) {
          const material = surface(context[key], context, unlit)
          if (!material) {
            node.setAttribute(key, 'none')
            continue
          }
          let color = material.color
          if (mode === 'material') color = ['#ff0000', '#00ff00', '#0000ff'][material.kind]
          if (mode === 'height') {
            const value = Math.round(material.height * 255)
              .toString(16)
              .padStart(2, '0')
            color = `#${value}${value}${value}`
          }
          node.setAttribute(key, color)
        }
      }
    }
    if (mode !== 'ao') node.removeAttribute('filter')
    // Material and height are coverage maps; foil opacity belongs only in albedo.
    if (mode === 'material' || mode === 'height') {
      node.removeAttribute('opacity')
      node.removeAttribute('fill-opacity')
      node.removeAttribute('stroke-opacity')
    }
    for (const child of elements(node)) visit(child, context)
    if (!geometry.has(node.tagName)) {
      node.removeAttribute('fill')
      node.removeAttribute('stroke')
    }
    node.removeAttribute('data-layer')
    node.removeAttribute('data-occlusion')
  }
  for (const node of elements(root)) {
    if (mode === 'ao' && node === root.firstChild) continue
    visit(node, { fill: '#000000', stroke: 'none', layer: 0, opal: false, occlusion: false })
  }
  // All appearance gradients are replaced; retain only referenced geometry clips and blur filters.
  for (const defs of Array.from(doc.getElementsByTagName('defs'))) {
    for (const node of elements(defs))
      if (['linearGradient', 'radialGradient'].includes(node.tagName)) defs.removeChild(node)
  }
  return serializer.serializeToString(doc)
}

await mkdir(output, { recursive: true })
const manifest = { version: 1, width, height, sources: {}, states: {}, sourceAssetHashes: {} }
// Freeze all 44 restored assets in the provenance record, not just the sample.
for (const series of ['hours', 'days', 'albums']) {
  const sourceDir = new URL(`../${series}/assets/`, directory)
  for (const file of (await readdir(sourceDir)).sort()) {
    if (/\.(svg|png)$/.test(file))
      manifest.sourceAssetHashes[`${series}/assets/${file}`] = sha(
        await readFile(new URL(file, sourceDir)),
      )
  }
}
for (const state of ['lit', 'unlit']) {
  const unlit = state === 'unlit'
  const sourcePath = `../hours/assets/hours-100${unlit ? '-unlit' : ''}.svg`
  const source = await readFile(new URL(sourcePath, directory), 'utf8')
  const { doc, removed } = prepare(source, unlit)
  manifest.sources[state] = { path: sourcePath, sha256: sha(source), removed }
  const paths = {}
  let heightBuffer
  for (const mode of ['base', 'material', 'height', 'ao']) {
    const svg = derive(doc, mode, unlit)
    if (
      /url\(#[^)]*(?:gloss|pool|metal\d|bevel\d|enamel\d|opal\d|unlit-(?:well|rim|stamp|bevel))/.test(
        svg,
      )
    )
      throw new Error(`Baked appearance remained in ${state}/${mode}`)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const file = `${state}-${mode}.png`
    await writeFile(new URL(file, output), png)
    paths[mode] = `assets/${file}`
    if (mode === 'base') await writeFile(new URL(`${state}-base.svg`, output), svg)
    if (mode === 'height') heightBuffer = png
  }
  const fineBuffer = await sharp(heightBuffer)
    .flatten({ background: '#444' })
    .greyscale()
    .blur({ sigma: 2.1, precision: 'float' })
    .raw({ depth: 'float' })
    .toBuffer()
  const broadBuffer = await sharp(heightBuffer)
    .flatten({ background: '#444' })
    .greyscale()
    .blur({ sigma: 10, precision: 'float' })
    .raw({ depth: 'float' })
    .toBuffer()
  // Differentiate floating-point height, not an 8-bit blurred PNG. Quantizing
  // before differentiation creates contour bands in the specular reflection.
  const data = new Float32Array(fineBuffer.buffer, fineBuffer.byteOffset, fineBuffer.length / 4)
  const broad = new Float32Array(broadBuffer.buffer, broadBuffer.byteOffset, broadBuffer.length / 4)
  const normals = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (xx, yy) =>
        data[Math.max(0, Math.min(height - 1, yy)) * width + Math.max(0, Math.min(width - 1, xx))] /
        255
      const broadAt = (xx, yy) =>
        broad[
          Math.max(0, Math.min(height - 1, yy)) * width + Math.max(0, Math.min(width - 1, xx))
        ] / 255
      const nx =
        -((at(x + 1, y) - at(x - 1, y)) * 2 + (broadAt(x + 1, y) - broadAt(x - 1, y)) * 3.8) * scale
      const ny =
        ((at(x, y + 1) - at(x, y - 1)) * 2 + (broadAt(x, y + 1) - broadAt(x, y - 1)) * 3.8) * scale
      const length = Math.hypot(nx, ny, 1)
      const index = (y * width + x) * 3
      normals[index] = Math.round(((nx / length) * 0.5 + 0.5) * 255)
      normals[index + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255)
      normals[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
    }
  paths.normal = `assets/${state}-normal.png`
  await sharp(normals, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(fileURLToPath(new URL(paths.normal, directory)))
  manifest.states[state] = paths
}
await writeFile(new URL('manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  `Generated two deterministic material sets (${width} × ${height}); ${Object.keys(manifest.sourceAssetHashes).length} source assets recorded.`,
)
