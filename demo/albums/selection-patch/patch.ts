import { palette, distance, utils } from 'image-q'
import { analyzeArtworkColors } from '../../../src/renderer/shared/artwork/artworkAnalysis'
import { rgbToOklab, getOklabDistance } from '../../../src/renderer/shared/color/colorMath'
import type { RgbColor, OklabColor } from '../../../src/renderer/shared/color/types'

type Candidate = { rgb: RgbColor; lab: OklabColor; count: number; center: number; chroma: number }
export function analyze(pixels: Uint8ClampedArray) {
  const base = analyzeArtworkColors(pixels)
  if (!base) throw new Error('图片没有可取色的不透明像素。')
  const source = base.dominant
  let total = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) total++
  const candidates: Candidate[] = []
  let selected: Candidate | null = null
  let reason = '原主色色度较高，保留当前结果。'
  if (source.chroma < 0.055) {
    const rgba: number[] = []
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] >= 128) rgba.push(pixels[i], pixels[i+1], pixels[i+2], 255)
    const q = new palette.WuQuant(new distance.EuclideanBT709NoAlpha(), 16, 4)
    q.sample(utils.PointContainer.fromUint8Array(Uint8Array.from(rgba), rgba.length / 4, 1))
    for (const {r,g,b} of q.quantizeSync().getPointContainer().getPointArray()) {
      const rgb = {r,g,b}, lab = rgbToOklab(rgb)
      candidates.push({rgb,lab,count:0,center:0,chroma:Math.hypot(lab.a,lab.b)})
    }
    for (let i=0;i<pixels.length;i+=4) {
      if (pixels[i+3]<128) continue
      const lab=rgbToOklab({r:pixels[i],g:pixels[i+1],b:pixels[i+2]})
      const c=candidates.reduce((a,b)=>getOklabDistance(lab,a.lab)<=getOklabDistance(lab,b.lab)?a:b)
      c.count++
      const pos=i/4, x=pos%48, y=Math.floor(pos/48)
      if (x>=10 && x<38 && y>=10 && y<38) c.center++
    }
    const angle = (c:Candidate) => {
      const difference=Math.abs(Math.atan2(c.lab.b,c.lab.a)-Math.atan2(source.oklab.b,source.oklab.a))
      return Math.min(difference,Math.PI*2-difference)
    }
    const eligible=candidates.filter(c => c.count/total >= 0.035 && c.chroma >= 0.085 && c.chroma >= source.chroma*1.8 && c.center/c.count >= 0.55 && (source.chroma < 0.025 || angle(c) <= Math.PI/4))
    eligible.sort((a,b)=>b.count*b.chroma-a.count*a.chroma)
    selected=eligible[0] ?? null
    reason=selected ? '发现面积足够、较鲜明且集中在画面中心的候选色。' : '未发现符合条件的补充候选色，保留当前结果。'
  }
  return {base, total, candidates:candidates.sort((a,b)=>b.count-a.count), selected, reason, patched:selected?.rgb ?? source.rgb}
}
