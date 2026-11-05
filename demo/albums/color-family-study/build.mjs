import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../../..')
const files = ['pink-pony-club.jpg','../selection-patch/doja.jpg','../selection-patch/lover.jpg','../../playback/palette-comparison/assets/white-album.jpg','../../playback/palette-comparison/assets/unknown-pleasures.jpg']
const [template,css,...covers] = await Promise.all(['template.html','style.css',...files].map(n=>readFile(path.resolve(dir,n))))
const data = b => 'data:image/jpeg;base64,' + b.toString('base64')
const define = Object.fromEntries(['__PINK__','__DOJA__','__LOVER__','__WHITE__','__DARK__'].map((key,index)=>[key,JSON.stringify(data(covers[index]))]))
const output = await build({entryPoints:[path.join(dir,'app.ts')],bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:true,write:false,legalComments:'inline',alias:{'@renderer':path.join(root,'src/renderer')},define})
const licenses=await Promise.all(['image-q','culori'].map(async n=>`${n}\n${await readFile(path.join(root,'node_modules',n,'LICENSE'),'utf8')}`))
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const html=template.toString('utf8').replace('/* LICENSES */',()=>escape(licenses.join('\n\n'))).replace('/* CSS */',()=>css.toString('utf8')).replace('/* JS */',()=>output.outputFiles[0].text.replaceAll('</script','<\\/script'))
await writeFile(path.join(dir,'index.html'),html)
console.log('Built demo/albums/color-family-study/index.html')
