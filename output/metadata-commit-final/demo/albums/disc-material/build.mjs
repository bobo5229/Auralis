import { build } from 'vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
export const output = path.resolve(root, '../../../.electron-home/disc-material-demo')
// Extract the current production material rather than maintaining an approximate CSS copy.
const source = await readFile(
  path.resolve(root, '../../../src/renderer/features/albums/pages/CdAlbumsPage.vue'),
  'utf8',
)
const rules = []
for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1]
    .trim()
    .replace(/^.*\*\//s, '')
    .trim()
  if (selector === '.cd-page' || selector === ".cd-page[data-theme='dark']") {
    const tokens = match[2].match(/--cd-[\w-]+\s*:[^;]+;/g)
    if (tokens) rules.push(`${selector} { ${tokens.join('\n')} }`)
  } else if (
    /^\.cd-(?:stage|page)[^{}]*:deep\([^)]*\.cd-(?:disc(?=[\s:.>)])|art|hub)/.test(selector)
  ) {
    rules.push(`${selector.replace(/:deep\(([^)]+)\)/g, '$1')} {${match[2]}}`)
  }
}
if (rules.length < 15 || !rules.some((rule) => rule.includes('.cd-disc::after')))
  throw new Error('Production material CSS extraction failed')
console.log(`Using ${rules.length} current CD-room material/theme rules`)
await build({
  configFile: false,
  root,
  base: './',
  plugins: [
    {
      name: 'production-disc-material',
      resolveId(id) {
        if (id === 'virtual:disc-baseline.css') return '\0disc-baseline.css'
      },
      load(id) {
        if (id === '\0disc-baseline.css') return rules.join('\n')
      },
    },
  ],
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false, target: 'chrome138' },
})
