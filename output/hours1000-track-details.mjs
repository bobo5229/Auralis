import fs from 'node:fs/promises'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const out='output/hours1000-track-details'
await fs.mkdir(out,{recursive:true})
await fs.copyFile('src/renderer/features/archive/assets/milestones/materials/previews/hours-1000-lit.png',out+'/before.png')
const file='demo/archive/enamel-milestone/hours/assets/hours-1000.svg'
let svg=await fs.readFile(file,'utf8')
const newline=svg.includes('\r\n')?'\r\n':'\n'
const point=(r,a)=>[165+r*Math.cos(a*Math.PI/180),181+r*Math.sin(a*Math.PI/180)].map(n=>n.toFixed(2)).join(' ')
const arcs=[[97,-65,-15],[90,-59,-21],[85,-52,-27],[97,25,88],[90,33,82],[97,133,190],[90,140,184]]
const tracks=`<!-- Grouped track divisions stay between the four main record grooves. -->
<g fill="none" stroke="url(#hours-1000-groove)" stroke-width=".42" stroke-linecap="round">
${arcs.map(([r,a,b])=>`<path d="M${point(r,a)} A${r} ${r} 0 0 1 ${point(r,b)}"/>`).join('\n')}
</g>
`
svg=svg.replace('<path d="M76.54 125.73',tracks.replaceAll('\n',newline)+'<path d="M76.54 125.73')
const heights=[2,3.5,5.5,4,7.5,10,12,9,6,7.5,4.5,3,2]
const wave=`<g fill="none" stroke="url(#hours-1000-metal0)" stroke-width="1.05" stroke-linecap="round" aria-label="微型声波刻印"><path d="${heights.map((h,i)=>`M${147+i*3} ${310-h/2}v${h}`).join(' ')}"/></g>`
svg=svg.replace(/<path d="M154 310h7m8 0h7"[^>]*\/>\s*<circle cx="165" cy="310"[^>]*\/>/,wave)
svg=svg.replace('四道刻纹、中央浮雕数字','四道主刻纹与分轨细弧、底部微型声波、中央浮雕数字')
await fs.writeFile(file,svg)
await sharp(Buffer.from(svg)).png().toFile(file.replace('.svg','@2x.png'))
const h='scripts/badges/source-hashes.json',raw=await fs.readFile(h,'utf8'),hashes=JSON.parse(raw)
for(const name of ['hours-1000.svg','hours-1000@2x.png'])hashes['hours/assets/'+name]=createHash('sha256').update(await fs.readFile('demo/archive/enamel-milestone/hours/assets/'+name)).digest('hex')
await fs.writeFile(h,(JSON.stringify(hashes,null,2)+'\n').replaceAll('\n',raw.includes('\r\n')?'\r\n':'\n'))
let preview=await fs.readFile('output/hours1000-texture/preview.cjs','utf8')
preview=preview.replace('原紫色与图案保留 / 浅肌理 / 边缘压槽','保留紫色与珐琅肌理 / 分轨细弧 / 微型声波').replace('增加工艺细节 · 实际 GLSL 渲染','新增图案细节 · 实际 GLSL 渲染')
await fs.writeFile(out+'/preview.cjs',preview)
