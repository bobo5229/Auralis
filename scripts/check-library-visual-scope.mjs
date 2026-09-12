import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

async function read(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

function assertIncludes(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label}: missing ${text}`)
}

function assertExcludes(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`${label}: forbidden ${pattern}`)
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(fullPath)
      return /\.(?:ts|vue|css|json)$/.test(entry.name) ? [fullPath] : []
    }),
  )
  return nested.flat()
}

const [playerBar, playerSurface, mainCss, libraryPage] = await Promise.all([
  read('src/renderer/app/layout/PlayerBar.vue'),
  read('src/renderer/app/utils/playerVisualEffects.ts'),
  read('src/renderer/app/styles/main.css'),
  read('src/renderer/features/library/pages/LibraryPage.vue'),
])

assertIncludes(playerSurface, "displayMode === 'normal'", 'visible PlayerBar effects gate')
assertIncludes(playerBar, 'enabled: paletteEnabled', 'artwork palette gate')
assertIncludes(playerBar, 'useLiquidGlassFilter', 'liquid-glass lifecycle')
assertIncludes(mainCss, '.player-bar-island', 'modern PlayerBar island')
assertIncludes(mainCss, '@container modern-player-bar', 'narrow modern PlayerBar layout')
assertIncludes(libraryPage, 'LIBRARY_LAYOUT_METRICS', 'library virtual-list geometry')

const sourceFiles = await collectSourceFiles(resolve(root, 'src/renderer'))
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  assertExcludes(source, /manuscript|visualStyle|visual-style/i, file)
  assertExcludes(source, /auralis-visual-style/i, file)
  assertExcludes(source, /data-(?:shell|player)-presentation/i, file)
}

console.log('Modern visual scope checks passed.')
