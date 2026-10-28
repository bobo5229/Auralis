/**
 * Apple-style liquid glass refraction for one element.
 *
 * Port of deepika-builds/liquid-glass (MIT, Copyright (c) 2026 Deepika Rao).
 * The displacement map, SVG filter and backdrop-filter wiring are unchanged.
 * This module replaces the browser global with an export.
 *
 * Technique per https://aave.com/design/building-glass-for-the-web and
 * https://github.com/rizroze/liquid-glass
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

export const LIQUID_GLASS_DEFAULTS = {
  scale: -112,
  chroma: 6,
  border: 0.07,
  mapBlur: 12,
  blur: 3,
  saturate: 1.5,
  radius: null as number | null,
  fallbackBlur: 16,
}

export interface LiquidGlassOptions {
  scale?: number
  chroma?: number
  border?: number
  mapBlur?: number
  blur?: number
  saturate?: number
  radius?: number | null
  fallbackBlur?: number
}

export interface LiquidGlassHandle {
  supported: boolean
  refresh: () => void
  destroy: () => void
}

let uid = 0
let svgDefs: SVGDefsElement | null = null

function refractionSupported(): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof CSS === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return false
  }
  const ua = navigator.userAgent
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)
  const isFirefox = /Firefox/.test(ua)
  if (isSafari || isFirefox) return false
  if (!CSS.supports('backdrop-filter', 'url(#lg)')) return false
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const context = canvas.getContext('2d')
    context?.getImageData(0, 0, 1, 1)
    return context !== null
  } catch {
    return false
  }
}

const supported = refractionSupported()

function ensureDefs(): SVGDefsElement {
  if (svgDefs) return svgDefs
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  svgDefs = document.createElementNS(SVG_NS, 'defs')
  svg.appendChild(svgDefs)
  document.body.appendChild(svg)
  return svgDefs
}

function makeMap(
  width: number,
  height: number,
  radius: number,
  border: number,
  mapBlur: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const horizontal = ctx.createLinearGradient(0, 0, width, 0)
  horizontal.addColorStop(0, 'rgb(0,0,0)')
  horizontal.addColorStop(1, 'rgb(255,0,0)')
  ctx.fillStyle = horizontal
  ctx.fillRect(0, 0, width, height)

  const vertical = ctx.createLinearGradient(0, 0, 0, height)
  vertical.addColorStop(0, 'rgb(0,0,0)')
  vertical.addColorStop(1, 'rgb(0,0,255)')
  ctx.globalCompositeOperation = 'difference'
  ctx.fillStyle = vertical
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'source-over'
  const inset = border * Math.min(width, height)
  ctx.filter = `blur(${mapBlur}px)`
  ctx.fillStyle = 'rgba(128,128,128,0.93)'
  ctx.beginPath()
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, Math.max(radius - inset, 2))
  ctx.fill()
  ctx.filter = 'none'
  return canvas.toDataURL()
}

function buildFilter(
  id: string,
  scales: number[],
): { filter: SVGFilterElement; feImage: SVGFEImageElement } {
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  const feImage = document.createElementNS(SVG_NS, 'feImage')
  feImage.setAttribute('x', '0')
  feImage.setAttribute('y', '0')
  feImage.setAttribute('result', 'map')
  feImage.setAttribute('preserveAspectRatio', 'none')
  filter.appendChild(feImage)

  const keep = [
    '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
  ]
  const channels: string[] = []
  for (let index = 0; index < 3; index += 1) {
    const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap')
    displacement.setAttribute('in', 'SourceGraphic')
    displacement.setAttribute('in2', 'map')
    displacement.setAttribute('scale', String(scales[index]))
    displacement.setAttribute('xChannelSelector', 'R')
    displacement.setAttribute('yChannelSelector', 'B')
    displacement.setAttribute('result', `d${index}`)
    filter.appendChild(displacement)

    const matrix = document.createElementNS(SVG_NS, 'feColorMatrix')
    matrix.setAttribute('in', `d${index}`)
    matrix.setAttribute('type', 'matrix')
    matrix.setAttribute('values', keep[index] ?? '')
    matrix.setAttribute('result', `c${index}`)
    filter.appendChild(matrix)
    channels.push(`c${index}`)
  }

  const firstBlend = document.createElementNS(SVG_NS, 'feBlend')
  firstBlend.setAttribute('in', channels[0] ?? '')
  firstBlend.setAttribute('in2', channels[1] ?? '')
  firstBlend.setAttribute('mode', 'screen')
  firstBlend.setAttribute('result', 'c01')
  filter.appendChild(firstBlend)

  const secondBlend = document.createElementNS(SVG_NS, 'feBlend')
  secondBlend.setAttribute('in', 'c01')
  secondBlend.setAttribute('in2', channels[2] ?? '')
  secondBlend.setAttribute('mode', 'screen')
  filter.appendChild(secondBlend)

  ensureDefs().appendChild(filter)
  return { filter, feImage }
}

function resolveRadius(
  element: HTMLElement,
  width: number,
  height: number,
  override: number | null,
): number {
  if (override != null) return override
  const raw = getComputedStyle(element).borderTopLeftRadius || '0px'
  const value = Number.parseFloat(raw) || 0
  return raw.trim().endsWith('%') ? (value / 100) * Math.min(width, height) : value
}

export function liquidGlass(element: HTMLElement, options?: LiquidGlassOptions): LiquidGlassHandle {
  const resolved = { ...LIQUID_GLASS_DEFAULTS, ...options }
  if (!supported) {
    const frosted = `blur(${resolved.fallbackBlur}px) saturate(${resolved.saturate})`
    element.style.backdropFilter = frosted
    element.style.setProperty('-webkit-backdrop-filter', frosted)
    element.classList.add('lg-fallback')
    return {
      supported: false,
      refresh: () => {},
      destroy: () => {
        element.style.backdropFilter = ''
        element.style.removeProperty('-webkit-backdrop-filter')
        element.classList.remove('lg-fallback')
      },
    }
  }

  const id = `lg-filter-${++uid}`
  const scales = [
    resolved.scale,
    resolved.scale + resolved.chroma,
    resolved.scale + 2 * resolved.chroma,
  ]
  const parts = buildFilter(id, scales)

  function refresh(): void {
    const width = element.offsetWidth
    const height = element.offsetHeight
    if (!width || !height) return
    const radius = resolveRadius(element, width, height, resolved.radius)
    parts.feImage.setAttribute(
      'href',
      makeMap(width, height, radius, resolved.border, resolved.mapBlur),
    )
    parts.feImage.setAttribute('width', String(width))
    parts.feImage.setAttribute('height', String(height))
  }

  refresh()
  element.style.backdropFilter = `url(#${id}) blur(${resolved.blur}px) saturate(${resolved.saturate})`

  let timer: ReturnType<typeof setTimeout> | null = null
  const observer = new ResizeObserver(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(refresh, 120)
  })
  observer.observe(element)

  return {
    supported: true,
    refresh,
    destroy: () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
      parts.filter.remove()
      element.style.backdropFilter = ''
    },
  }
}
