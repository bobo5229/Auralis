import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

async function readProjectFile(relativePath) {
  return readFile(resolve(projectRoot, relativePath), { encoding: 'utf-8' })
}

function assertIncludes(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`)
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label}: missing pattern ${pattern}`)
  }
}

function assertExcludes(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label}: forbidden global manuscript selector ${pattern}`)
  }
}

function findClosingBrace(source, openingBraceIndex) {
  let depth = 1
  let quote = null

  for (let index = openingBraceIndex + 1; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]

    if (quote) {
      if (character === quote && previous !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') depth -= 1
    if (depth === 0) return index
  }

  throw new Error('CSS parse: unclosed block')
}

function findNextCssDelimiter(source, start, end) {
  let quote = null
  let parentheses = 0
  let brackets = 0

  for (let index = start; index < end; index += 1) {
    const character = source[index]
    const previous = source[index - 1]

    if (quote) {
      if (character === quote && previous !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '(') parentheses += 1
    if (character === ')') parentheses = Math.max(0, parentheses - 1)
    if (character === '[') brackets += 1
    if (character === ']') brackets = Math.max(0, brackets - 1)
    if (parentheses === 0 && brackets === 0 && (character === '{' || character === ';')) {
      return index
    }
  }

  return -1
}

function splitSelectorList(selectorList) {
  const selectors = []
  let start = 0
  let quote = null
  let parentheses = 0
  let brackets = 0

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index]
    const previous = selectorList[index - 1]

    if (quote) {
      if (character === quote && previous !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '(') parentheses += 1
    if (character === ')') parentheses = Math.max(0, parentheses - 1)
    if (character === '[') brackets += 1
    if (character === ']') brackets = Math.max(0, brackets - 1)
    if (character === ',' && parentheses === 0 && brackets === 0) {
      selectors.push(selectorList.slice(start, index).trim())
      start = index + 1
    }
  }

  selectors.push(selectorList.slice(start).trim())
  return selectors.filter(Boolean)
}

function collectCssSelectors(cssSource, start = 0, end = cssSource.length, selectors = []) {
  let cursor = start

  while (cursor < end) {
    while (/\s/.test(cssSource[cursor] ?? '')) cursor += 1
    if (cursor >= end) break

    const delimiter = findNextCssDelimiter(cssSource, cursor, end)
    if (delimiter === -1) break

    const prelude = cssSource.slice(cursor, delimiter).trim()
    if (cssSource[delimiter] === ';') {
      cursor = delimiter + 1
      continue
    }

    const closingBrace = findClosingBrace(cssSource, delimiter)
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer|scope|starting-style)\b/i.test(prelude)) {
        collectCssSelectors(cssSource, delimiter + 1, closingBrace, selectors)
      }
    } else if (prelude) {
      selectors.push(...splitSelectorList(prelude))
    }
    cursor = closingBrace + 1
  }

  return selectors
}

function assertDetailCssScope(cssSource) {
  const withoutComments = cssSource.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = collectCssSelectors(withoutComments)
  const detailScope = /\.album-detail-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/

  if (selectors.length === 0) {
    throw new Error('album detail manuscript CSS: no style rules found')
  }

  for (const selector of selectors) {
    if (!detailScope.test(selector)) {
      throw new Error(`album detail manuscript CSS: unscoped selector ${selector}`)
    }
  }
}

function assertExcludedSurfacesUntouched(label, cssSource) {
  const excludedSurface =
    /\.(?:app-(?:window|shell|sidebar)|now-playing|player-bar|mini-player|desktop-lyrics|fullscreen-player)(?:\b|[-_])/i

  for (const selector of collectCssSelectors(cssSource.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (excludedSurface.test(selector)) {
      throw new Error(`${label}: selector crosses into excluded surface: ${selector}`)
    }
  }
}

const [
  page,
  albumCoverGroup,
  manuscriptCss,
  overlayCss,
  albumsPage,
  albumCard,
  albumsManuscriptCss,
  albumsOverlayCss,
  sharedTokens,
  albumDetailPage,
  albumDetailManuscriptCss,
  mainCss,
  unoConfig,
] = await Promise.all([
  readProjectFile('src/renderer/features/library/pages/LibraryPage.vue'),
  readProjectFile('src/renderer/features/library/components/AlbumCoverGroup.vue'),
  readProjectFile('src/renderer/features/library/styles/manuscript.css'),
  readProjectFile('src/renderer/features/library/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/albums/pages/AlbumsPage.vue'),
  readProjectFile('src/renderer/features/albums/components/AlbumCard.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.css'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/appearance/styles/manuscript.tokens.css'),
  readProjectFile('src/renderer/features/albums/pages/AlbumDetailPage.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.detail.css'),
  readProjectFile('src/renderer/app/styles/main.css'),
  readProjectFile('uno.config.ts'),
])

assertIncludes(page, "route.name === 'library' && visualStyle.value === 'manuscript'", 'route gate')
assertIncludes(page, ':data-visual-style="isManuscriptLibrary', 'page style marker')
assertIncludes(
  manuscriptCss,
  ".library-page[data-visual-style='manuscript']",
  'page manuscript scope',
)
assertIncludes(
  overlayCss,
  ".library-overlay[data-visual-style='manuscript']",
  'overlay manuscript scope',
)
assertIncludes(albumsPage, ':data-visual-style="albumPresentation"', 'album page style marker')
assertIncludes(
  albumsManuscriptCss,
  ".albums-page[data-visual-style='manuscript']",
  'album page manuscript scope',
)
assertIncludes(
  albumsOverlayCss,
  ".albums-overlay[data-visual-style='manuscript']",
  'album overlay manuscript scope',
)
assertIncludes(albumCard, 'loading="lazy"', 'album artwork lazy loading')
assertIncludes(albumCard, 'decoding="async"', 'album artwork asynchronous decoding')
assertIncludes(albumsPage, 'const CARD_METADATA_HEIGHT = 70', 'album virtual metadata geometry')
assertIncludes(albumsPage, 'const GRID_PADDING_X = 40', 'album virtual horizontal geometry')

const detailRootMatch = albumDetailPage.match(/<template>\s*<([a-z][\w-]*)\b([\s\S]*?)>/i)
if (!detailRootMatch) throw new Error('album detail page: template root not found')
const detailRootAttributes = detailRootMatch[2]

assertMatches(
  detailRootAttributes,
  /\bclass\s*=\s*(['"])[^'"]*\balbum-detail-page\b[^'"]*\1/,
  'album detail root class',
)
assertMatches(
  detailRootAttributes,
  /\b(?::|v-bind:)?data-visual-style\s*=/,
  'album detail root style marker',
)
assertMatches(
  albumDetailPage,
  /(?:route\.name\s*===\s*(['"])album-detail\1|resolveAlbumPresentation\(\s*route\.name\s*,)/,
  'album detail route gate',
)
assertMatches(
  albumDetailPage,
  /(?:import\s+['"]|src\s*=\s*['"])[^'"]*manuscript\.detail\.css['"]/,
  'album detail manuscript stylesheet import',
)
assertMatches(
  sharedTokens,
  /\.album-detail-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens detail scope',
)
assertMatches(
  albumDetailPage,
  /class\s*=\s*['"]album-more-gallery-cover['"][\s\S]{0,800}<img\b(?=[^>]*\bloading\s*=\s*['"]lazy['"])(?=[^>]*\bdecoding\s*=\s*['"]async['"])[^>]*>/,
  'related album artwork loading contract',
)

assertDetailCssScope(albumDetailManuscriptCss)

for (const [label, source] of [
  ['manuscript.css', manuscriptCss],
  ['manuscript.overlays.css', overlayCss],
  ['albums manuscript.css', albumsManuscriptCss],
  ['albums manuscript.overlays.css', albumsOverlayCss],
  ['album detail manuscript.css', albumDetailManuscriptCss],
  ['shared manuscript tokens.css', sharedTokens],
  ['main.css', mainCss],
  ['uno.config.ts', unoConfig],
]) {
  assertExcludes(source, /(?:html|body|#app|\.app-shell)[^{\n]*data-visual-style[^\n{]*/i, label)
}

for (const [label, source] of [
  ['library manuscript.css', manuscriptCss],
  ['library manuscript.overlays.css', overlayCss],
  ['albums manuscript.css', albumsManuscriptCss],
  ['albums manuscript.overlays.css', albumsOverlayCss],
  ['album detail manuscript.css', albumDetailManuscriptCss],
  ['shared manuscript tokens.css', sharedTokens],
]) {
  assertExcludedSurfacesUntouched(label, source)
}

for (const cssVariable of [
  '--library-flat-row-height',
  '--library-cover-track-row-height',
  '--library-cover-artwork-size',
  '--library-cover-panel-padding-block-side',
  '--library-cover-group-padding-block-side',
]) {
  assertIncludes(
    page + albumCoverGroup + manuscriptCss + unoConfig,
    `var(${cssVariable})`,
    'layout geometry binding',
  )
}

console.log('Library, album catalog, and album detail visual scope checks passed.')
