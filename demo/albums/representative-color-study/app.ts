import { compareArtworkColors } from './algorithm'
import { albumDetailColors, cssAlbumColor } from '@renderer/features/albums/albumDetailColors'

declare const __SAMPLES__: Record<string, string>
const image = document.querySelector<HTMLImageElement>('#cover')!
const previews = document.querySelector<HTMLElement>('#previews')!
const status = document.querySelector<HTMLElement>('#status')!
const input = document.querySelector<HTMLInputElement>('#upload')!
const hex = (c: { r: number; g: number; b: number }) =>
  `#${[c.r, c.g, c.b]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
let currentUrl: string | null = null
let revision = 0

async function display(url: string): Promise<void> {
  const ticket = ++revision
  const cover = new Image()
  cover.src = url
  await cover.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(cover, 0, 0, 48, 48)
  const result = compareArtworkColors(ctx.getImageData(0, 0, 48, 48).data)
  if (!result || ticket !== revision) return
  image.src = url
  status.textContent = `判断结果：${result.reason}`
  previews.replaceChildren()
  for (const [label, color] of [
    ['现有取色', result.current],
    ['实验取色', result.proposed],
  ] as const) {
    const c = albumDetailColors(color.rgb)
    const node = document.createElement('section')
    node.className = 'panel'
    node.style.setProperty('--main', cssAlbumColor(c.main))
    node.style.setProperty('--side', cssAlbumColor(c.side))
    node.style.setProperty('--text', cssAlbumColor(c.mainText))
    node.style.setProperty('--side-text', cssAlbumColor(c.sideText))
    node.innerHTML = `<h2>${label} <small>${hex(color.rgb)}</small></h2><div class="surface"><aside>专辑<br>歌曲</aside><div><img alt=""><p>专辑名称</p><hr>曲目名称</div><aside>歌词</aside></div>`
    node.querySelector('img')!.src = url
    previews.append(node)
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((button) => {
  button.onclick = () => void display(__SAMPLES__[button.dataset.sample!])
})
input.onchange = () => {
  const file = input.files?.[0]
  if (!file) return
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = URL.createObjectURL(file)
  void display(currentUrl).catch(() => (status.textContent = '无法读取图片'))
}
void display(__SAMPLES__.doja)
