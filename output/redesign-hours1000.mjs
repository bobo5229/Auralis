import fs from 'node:fs/promises'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const dir='demo/archive/enamel-milestone/hours/assets/'
const file=dir+'hours-1000.svg'
const old=await fs.readFile(file,'utf8')
await fs.mkdir('output/hours1000-redesign',{recursive:true})
await fs.copyFile('src/renderer/features/archive/assets/milestones/materials/previews/hours-1000-lit.png','output/hours1000-redesign/before.png')
const contour=old.match(/<path d="([^"]+)"/)[1]
const digits=old.match(/<g transform="translate\(87\.195 186\) scale\(0\.91\)">([\s\S]*?)<\/g>/)[1]
const hours=old.match(/<path d="(M0 0V7M5[^\"]+)"/)[1]
const gradient=(name,color)=>`<linearGradient id="hours-1000-${name}"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}"/></linearGradient>`
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="740" viewBox="0 0 330 370">
<title>久伴 · 1000 小时</title>
<desc>完整深紫唱片，四道刻纹、中央浮雕数字与非对称珠光弧。</desc>
<defs>${gradient('metal0','#aeb9c2')}${gradient('enamel0','#352b59')}${gradient('record','#211939')}${gradient('groove','#887d9f')}${gradient('pearl','#c3c2da')}${gradient('numeral','#c9ccd5')}</defs>
<path d="${contour}" fill="url(#hours-1000-metal0)"/>
<path d="${contour}" transform="translate(165 185) scale(.963) translate(-165 -185)" fill="#374052" stroke="url(#hours-1000-metal0)" stroke-width="1.2"/>
<path d="${contour}" transform="translate(165 185) scale(.923) translate(-165 -185)" fill="url(#hours-1000-enamel0)" stroke="url(#hours-1000-metal0)" stroke-width="2.2"/>
<circle cx="165" cy="181" r="108" fill="url(#hours-1000-record)" stroke="url(#hours-1000-groove)" stroke-width="1.5"/>
<g fill="none" stroke="url(#hours-1000-groove)">
${[100,94,87,83].map((r,i)=>`<circle cx="165" cy="181" r="${r}" stroke-width="${i===0?1.4:.7}"/>`).join('')}
</g>
<path d="M76.54 125.73 A104.3 104.3 0 0 1 183.11 78.28" fill="none" stroke="url(#hours-1000-pearl)" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="165" cy="136" r="3.4" fill="url(#hours-1000-metal0)"/>
<circle cx="165" cy="136" r="1.25" fill="#171325"/>
<g transform="translate(83.775 157) scale(.95 1.06)" fill="url(#hours-1000-numeral)" stroke="url(#hours-1000-numeral)" stroke-width=".35" stroke-linejoin="round">${digits}</g>
<g transform="translate(140.4 226) scale(1.2)" fill="none" stroke="url(#hours-1000-metal0)" stroke-width=".9" stroke-linecap="square" stroke-linejoin="round"><path d="${hours}"/></g>
<path d="M154 310h7m8 0h7" fill="none" stroke="url(#hours-1000-metal0)" stroke-width=".8"/>
<circle cx="165" cy="310" r="1.7" fill="url(#hours-1000-pearl)"/>
</svg>
`
await fs.writeFile(file,svg.replaceAll('\n','\r\n'))
await sharp(Buffer.from(svg)).png().toFile(dir+'hours-1000@2x.png')
const provenancePath='scripts/badges/source-hashes.json'
const original=await fs.readFile(provenancePath,'utf8')
const provenance=JSON.parse(original)
for(const name of ['hours-1000.svg','hours-1000@2x.png']) provenance['hours/assets/'+name]=createHash('sha256').update(await fs.readFile(dir+name)).digest('hex')
await fs.writeFile(provenancePath,(JSON.stringify(provenance,null,2)+'\n').replaceAll('\n',original.includes('\r\n')?'\r\n':'\n'))
