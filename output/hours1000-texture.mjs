import fs from 'node:fs/promises'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const out='output/hours1000-texture'
await fs.mkdir(out,{recursive:true})
await fs.copyFile('src/renderer/features/archive/assets/milestones/materials/previews/hours-1000-lit.png',out+'/before.png')
const file='demo/archive/enamel-milestone/hours/assets/hours-1000.svg'
let svg=await fs.readFile(file,'utf8')
const newline=svg.includes('\r\n')?'\r\n':'\n'
const contour=svg.match(/<path d="([^"]+)"/)[1]
const transform=s=>`translate(165 185) scale(${s}) translate(-165 -185)`
const definitions=['enamel-grain-low','enamel-grain-high','enamel-recess','enamel-lip'].map(id=>`<linearGradient id="hours-1000-${id}"><stop stop-color="#6252a7"/><stop offset="1" stop-color="#6252a7"/></linearGradient>`).join('')+`<clipPath id="hours-1000-grain-clip"><path d="${contour}" transform="${transform(.89)}"/></clipPath>`
svg=svg.replace('</defs>',definitions+'</defs>')
let seed=1000
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
const grains=[]
for(let y=32;y<339;y+=3.4)for(let x=30;x<301;x+=3.4){
 const cx=x+(random()-.5)*2.8,cy=y+(random()-.5)*2.8
 if(Math.hypot(cx-165,cy-181)<110)continue
 const rx=.42+random()*.65,ry=.35+random()*.5
 grains.push(`<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="url(#hours-1000-enamel-grain-${random()>.55?'high':'low'})"/>`)
}
const detail=`<!-- Shallow same-colour enamel relief; the profile supplies height and finish. -->
<g clip-path="url(#hours-1000-grain-clip)">
${grains.join('\n')}
</g>
<path d="${contour}" transform="${transform(.906)}" fill="none" stroke="url(#hours-1000-enamel-recess)" stroke-width="2.2"/>
<path d="${contour}" transform="${transform(.894)}" fill="none" stroke="url(#hours-1000-enamel-lip)" stroke-width=".65"/>
`
svg=svg.replace('<circle cx="165" cy="181" r="108"',detail.replaceAll('\n',newline)+'<circle cx="165" cy="181" r="108"')
svg=svg.replace('完整紫色唱片，','浅肌理珐琅与边缘压槽，完整紫色唱片，')
await fs.writeFile(file,svg)
await sharp(Buffer.from(svg)).png().toFile(file.replace('.svg','@2x.png'))
const h='scripts/badges/source-hashes.json',raw=await fs.readFile(h,'utf8'),hashes=JSON.parse(raw)
for(const name of ['hours-1000.svg','hours-1000@2x.png'])hashes['hours/assets/'+name]=createHash('sha256').update(await fs.readFile('demo/archive/enamel-milestone/hours/assets/'+name)).digest('hex')
await fs.writeFile(h,(JSON.stringify(hashes,null,2)+'\n').replaceAll('\n',raw.includes('\r\n')?'\r\n':'\n'))
console.log(`${grains.length} deterministic shallow enamel marks`)
