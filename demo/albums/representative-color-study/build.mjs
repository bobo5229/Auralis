import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../../..')
const files = {
  doja: '../selection-patch/doja.jpg',
  lover: '../selection-patch/lover.jpg',
  pink: '../color-family-study/pink-pony-club.jpg',
  white: '../../playback/palette-comparison/assets/white-album.jpg',
  dark: '../../playback/palette-comparison/assets/unknown-pleasures.jpg',
}
const samples = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, file]) => [
      name,
      `data:image/jpeg;base64,${(await readFile(path.resolve(dir, file))).toString('base64')}`,
    ]),
  ),
)
const result = await build({
  entryPoints: [path.join(dir, 'app.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  write: false,
  legalComments: 'inline',
  alias: { '@renderer': path.join(root, 'src/renderer') },
  define: { __SAMPLES__: JSON.stringify(samples) },
})
const template = await readFile(path.join(dir, 'template.html'), 'utf8')
await writeFile(
  path.join(dir, 'index.html'),
  template.replace('/* SCRIPT */', () =>
    result.outputFiles[0].text.replaceAll('</script', '<\\/script'),
  ),
)
console.log('Built demo/albums/representative-color-study/index.html')
