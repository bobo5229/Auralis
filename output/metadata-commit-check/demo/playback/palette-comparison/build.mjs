import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../../..')
const manifest = JSON.parse(await readFile(path.join(dir, 'samples.json'), 'utf8'))
const samples = await Promise.all(
  manifest.map(async ({ file, ...metadata }) => ({
    ...metadata,
    image: `data:image/${file.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${(await readFile(path.resolve(dir, file))).toString('base64')}`,
  })),
)
const result = await build({
  entryPoints: [path.join(dir, 'app.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'chrome120',
  write: false,
  legalComments: 'inline',
  alias: { '@renderer': path.join(root, 'src/renderer') },
  define: { __SAMPLES__: JSON.stringify(samples) },
})
const [template, css, imageQ, culori] = await Promise.all([
  readFile(path.join(dir, 'index.template.html'), 'utf8'),
  readFile(path.join(dir, 'style.css'), 'utf8'),
  readFile(path.join(root, 'node_modules/image-q/LICENSE'), 'utf8'),
  readFile(path.join(root, 'node_modules/culori/LICENSE'), 'utf8'),
])
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const html = template
  .replace('/* DEMO_CSS */', () => css)
  .replace('/* DEMO_JS */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script'))
  .replace('/* LICENSES */', () => escape(`image-q 4.0.0\n${imageQ}\n\nculori 4.0.2\n${culori}`))
await writeFile(path.join(dir, 'index.html'), html, 'utf8')
console.log(
  `Built offline palette comparison: ${samples.length} album covers; ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB. Open demo/playback/palette-comparison/index.html`,
)
