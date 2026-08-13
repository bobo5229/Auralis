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

function assertManuscriptCssScope(cssSource, label, scopePattern) {
  const withoutComments = cssSource.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = collectCssSelectors(withoutComments)

  if (selectors.length === 0) {
    throw new Error(`${label}: no style rules found`)
  }

  for (const selector of selectors) {
    scopePattern.lastIndex = 0
    if (!scopePattern.test(selector)) {
      throw new Error(`${label}: unscoped selector ${selector}`)
    }
  }
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

function assertStrictUtf8Text(relativePath, text) {
  if (text.includes('\uFFFD')) {
    throw new Error(`${relativePath}: UTF-8 replacement character`)
  }
  if (/\?{3,}/.test(text)) {
    throw new Error(`${relativePath}: consecutive question-mark placeholders`)
  }
}

function assertLibraryHeaderLocaleParity(locales) {
  const requiredKeys = [
    'title',
    'subtitle',
    'libraryMembership',
    'playlistSubtitle',
    'playlistKind',
    'playlistMembership',
    'smartPlaylistSubtitle',
    'smartPlaylistKind',
    'smartPlaylistMembership',
    'untitled',
    'playlistFallback',
    'smartPlaylistFallback',
    'loadingTitle',
    'loadingSubtitle',
    'trackCount',
    'folio',
  ]

  const keySets = locales.map(([label, source]) => {
    const header = JSON.parse(source).library?.manuscript?.header
    if (!header || typeof header !== 'object') {
      throw new Error(`${label}: missing library.manuscript.header`)
    }
    const keys = Object.keys(header).sort()
    for (const key of requiredKeys) {
      if (typeof header[key] !== 'string' || header[key].trim() === '') {
        throw new Error(`${label}: missing library.manuscript.header.${key}`)
      }
    }
    return { label, keys }
  })

  const [first, ...rest] = keySets
  for (const current of rest) {
    if (current.keys.join('\0') !== first.keys.join('\0')) {
      throw new Error(
        `locale header key mismatch: ${first.label} vs ${current.label} (${first.keys.join(', ')} / ${current.keys.join(', ')})`,
      )
    }
  }
}

const [
  page,
  albumCoverGroup,
  manuscriptCss,
  overlayCss,
  libraryPresentation,
  libraryHeader,
  libraryContextMenu,
  metadataDialog,
  albumsPage,
  albumCard,
  albumsManuscriptCss,
  albumsOverlayCss,
  sharedTokens,
  albumDetailPage,
  albumDetailManuscriptCss,
  settingsPage,
  settingsPresentation,
  settingsManuscriptCss,
  visualStylePreference,
  localeEn,
  localeZhHans,
  localeZhHant,
  mainCss,
  unoConfig,
] = await Promise.all([
  readProjectFile('src/renderer/features/library/pages/LibraryPage.vue'),
  readProjectFile('src/renderer/features/library/components/AlbumCoverGroup.vue'),
  readProjectFile('src/renderer/features/library/styles/manuscript.css'),
  readProjectFile('src/renderer/features/library/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/library/utils/libraryPresentation.ts'),
  readProjectFile('src/renderer/features/library/components/LibraryArchiveHeader.vue'),
  readProjectFile('src/renderer/features/library/components/LibraryContextMenu.vue'),
  readProjectFile('src/renderer/features/library/components/MetadataEditDialog.vue'),
  readProjectFile('src/renderer/features/albums/pages/AlbumsPage.vue'),
  readProjectFile('src/renderer/features/albums/components/AlbumCard.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.css'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/appearance/styles/manuscript.tokens.css'),
  readProjectFile('src/renderer/features/albums/pages/AlbumDetailPage.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.detail.css'),
  readProjectFile('src/renderer/features/settings/pages/SettingsPage.vue'),
  readProjectFile('src/renderer/features/settings/utils/settingsPresentation.ts'),
  readProjectFile('src/renderer/features/settings/styles/manuscript.css'),
  readProjectFile('src/renderer/features/appearance/components/VisualStylePreference.vue'),
  readProjectFile('src/renderer/locales/en.json'),
  readProjectFile('src/renderer/locales/zh-Hans.json'),
  readProjectFile('src/renderer/locales/zh-Hant.json'),
  readProjectFile('src/renderer/app/styles/main.css'),
  readProjectFile('uno.config.ts'),
])

assertIncludes(
  page,
  "libraryPresentation.value === 'manuscript'",
  'presentation-derived manuscript gate',
)
assertIncludes(page, ':data-visual-style="libraryPresentation"', 'page style marker')
assertIncludes(
  page,
  ':data-library-surface="librarySurfaceKind ?? undefined"',
  'library surface marker',
)
assertIncludes(page, 'resolveLibraryPresentation(route.name, visualStyle.value)', 'page resolver')
assertIncludes(page, 'resolveLibrarySurfaceKind(route.name)', 'library surface kind')
assertIncludes(page, 'v-if="isLibrarySurface"', 'shared visual style switch')
assertIncludes(page, ':identity="pageIdentity"', 'identity header binding')
assertIncludes(page, ':presentation="libraryPresentation"', 'child presentation binding')
assertIncludes(page, 'LIBRARY_PLAYLISTS_CHANGED_EVENT', 'regular playlist refresh event')
assertIncludes(page, 'LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT', 'smart playlist refresh event')
assertExcludes(
  page,
  /route\.name\s*===\s*(['"])library\1\s*&&\s*visualStyle/,
  'second library route + style gate',
)
assertIncludes(libraryPresentation, "'library'", 'library route contract')
assertIncludes(libraryPresentation, "'playlist'", 'playlist route contract')
assertIncludes(libraryPresentation, "'smart-playlist'", 'smart-playlist route contract')
assertIncludes(libraryPresentation, 'resolveLibrarySurfaceKind', 'surface kind helper')
assertIncludes(libraryHeader, 'identity: LibraryPageIdentity | null', 'header identity contract')
assertIncludes(libraryContextMenu, 'class="library-overlay"', 'context menu overlay owner')
assertIncludes(libraryContextMenu, ':data-visual-style="presentation"', 'context menu style marker')
assertIncludes(metadataDialog, 'class="library-overlay"', 'metadata overlay owner')
assertIncludes(metadataDialog, ':data-visual-style="presentation"', 'metadata style marker')
assertManuscriptCssScope(
  manuscriptCss,
  'library manuscript CSS',
  /(?:\.library-page|\.library-status-state)\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)
assertManuscriptCssScope(
  overlayCss,
  'library manuscript overlay CSS',
  /\.library-overlay\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)
assertLibraryHeaderLocaleParity([
  ['en.json', localeEn],
  ['zh-Hans.json', localeZhHans],
  ['zh-Hant.json', localeZhHant],
])
for (const [relativePath, source] of [
  ['src/renderer/locales/zh-Hans.json', localeZhHans],
  ['src/renderer/locales/zh-Hant.json', localeZhHant],
  ['src/renderer/features/library/components/LibraryArchiveHeader.vue', libraryHeader],
]) {
  assertStrictUtf8Text(relativePath, source)
}
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

assertIncludes(
  settingsPage,
  'resolveSettingsPresentation(route.name, visualStyle.value)',
  'settings presentation resolver',
)
assertIncludes(
  settingsPage,
  ':data-visual-style="settingsPresentation"',
  'settings page style marker',
)
assertIncludes(settingsPresentation, "routeName === 'settings'", 'settings route contract')
assertIncludes(settingsPage, 'VisualStylePreference', 'settings visual style entry')
assertIncludes(visualStylePreference, 'useVisualStyle()', 'shared visual style state')
assertExcludes(visualStylePreference, /auralis-visual-style/, 'second visual style storage key')
assertManuscriptCssScope(
  settingsManuscriptCss,
  'settings manuscript CSS',
  /\.settings-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]|\.settings-overlay\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)
assertIncludes(localeEn, '"modernLabel"', 'settings visual style locale keys')

for (const [label, source] of [
  ['manuscript.css', manuscriptCss],
  ['manuscript.overlays.css', overlayCss],
  ['albums manuscript.css', albumsManuscriptCss],
  ['albums manuscript.overlays.css', albumsOverlayCss],
  ['album detail manuscript.css', albumDetailManuscriptCss],
  ['settings manuscript.css', settingsManuscriptCss],
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
  ['settings manuscript.css', settingsManuscriptCss],
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

console.log(
  'Library, album catalog, album detail, and settings visual scope checks passed.',
)
