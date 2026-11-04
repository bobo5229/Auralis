import { build } from 'esbuild'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..')
const [template,css,doja,lover]=await Promise.all(['template.html','style.css','doja.jpg','lover.jpg'].map(n=>readFile(path.join(dir,n))))
const data=b=>'data:image/jpeg;base64,'+b.toString('base64')
const result=await build({entryPoints:[path.join(dir,'app.ts')],bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:true,write:false,legalComments:'inline',alias:{'@renderer':path.join(root,'src/renderer')},define:{__DOJA__:JSON.stringify(data(doja)),__LOVER__:JSON.stringify(data(lover))}})
const licenses=await Promise.all(['image-q','culori'].map(async n=>`${n}\n${await readFile(path.join(root,'node_modules',n,'LICENSE'),'utf8')}`))
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const html=template.toString('utf8').replace('/* LICENSES */',()=>escape(licenses.join('\n\n'))).replace('/* CSS */',()=>css.toString('utf8')).replace('/* JS */',()=>result.outputFiles[0].text.replaceAll('</script','<\\/script'))
await writeFile(path.join(dir,'index.html'),html)
console.log('Built demo/albums/selection-patch/index.html')
