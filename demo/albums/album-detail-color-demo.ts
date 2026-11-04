import { analyzeArtworkColors } from '../../src/renderer/shared/artwork/artworkAnalysis'
import { oklabToRgb } from '../../src/renderer/shared/color/colorMath'

const button = document.querySelector<HTMLButtonElement>('.upload')!
const input = document.querySelector<HTMLInputElement>('input')!
const image = document.querySelector<HTMLImageElement>('.upload img')!
const center = document.querySelector<HTMLElement>('.center')!
const sides = document.querySelectorAll<HTMLElement>('.side')
let currentUrl: string | null = null
let request = 0

function applyColor(source: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0, 48, 48)
  const result = analyzeArtworkColors(context.getImageData(0, 0, 48, 48).data)
  if (!result) {
    center.style.backgroundColor = 'rgb(67 78 81)'
    sides.forEach((side) => { side.style.backgroundColor = 'rgb(40 48 51)' })
    return
  }
  const { a, b } = result.dominant.oklab
  const chroma = Math.hypot(a, b)
  const scale = Math.min(1, 0.07 / (chroma || 1))
  const color = (lightness: number) => {
    const rgb = oklabToRgb({ l: lightness, a: a * scale, b: b * scale })
    return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`
  }
  center.style.backgroundColor = color(0.48)
  sides.forEach((side) => { side.style.backgroundColor = color(0.34) })
}

button.addEventListener('click', () => input.click())
input.addEventListener('change', () => {
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const token = ++request
  const url = URL.createObjectURL(file)
  const next = new Image()
  next.onload = () => {
    if (token !== request) { URL.revokeObjectURL(url); return }
    try { applyColor(next) } catch { URL.revokeObjectURL(url); return }
    image.src = url
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = url
  }
  next.onerror = () => URL.revokeObjectURL(url)
  next.src = url
})
if (image.complete && image.naturalWidth) applyColor(image)
else image.addEventListener('load', () => { if (!currentUrl) applyColor(image) }, { once: true })
