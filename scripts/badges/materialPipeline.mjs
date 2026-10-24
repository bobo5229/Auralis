import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import sharp from 'sharp'
import { materials } from './profiles.mjs'

const geometry = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'])
const silverPaints = new Set(['#e6f5f1', '#d6e5df', '#9ba7ad', '#a8b1b4', '#b9c1c3'])
const elements = (node) => Array.from(node.childNodes).filter((child) => child.nodeType === 1)
const serializer = new XMLSerializer()
const reference = (value) => /^url\(#([^)]*)\)$/.exec(value)?.[1]
const parse = (source) =>
  new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`)
    },
  }).parseFromString(source, 'image/svg+xml')

export function prepareSvg(source, profile, unlit) {
  const doc = parse(source)
  const root = doc.documentElement
  if (root.getAttribute('viewBox') !== '0 0 330 370')
    throw new Error(`${profile.id}: expected a 330 × 370 badge viewBox`)
  for (const tag of ['script', 'image', 'text', 'use', 'foreignObject', 'style'])
    if (doc.getElementsByTagName(tag).length)
      throw new Error(
        `${profile.id}: unsupported SVG element ${tag}; expand it to explicit geometry first`,
      )
  const gradients = [
    ...Array.from(doc.getElementsByTagName('linearGradient')),
    ...Array.from(doc.getElementsByTagName('radialGradient')),
  ]
  const stageIds = gradients
    .map((node) => node.getAttribute('id'))
    .filter((id) => /-metal[^)]*\d$/.test(id))
  const finalSheen = stageIds.at(-1)?.replace('-metal', '-clip')
  let layer = 0
  for (const node of elements(root)) {
    if (node.tagName === 'defs') {
      const gradient = elements(node).find((child) =>
        /-metal[^)]*\d$/.test(child.getAttribute('id')),
      )
      if (gradient) layer = Number(gradient.getAttribute('id').slice(-1))
    } else node.setAttribute('data-layer', String(layer))
  }
  const removed = []
  function clean(node) {
    const fill = node.getAttribute('fill'),
      stroke = node.getAttribute('stroke')
    const clip = reference(node.getAttribute('clip-path'))
    const transform = node.getAttribute('transform')
    const thinHighlight =
      profile.removeStrokes.includes(stroke) &&
      node.getAttribute('opacity') !== '.13' &&
      node.getAttribute('fill') === 'none'
    const remove =
      /-(gloss|pool)/.test(fill) ||
      (finalSheen && clip === finalSheen) ||
      node.getAttribute('class') === 'sheen' ||
      (profile.preserveBaseline &&
        ((node.tagName === 'ellipse' && fill === '#f0fff4') ||
          (stroke === '#8ee5ff' && node.getAttribute('opacity') !== '.13') ||
          (/-bevel3\)/.test(stroke) && transform === 'translate(-.45 -.6)'))) ||
      (!profile.preserveBaseline && (thinHighlight || (transform && /-bevel/.test(stroke)))) ||
      (unlit && ['#a8b1b4', '#78858c'].includes(stroke))
    if (remove) {
      removed.push(`${node.tagName}:${fill || stroke || clip}`)
      node.parentNode.removeChild(node)
      return
    }
    if (/-contact/.test(node.getAttribute('filter'))) {
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

function baselineSurface(paint, context, unlit) {
  if (unlit)
    return {
      kind: 0,
      color: /-(rim|bevel|stamp)\)/.test(paint) || silverPaints.has(paint) ? '#89939b' : '#424b53',
      height: /-well\)/.test(paint) ? 0.27 : /-stamp\)/.test(paint) ? 0.64 : 0.48,
    }
  if (/-opal\d\)/.test(paint) || context.opal)
    return { kind: 2, color: /url\(/.test(paint) ? '#9fbfc9' : paint, height: 0.39 }
  if (/-metal\d\)|-bevel\d\)/.test(paint) || silverPaints.has(paint))
    return { kind: 0, color: '#aeb9c2', height: context.layer === 3 ? 0.73 : 0.53 }
  if (/-enamel\d\)/.test(paint))
    return {
      kind: 1,
      color: context.layer === 2 ? '#164c82' : '#1965a0',
      height: context.layer === 2 ? 0.34 : 0.27,
    }
  return { kind: 1, color: paint, height: context.layer === 2 ? 0.33 : 0.27 }
}

function surface(paint, context, profile, unlit) {
  if (paint === 'none') return null
  if (profile.preserveBaseline) {
    const value = baselineSurface(paint, context, unlit)
    return {
      ...value,
      roughness: unlit ? 0.65 : profile.roughness[value.kind],
      coat: value.kind === 0 ? 0 : 1,
    }
  }
  if (unlit)
    return {
      kind: 0,
      color: /-(rim|bevel|stamp)\)/.test(paint) || silverPaints.has(paint) ? '#89939b' : '#424b53',
      height: /-well\)/.test(paint) ? 0.27 : /-stamp\)/.test(paint) ? 0.64 : 0.48,
      roughness: 0.65,
      coat: 0,
    }
  const id = reference(paint)
  const key = id?.replace(`${profile.id}-`, '')
  let value
  if (key && profile.gradients[key]) {
    const override = profile.gradients[key]
    if (!materials[override.material])
      throw new Error(`${profile.id}: unknown material ${override.material}`)
    value = { ...materials[override.material], ...override }
  } else if ((id && /-opal/.test(id)) || context.opal)
    value = { ...materials.opal, color: id ? materials.opal.color : paint, height: 0.39 }
  else if ((id && /-(metal|bevel)/.test(id)) || silverPaints.has(paint))
    value = { ...materials.silver, height: context.layer >= 2 ? 0.68 : 0.53 }
  else if (id && /-enamel/.test(id))
    value = { ...materials.enamel, color: profile.enamel, height: context.layer >= 2 ? 0.37 : 0.27 }
  else if (id) throw new Error(`${profile.id}: unclassified paint ${id}`)
  else if (/^#[a-f\d]{3,8}$/i.test(paint)) {
    value = {
      ...materials[context.material || 'enamel'],
      color: paint,
      height: context.height ?? (context.layer >= 2 ? 0.47 : 0.27),
    }
  } else throw new Error(`${profile.id}: unsupported paint ${paint}`)
  return value
}

export function deriveSvg(prepared, profile, unlit, mode, width, height) {
  const doc = prepared.cloneNode(true),
    root = doc.documentElement
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
    const clip = node.getAttribute('clip-path') || ''
    if (
      /-completion-ring\)/.test(clip) ||
      profile.opalClips?.some((suffix) => clip.includes(`${profile.id}-${suffix}`))
    )
      context.opal = true
    for (const rule of profile.groups)
      if (node.hasAttribute(rule.attribute)) {
        if (!materials[rule.material])
          throw new Error(`${profile.id}: unknown material ${rule.material}`)
        context.material = rule.material
        context.height = rule.height
      }
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
          const value = surface(context[key], context, profile, unlit)
          if (!value) {
            node.setAttribute(key, 'none')
            continue
          }
          let color = value.color
          if (mode === 'material') color = ['#ff0000', '#00ff00', '#0000ff'][value.kind]
          if (mode === 'height') {
            const v = Math.round(value.height * 255)
              .toString(16)
              .padStart(2, '0')
            color = `#${v}${v}${v}`
          }
          if (mode === 'finish')
            color = `#${Math.round(value.roughness * 255)
              .toString(16)
              .padStart(2, '0')}${Math.round(value.coat * 255)
              .toString(16)
              .padStart(2, '0')}00`
          node.setAttribute(key, color)
        }
      }
    }
    if (mode !== 'ao') node.removeAttribute('filter')
    if (['material', 'height', 'finish'].includes(mode))
      for (const key of ['opacity', 'fill-opacity', 'stroke-opacity']) node.removeAttribute(key)
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
  for (const defs of Array.from(doc.getElementsByTagName('defs')))
    for (const node of elements(defs))
      if (['linearGradient', 'radialGradient'].includes(node.tagName)) defs.removeChild(node)
  const result = serializer.serializeToString(doc)
  const ids = new Set(Array.from(result.matchAll(/\bid="([^"]+)"/g), (match) => match[1]))
  for (const match of result.matchAll(/url\(#([^)]+)\)/g))
    if (!ids.has(match[1])) throw new Error(`${profile.id}/${mode}: unresolved ${match[1]}`)
  return result
}

export async function normalFromHeight(heightBuffer, width, height) {
  const scale = width / 330
  const fineBuffer = await sharp(heightBuffer)
    .flatten({ background: '#444' })
    .greyscale()
    .blur({ sigma: (2.1 * scale) / 4, precision: 'float' })
    .raw({ depth: 'float' })
    .toBuffer()
  const broadBuffer = await sharp(heightBuffer)
    .flatten({ background: '#444' })
    .greyscale()
    .blur({ sigma: (10 * scale) / 4, precision: 'float' })
    .raw({ depth: 'float' })
    .toBuffer()
  const fine = new Float32Array(fineBuffer.buffer, fineBuffer.byteOffset, fineBuffer.length / 4)
  const broad = new Float32Array(broadBuffer.buffer, broadBuffer.byteOffset, broadBuffer.length / 4)
  const normals = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const left = y * width + Math.max(0, x - 1),
        right = y * width + Math.min(width - 1, x + 1)
      const top = Math.max(0, y - 1) * width + x,
        bottom = Math.min(height - 1, y + 1) * width + x
      const nx =
        -(
          (fine[right] / 255 - fine[left] / 255) * 2 +
          (broad[right] / 255 - broad[left] / 255) * 3.8
        ) * scale
      const ny =
        ((fine[bottom] / 255 - fine[top] / 255) * 2 +
          (broad[bottom] / 255 - broad[top] / 255) * 3.8) *
        scale
      const length = Math.hypot(nx, ny, 1),
        i = (y * width + x) * 3
      normals[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255)
      normals[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255)
      normals[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
    }
  return sharp(normals, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}
