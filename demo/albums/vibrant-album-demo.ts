import { vibrantAlbumColors } from './vibrant-album-colors'

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
  const result = vibrantAlbumColors(context.getImageData(0, 0, 48, 48).data)
  const css = (c: { r: number; g: number; b: number }) => `rgb(${c.r} ${c.g} ${c.b})`
  center.style.backgroundColor = result ? css(result.main) : 'rgb(67 78 81)'
  sides.forEach((side) => {
    side.style.backgroundColor = result ? css(result.side) : 'rgb(40 48 51)'
  })
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
    if (token !== request) {
      URL.revokeObjectURL(url)
      return
    }
    try {
      applyColor(next)
    } catch {
      URL.revokeObjectURL(url)
      return
    }
    image.src = url
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = url
  }
  next.onerror = () => URL.revokeObjectURL(url)
  next.src = url
})
if (image.complete && image.naturalWidth) applyColor(image)
else
  image.addEventListener(
    'load',
    () => {
      if (!currentUrl) applyColor(image)
    },
    { once: true },
  )
