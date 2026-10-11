import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('.', import.meta.url))
const result = await build({
  entryPoints: ['app.js'],
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'chrome120',
})
const [template, style, reference] = await Promise.all([
  readFile(new URL('index.template.html', import.meta.url), 'utf8'),
  readFile(new URL('style.css', import.meta.url), 'utf8'),
  readFile(new URL('assets/reference.png', import.meta.url)),
])
const html = template
  .replace('/* DEMO_CSS */', () => style)
  .replace('/* DEMO_JS */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script'))
  .replace('__REFERENCE_DATA__', () => 'data:image/png;base64,' + reference.toString('base64'))
await writeFile(new URL('index.html', import.meta.url), html, 'utf8')
console.log('Built offline liquid-metal refinement: production baseline + mirror iteration.')
