import { analyzeArtworkColors } from '../../../src/renderer/shared/artwork/artworkAnalysis'
import { albumDetailColors, cssAlbumColor } from '../../../src/renderer/features/albums/albumDetailColors'
import { QuantizerCelebi, Score } from '@material/material-color-utilities'
import { Vibrant } from 'node-vibrant/browser'
import { getColorSync } from 'colorthief'

type RGB = { r: number; g: number; b: number }
type Result = { name: string; color: RGB | null; note: string }
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!
const input = $<HTMLInputElement>('#upload')
const output = $<HTMLElement>('#results')
const status = $<HTMLElement>('#status')
const img = $<HTMLImageElement>('#cover')
const names = ['当前共享算法', 'Material Color Utilities', 'node-vibrant', 'Color Thief']
const colorHex = (c: RGB) => '#' + [c.r,c.g,c.b].map(x => Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase()
let token = 0
let currentUrl: string | null = null

async function compare(url: string) {
  const id = ++token
  status.textContent = '正在分析封面…'
  const image = new Image()
  image.src = url
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, 48, 48)
  const data = ctx.getImageData(0, 0, 48, 48)
  const opaque: number[] = []
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i+3] >= 128) opaque.push((0xff000000 | data.data[i]<<16 | data.data[i+1]<<8 | data.data[i+2]) >>> 0)
  }
  if (!opaque.length) throw new Error('图片没有可取色的不透明像素。')
  const base = analyzeArtworkColors(data.data)
  const quantized = QuantizerCelebi.quantize(opaque, 128)
  const argb = Score.score(quantized, { desired: 1 })[0]
  const material = {r:(argb>>>16)&255,g:(argb>>>8)&255,b:argb&255}
  const alternate = Score.score(quantized, { desired: 1, fallbackColorARGB: 0xff010203 })[0]
  const fallback = (alternate >>> 0) === 0xff010203
  const vibrant = await Vibrant.from(canvas.toDataURL()).quality(1).getPalette()
  const picked = vibrant.Vibrant ?? vibrant.DarkVibrant ?? vibrant.LightVibrant ?? vibrant.Muted ?? vibrant.DarkMuted ?? vibrant.LightMuted
  const thief = getColorSync(data, { quality: 1, ignoreWhite: false })
  const results: Result[] = [
    {name:names[0], color:base?.dominant.rgb ?? null, note:'正式共享主色'},
    {name:names[1], color:material, note:fallback ? '官方默认回退色' : 'Celebi + Score'},
    {name:names[2], color:picked ? {r:picked.r,g:picked.g,b:picked.b} : null, note:picked ? `优先鲜艳色，缺失时依次回退` : '没有可用色样'},
    {name:names[3], color:thief?.rgb() ?? null, note:'OKLCH 主色，保留白色像素'},
  ]
  if (id !== token) return false
  img.src = url
  output.innerHTML = ''
  for (const [index, result] of results.entries()) {
    const card = document.createElement('article')
    card.className = 'card'
    if (!result.color) {
      card.innerHTML = `<div class="card-heading"><h2></h2></div><p class="empty">此方案没有可用色样</p>`
      card.querySelector('h2')!.textContent = result.name
      output.append(card)
      continue
    }
    const c = albumDetailColors(result.color)
    const vars: Record<string, RGB> = {main:c.main, side:c.side, more:c.more, text:c.mainText, muted:c.mainMuted, divider:c.divider, sideText:c.sideText, sideMuted:c.sideMuted, lyric:c.lyricsActive, lyricMuted:c.lyricsInactive}
    for (const [key, value] of Object.entries(vars)) card.style.setProperty('--'+key, cssAlbumColor(value))
    card.innerHTML = `<div class="card-heading"><div><span class="number">0${index+1}</span><h2></h2></div><div class="source"><span class="swatch"></span><code></code></div></div><p class="method"></p><div class="preview"><aside class="sidebar"><div class="mark">A</div><div>搜索</div><div class="selected">专辑</div><div>歌曲</div><div>播放列表</div></aside><section class="center"><div class="album"><img alt=""><div><b>专辑名称</b><small>艺术家</small><small>2022 年 3 月 21 日</small><button tabindex="-1">▶ 播放</button></div></div><div class="tracks"><div>01 <span>第一首歌</span>3:28</div><div>02 <span>下一段旅程</span>3:45</div><div>03 <span>留在此刻</span>4:06</div><div>04 <span>夜晚的回声</span>3:21</div></div><div class="more">更多作品推荐</div></section><aside class="lyrics"><small>歌词</small><p>让时间停在这一刻</p><p>把喧嚣留在远处</p><p>随着旋律慢慢走</p></aside></div>`
    card.querySelector('h2')!.textContent = result.name
    card.querySelector('.method')!.textContent = result.note
    card.querySelector<HTMLElement>('.swatch')!.style.background = cssAlbumColor(result.color)
    card.querySelector('code')!.textContent = colorHex(result.color)
    card.querySelector<HTMLImageElement>('.album img')!.src = url
    output.append(card)
  }
  status.textContent = '四种方案使用相同的 48 × 48 封面和当前详情页配色规则。'
  return true
}
input.addEventListener('change', async () => {
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const url = URL.createObjectURL(file)
  const uploadId = token + 1
  try {
    const applied = await compare(url)
    if (!applied) { URL.revokeObjectURL(url); return }
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = url
  } catch (error) {
    URL.revokeObjectURL(url)
    if (token === uploadId) status.textContent = `无法分析图片：${error instanceof Error ? error.message : String(error)}`
  }
})
compare(img.src).catch(error => { status.textContent = `无法分析图片：${error instanceof Error ? error.message : String(error)}` })
