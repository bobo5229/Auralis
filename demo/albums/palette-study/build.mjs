import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../../..')
const bundle = await build({entryPoints:[path.join(dir,'app.ts')], bundle:true, format:'iife', platform:'browser', target:'chrome120', write:false, legalComments:'inline', alias:{'@renderer':path.join(root,'src/renderer')}})
const [template,css,cover] = await Promise.all([readFile(path.join(dir,'template.html'),'utf8'),readFile(path.join(dir,'style.css'),'utf8'),readFile(path.join(root,'demo/assets/test-cover.png'))])
const licenses = await Promise.all(['node_modules/@material/material-color-utilities/LICENSE','node_modules/node-vibrant/LICENSE.md','node_modules/colorthief/LICENSE', '../../../node_modules/image-q/LICENSE','../../../node_modules/culori/LICENSE'].map(async name => `${name}\n${await readFile(path.resolve(dir,name),'utf8')}`))
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
await writeFile(path.join(dir,'index.html'), template.replace('/* LICENSES */', () => escape(licenses.join('\n\n'))).replace('/* CSS */',()=>css).replace('/* JS */',()=>bundle.outputFiles[0].text.replaceAll('</script','<\\/script')).replace('COVER_DATA',()=>`data:image/png;base64,${cover.toString('base64')}`))
console.log('Built demo/albums/palette-study/index.html')
