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

/**
 * Extract the first bare `.library-page[data-visual-style='manuscript']` rule
 * block (the page root). Phase 22 assertions target this rule only: cover
 * groups and other pages may still legitimately use the shared paper tokens.
 */
function extractLibraryPageRootRule(cssSource) {
  const match = cssSource.match(
    /\.library-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]\s*\{([\s\S]*?)\}/,
  )
  if (!match) throw new Error('library manuscript page-root rule not found')
  return match[2]
}

function assertEveryImageHasLoadingContract(source, label) {
  const images = source.match(/<img\b[\s\S]*?>/g) ?? []
  if (images.length === 0) throw new Error(`${label}: no image tags found`)

  for (const image of images) {
    if (!/\bloading\s*=\s*(['"])lazy\1/.test(image)) {
      throw new Error(`${label}: image missing lazy loading`)
    }
    if (!/\bdecoding\s*=\s*(['"])async\1/.test(image)) {
      throw new Error(`${label}: image missing asynchronous decoding`)
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

function assertShellCssScope(cssSource, label, scopePattern) {
  assertManuscriptCssScope(cssSource, label, scopePattern)

  const excludedFromShell =
    /\.(?:now-playing|player-bar|player-control|queue-|playback-mode-|mini-player|desktop-lyrics|fullscreen)(?:\b|[-_])/i

  for (const selector of collectCssSelectors(cssSource.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (excludedFromShell.test(selector)) {
      throw new Error(`${label}: selector crosses into Phase 18-21 surface: ${selector}`)
    }
    if (/^(?:html|body|#app)\b/i.test(selector)) {
      throw new Error(`${label}: global manuscript selector ${selector}`)
    }
  }
}

/**
 * Phase 18 player surfaces: every selector must start with one of the three
 * player owner scopes and must never reach Fullscreen, Miniplayer, the
 * desktop-lyrics window, the sidebar or page owners.
 */
function assertPlayerCssScope(cssSource, label) {
  assertManuscriptCssScope(
    cssSource,
    label,
    /\.(?:now-playing-panel|player-bar|player-overlay)\s*\[\s*data-player-presentation\s*=\s*(['"])manuscript\1\s*\]/,
  )

  const excludedFromPlayer =
    /\.(?:fullscreen|mini-player|desktop-lyrics-window|desktop-lyrics-root|app-window|app-shell|app-sidebar|sidebar-overlay)(?:\b|[-_])|\.(?:library|albums|album-detail|archive|settings)-(?:\b|[-_])/i

  for (const selector of collectCssSelectors(cssSource.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (excludedFromPlayer.test(selector)) {
      throw new Error(`${label}: selector crosses into excluded surface: ${selector}`)
    }
    if (/^(?:html|body|#app)\b/i.test(selector)) {
      throw new Error(`${label}: global manuscript selector ${selector}`)
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
  libraryContextMenu,
  metadataDialog,
  albumsPage,
  albumCard,
  albumsManuscriptCss,
  albumsOverlayCss,
  sharedTokens,
  albumDetailPage,
  albumDetailManuscriptCss,
  archivePage,
  archiveDna,
  archivePresentation,
  archiveManuscriptCss,
  archiveOverlayCss,
  settingsPage,
  appearanceSettings,
  settingsPresentation,
  settingsManuscriptCss,
  visualStylePreference,
  appShell,
  appSidebar,
  facetsDialog,
  shellPresentation,
  artworkPalette,
  shellManuscriptCss,
  sidebarManuscriptCss,
  sidebarOverlayManuscriptCss,
  localeEn,
  localeZhHans,
  localeZhHant,
  mainCss,
  unoConfig,
  playerSurfacePresentation,
  playerManuscriptCss,
  playerOverlayManuscriptCss,
  playerBar,
  trackProgressInfo,
  nowPlayingPanel,
  playbackQueuePopover,
  playbackModeMenu,
  albumTint,
  playerBarMaterial,
] = await Promise.all([
  readProjectFile('src/renderer/features/library/pages/LibraryPage.vue'),
  readProjectFile('src/renderer/features/library/components/AlbumCoverGroup.vue'),
  readProjectFile('src/renderer/features/library/styles/manuscript.css'),
  readProjectFile('src/renderer/features/library/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/library/utils/libraryPresentation.ts'),
  readProjectFile('src/renderer/features/library/components/LibraryContextMenu.vue'),
  readProjectFile('src/renderer/features/library/components/MetadataEditDialog.vue'),
  readProjectFile('src/renderer/features/albums/pages/AlbumsPage.vue'),
  readProjectFile('src/renderer/features/albums/components/AlbumCard.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.css'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/appearance/styles/manuscript.tokens.css'),
  readProjectFile('src/renderer/features/albums/pages/AlbumDetailPage.vue'),
  readProjectFile('src/renderer/features/albums/styles/manuscript.detail.css'),
  readProjectFile('src/renderer/features/archive/pages/ArchivePage.vue'),
  readProjectFile('src/renderer/features/archive/components/MusicDnaCard.vue'),
  readProjectFile('src/renderer/features/archive/utils/archivePresentation.ts'),
  readProjectFile('src/renderer/features/archive/styles/manuscript.css'),
  readProjectFile('src/renderer/features/archive/styles/manuscript.overlays.css'),
  readProjectFile('src/renderer/features/settings/pages/SettingsPage.vue'),
  readProjectFile('src/renderer/features/settings/components/AppearanceSettings.vue'),
  readProjectFile('src/renderer/features/settings/utils/settingsPresentation.ts'),
  readProjectFile('src/renderer/features/settings/styles/manuscript.css'),
  readProjectFile('src/renderer/features/appearance/components/VisualStylePreference.vue'),
  readProjectFile('src/renderer/App.vue'),
  readProjectFile('src/renderer/app/layout/AppSidebar.vue'),
  readProjectFile('src/renderer/features/facets/components/FacetsDialog.vue'),
  readProjectFile('src/renderer/app/utils/shellPresentation.ts'),
  readProjectFile('src/renderer/features/playback/composables/useArtworkPalette.ts'),
  readProjectFile('src/renderer/app/styles/manuscript.shell.css'),
  readProjectFile('src/renderer/app/styles/manuscript.sidebar.css'),
  readProjectFile('src/renderer/app/styles/manuscript.sidebar-overlays.css'),
  readProjectFile('src/renderer/locales/en.json'),
  readProjectFile('src/renderer/locales/zh-Hans.json'),
  readProjectFile('src/renderer/locales/zh-Hant.json'),
  readProjectFile('src/renderer/app/styles/main.css'),
  readProjectFile('uno.config.ts'),
  readProjectFile('src/renderer/app/utils/playerSurfacePresentation.ts'),
  readProjectFile('src/renderer/app/styles/manuscript.player.css'),
  readProjectFile('src/renderer/app/styles/manuscript.player-overlays.css'),
  readProjectFile('src/renderer/app/layout/PlayerBar.vue'),
  readProjectFile('src/renderer/app/layout/TrackProgressInfo.vue'),
  readProjectFile('src/renderer/app/layout/NowPlayingPanel.vue'),
  readProjectFile('src/renderer/app/layout/PlaybackQueuePopover.vue'),
  readProjectFile('src/renderer/app/layout/PlaybackModeMenu.vue'),
  readProjectFile('src/renderer/features/playback/composables/useAlbumTint.ts'),
  readProjectFile('src/renderer/features/settings/composables/usePlayerBarMaterial.ts'),
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
assertExcludes(page, /VisualStyleSwitch/, 'library page visual style switch')
assertExcludes(albumsPage, /VisualStyleSwitch/, 'albums page visual style switch')
assertExcludes(albumDetailPage, /VisualStyleSwitch/, 'album detail visual style switch')
assertExcludes(archivePage, /VisualStyleSwitch/, 'archive page visual style switch')
assertExcludes(page, /LibraryArchiveHeader/, 'library archive letterhead')
assertIncludes(page, 'pageIdentity.value = snapshot.identity', 'library snapshot identity')
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
]) {
  assertStrictUtf8Text(relativePath, source)
}
assertIncludes(
  manuscriptCss,
  ".library-page[data-visual-style='manuscript']",
  'page manuscript scope',
)

// --- Phase 22: the manuscript library page root is the unframed main-column
// paper, not a fourth desk card. These negatives target the page-root rule
// only — cover groups and other pages still use the shared paper tokens. ---
const libraryPageRootRule = extractLibraryPageRootRule(manuscriptCss)
assertIncludes(libraryPageRootRule, 'margin: 0', 'page root margin reset')
assertExcludes(libraryPageRootRule, /margin\s*:\s*12px/, 'page root has no 12px card margin')
assertExcludes(
  libraryPageRootRule,
  /height\s*:\s*calc\(100%\s*-\s*24px\)/,
  'page root height fills the main column',
)
assertExcludes(
  libraryPageRootRule,
  /--manuscript-effect-paper-background/,
  'page root no paper highlight',
)
assertExcludes(libraryPageRootRule, /--manuscript-effect-page-shadow/, 'page root no page shadow')
assertIncludes(libraryPageRootRule, 'background: transparent', 'page root exposes window paper')
assertExcludes(
  manuscriptCss,
  /library-archive-header/,
  'library manuscript CSS has no archive letterhead',
)
assertExcludes(
  manuscriptCss,
  /\.library-search-zone/,
  'library manuscript CSS does not restyle search zone into a banner',
)

// Other manuscript pages keep their framed page-card identity.
for (const [label, source] of [
  ['albums manuscript CSS', albumsManuscriptCss],
  ['album detail manuscript CSS', albumDetailManuscriptCss],
  ['archive manuscript CSS', archiveManuscriptCss],
  ['settings manuscript CSS', settingsManuscriptCss],
]) {
  assertIncludes(
    source,
    '--manuscript-effect-paper-background',
    `${label} keeps the framed page card`,
  )
}
for (const [label, source] of [
  ['albums manuscript CSS', albumsManuscriptCss],
  ['archive manuscript CSS', archiveManuscriptCss],
  ['settings manuscript CSS', settingsManuscriptCss],
]) {
  assertIncludes(source, '--manuscript-effect-page-shadow', `${label} keeps the page shadow`)
}
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

assertIncludes(archivePage, 'class="archive-page content-frame"', 'archive page root class')
assertIncludes(
  archivePage,
  ':data-visual-style="archivePresentation"',
  'archive page presentation marker',
)
assertIncludes(
  archivePage,
  'resolveArchivePresentation(route.name, visualStyle.value)',
  'archive route presentation gate',
)
assertIncludes(
  archivePresentation,
  "routeName === 'archive'",
  'archive presentation route contract',
)
assertMatches(
  archivePage,
  /class\s*=\s*['"]archive-overlay['"][^>]*:data-visual-style\s*=\s*['"]archivePresentation['"]|:data-visual-style\s*=\s*['"]archivePresentation['"][^>]*class\s*=\s*['"]archive-overlay['"]/,
  'archive overlay owner scope',
)
assertIncludes(archivePage, 'v-if="isModernArchive"', 'archive modern canvas gate')
assertIncludes(
  archivePage,
  'generation !== heroFluidGeneration || !isModernArchive.value',
  'archive stale canvas work guard',
)
assertMatches(
  sharedTokens,
  /\.archive-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens archive scope',
)
assertMatches(
  sharedTokens,
  /\.archive-overlay\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens archive overlay scope',
)
assertEveryImageHasLoadingContract(archivePage, 'archive page artwork')
assertEveryImageHasLoadingContract(archiveDna, 'archive DNA artwork')
assertManuscriptCssScope(
  archiveManuscriptCss,
  'archive manuscript CSS',
  /\.archive-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)
assertManuscriptCssScope(
  archiveOverlayCss,
  'archive manuscript overlay CSS',
  /\.archive-overlay\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)

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
assertIncludes(appearanceSettings, 'VisualStylePreference', 'settings visual style entry')
assertIncludes(settingsPage, 'AppearanceSettings', 'settings appearance section')
assertIncludes(settingsPage, 'AboutSettings', 'settings about section')
assertIncludes(settingsPage, 'DEFAULT_SETTINGS_SECTION', 'settings default section')
assertExcludes(settingsPage, /settings\.nav\.playback/, 'playback is not a nav section')
assertExcludes(settingsPage, /theme-status/, 'fake theme preview is gone')
assertExcludes(settingsPage, /settings-eyebrow/, 'compact header has no eyebrow')
assertIncludes(visualStylePreference, 'useVisualStyle()', 'shared visual style state')
assertExcludes(visualStylePreference, /auralis-visual-style/, 'second visual style storage key')
assertManuscriptCssScope(
  settingsManuscriptCss,
  'settings manuscript CSS',
  /\.settings-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]|\.settings-overlay\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
)
assertIncludes(localeEn, '"modernLabel"', 'settings visual style locale keys')

assertIncludes(shellPresentation, "displayMode !== 'mini'", 'shell presentation mini exclusion')
assertIncludes(appShell, 'useVisualStyle()', 'shell unique visual style source')
assertIncludes(
  appShell,
  'resolveShellPresentation(displayMode.value, visualStyle.value)',
  'shell presentation resolver',
)
assertIncludes(
  appShell,
  ':data-shell-presentation="shellPresentation"',
  'ordinary window shell marker',
)
assertIncludes(appShell, ':presentation="shellPresentation"', 'sidebar presentation prop')
assertIncludes(appShell, 'v-if="shouldRenderShellArtwork"', 'shell artwork mount gate')
assertIncludes(
  appShell,
  'useArtworkPalette(artworkCacheKey, {\n  enabled: isModernShell,\n})',
  'shell palette enabled gate',
)
assertExcludes(appShell, /:key\s*=\s*['"]shellPresentation['"]/, 'shell presentation remount key')
assertIncludes(
  appShell,
  'v-if="displayMode === \'mini\'"',
  'miniplayer independent renderer branch',
)
assertExcludes(
  appShell,
  /<MiniPlayer\b[^>]*data-shell-presentation/,
  'Miniplayer Phase 17 shell marker',
)
assertIncludes(appSidebar, 'presentation: ShellPresentation', 'sidebar presentation contract')
assertIncludes(appSidebar, ':data-shell-presentation="presentation"', 'sidebar owner marker')
assertIncludes(appSidebar, 'class="sidebar-overlay', 'sidebar overlay owner class')
assertExcludes(appSidebar, /:key\s*=\s*['"]presentation['"]/, 'sidebar presentation remount key')
assertIncludes(facetsDialog, 'presentation?: ShellPresentation', 'facets presentation prop')
assertIncludes(
  facetsDialog,
  'class="sidebar-overlay facets-dialog-backdrop"',
  'facets overlay owner class',
)
assertIncludes(
  facetsDialog,
  ':data-shell-presentation="presentation"',
  'facets overlay presentation marker',
)
assertIncludes(artworkPalette, 'enabled?: MaybeRefOrGetter<boolean>', 'palette enabled option')
assertIncludes(artworkPalette, 'toValue(options.enabled) ?? true', 'palette default enabled')
assertIncludes(artworkPalette, 'if (!enabled) return', 'palette disabled short-circuit')
assertShellCssScope(
  shellManuscriptCss,
  'shell manuscript CSS',
  /\.app-window\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
)
assertShellCssScope(
  sidebarManuscriptCss,
  'sidebar manuscript CSS',
  /\.app-sidebar\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
)
assertShellCssScope(
  sidebarOverlayManuscriptCss,
  'sidebar overlay manuscript CSS',
  /\.sidebar-overlay\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
)
// --- 外轨纸张层级（2026-08-14）：Sidebar 与 Now Playing 使用比主内容列更深的
// aside 纸面，主列/PlayerBar/浮层仍用 page。 ---
assertIncludes(sharedTokens, '--manuscript-surface-aside', 'shared tokens define the aside surface')
assertIncludes(
  sidebarManuscriptCss,
  'var(--manuscript-surface-aside)',
  'sidebar uses the deeper aside paper surface',
)
assertIncludes(
  playerManuscriptCss,
  'var(--manuscript-surface-aside)',
  'now playing uses the deeper aside paper surface',
)
assertMatches(
  sharedTokens,
  /\.app-window\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens shell scope',
)
assertMatches(
  sharedTokens,
  /\.app-sidebar\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens sidebar scope',
)
assertMatches(
  sharedTokens,
  /\.sidebar-overlay\s*\[\s*data-shell-presentation\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens sidebar overlay scope',
)
assertMatches(
  sharedTokens,
  /\.settings-page\s*\[\s*data-visual-style\s*=\s*(['"])manuscript\1\s*\]/,
  'shared manuscript tokens settings scope',
)
assertIncludes(
  sharedTokens,
  'Compatibility remaps stay off `.app-window`',
  'shared tokens do not remap auralis variables on the app window',
)

// --- Phase 18: player surfaces (Now Playing + PlayerBar) ---
assertIncludes(
  playerSurfacePresentation,
  "displayMode === 'normal' && visualStyle === 'manuscript'",
  'player presentation normal+manuscript gate',
)
assertIncludes(
  appShell,
  'resolvePlayerSurfacePresentation(displayMode.value, visualStyle.value)',
  'player presentation resolver in App',
)
assertIncludes(
  appShell,
  ':presentation="playerPresentation"',
  'player presentation propagated by prop',
)
assertExcludes(appShell, /:key\s*=\s*['"]playerPresentation['"]/, 'player presentation remount key')
assertIncludes(playerBar, 'props.presentation', 'player bar presentation prop')
assertIncludes(
  playerBar,
  ':data-player-presentation="props.presentation"',
  'player bar owner marker',
)
assertIncludes(
  mainCss,
  ".player-bar[data-player-presentation='modern'] .transport-control-primary",
  'modern play button is scoped to modern player presentation',
)
assertIncludes(
  mainCss,
  'var(--auralis-control-primary-bg)',
  'modern play button uses the stable primary fill',
)
assertIncludes(
  mainCss,
  'var(--auralis-control-primary-text)',
  'modern play button uses the stable primary icon color',
)
assertExcludes(
  mainCss,
  /^\.transport-control-primary(?:\s|:)/m,
  'play button fill is not an unscoped album-accent disc',
)
assertIncludes(
  playerManuscriptCss,
  'background: var(--manuscript-surface-stamp)',
  'manuscript play button keeps the stamp fill',
)
assertIncludes(mainCss, '.player-bar-island', 'modern player bar owns a centered island surface')
assertIncludes(
  mainCss,
  'min(920px, calc(100% - 48px))',
  'modern island is capped at 920px with 24px side gaps',
)
assertIncludes(mainCss, 'pointer-events: none', 'modern host is a click-through positioning slot')
assertIncludes(mainCss, 'bottom: 24px', 'modern host sits 24px off the window bottom')
assertIncludes(
  mainCss,
  ".player-bar[data-player-presentation='modern'] .track-info-card",
  'modern track info stays on the island identity slot',
)
assertIncludes(
  mainCss,
  ".player-bar[data-player-presentation='modern'] .player-bar-progress-row .track-progress",
  'modern progress lives in the track-card progress row',
)
assertIncludes(mainCss, 'left: 260px', 'modern host aligns to the main column left edge')
assertIncludes(
  mainCss,
  '@container modern-player-bar (max-width: 800px)',
  'modern island collapses the volume slider at 800px',
)
assertIncludes(
  mainCss,
  '@container modern-player-bar (max-width: 720px)',
  'modern island hides the subtitle at 720px',
)
assertIncludes(
  mainCss,
  '@container modern-player-bar (max-width: 640px)',
  'modern island overflow threshold is 640px',
)
assertExcludes(
  playerBar,
  /player-bar-progress-rail/,
  'modern dual-rail progress rail markup is gone',
)
assertExcludes(playerBar, /player-bar-content-row/, 'modern dual-rail content row markup is gone')
assertExcludes(mainCss, /player-bar-progress-rail/, 'modern CSS no longer owns a top progress rail')
assertExcludes(
  mainCss,
  /player-bar-content-row/,
  'modern CSS no longer owns a dual-rail content row',
)
assertExcludes(
  mainCss,
  /^\.player-bar\s*\{[^}]*left:\s*260px[^}]*right:\s*0[^}]*bottom:\s*0/m,
  'bare .player-bar is not a flush dock',
)
assertIncludes(playerBar, 'player-bar-island', 'modern island surface markup')
assertIncludes(playerBar, 'player-bar-overflow', 'modern overflow exists for the 640px retreat')
assertIncludes(playerBar, 'isUtilitiesOverflow', 'overflow is gated on the 640px helper')
assertIncludes(
  playerBar,
  'togglePlayerBarExclusiveOverlay',
  'player bar toggles go through exclusive overlay helper',
)
assertIncludes(
  playerBar,
  'resolveVolumeHoverOverlayFlags',
  'volume hover exclusivity is gated on overlay retreat',
)
assertIncludes(
  playerBar,
  'isPlayerBarVolumeOverlayRetreatActive',
  'volume overlay retreat uses presentation-scoped collapse',
)
assertIncludes(playerBar, 'show-split-clocks', 'modern identity card shows in-card split clocks')
assertIncludes(
  trackProgressInfo,
  'formatPlaybackClock',
  'track card formats the split progress clocks',
)
assertIncludes(
  playerSurfacePresentation,
  'resolvePlayerPaletteEnabled',
  'player palette enabled resolver',
)
assertIncludes(playerBar, 'enabled: paletteEnabled', 'player bar palette enabled gate')
assertIncludes(
  playerBar,
  'resolvePlayerPaletteEnabled',
  'player bar palette gate combines presentation and active display mode',
)
assertIncludes(
  nowPlayingPanel,
  ':data-player-presentation="presentation"',
  'now playing owner marker',
)
assertIncludes(
  playbackQueuePopover,
  'class="player-overlay queue-popover"',
  'queue overlay owner class',
)
assertIncludes(
  playbackQueuePopover,
  ':data-player-presentation="props.presentation"',
  'queue overlay presentation marker',
)
assertIncludes(
  playbackModeMenu,
  'class="player-overlay playback-mode-menu"',
  'mode menu overlay owner class',
)
assertIncludes(
  playbackModeMenu,
  ':data-player-presentation="props.presentation"',
  'mode menu overlay presentation marker',
)
assertIncludes(albumTint, 'TINT_CROSSFADE_MS', 'album tint composable timer')
assertPlayerCssScope(playerManuscriptCss, 'player manuscript CSS')
assertPlayerCssScope(playerOverlayManuscriptCss, 'player overlay manuscript CSS')
assertMatches(
  playerManuscriptCss,
  /\.player-bar\s*\[\s*data-player-presentation\s*=\s*(['"])manuscript\1\s*\]\s*,/,
  'reduced-motion hits the player-bar root itself',
)
assertExcludes(playerBarMaterial, /['"]manuscript['"]/, 'no manuscript material store value')
assertIncludes(
  playerBarMaterial,
  'auralis-player-bar-material',
  'single player material storage key',
)

// --- Phase 23 方案 A: manuscript PlayerBar main-column footer (owner-scoped) ---
for (const [declaration, label] of [
  ['left: 260px', 'main-column left edge on the sidebar track'],
  ['right: 0', 'sub-xl flush right when Now Playing is hidden'],
  ['right: 20%', 'xl right edge aligned to the shell 20% Now Playing track'],
  ['bottom: 0', 'flush bottom edge'],
  ['min-width: 0', 'dock min-width reset'],
  ['border-radius: 0', 'all four corners square against adjacent columns'],
  ['transform: none', 'dock transform reset'],
  ['box-shadow: var(--manuscript-effect-dock-shadow)', 'inner dock shadow token'],
]) {
  assertIncludes(playerManuscriptCss, declaration, `player manuscript ${label}`)
}
assertExcludes(
  playerManuscriptCss,
  /left:\s*calc\(\s*260px\s*\+\s*16px\s*\)/,
  'no floating left inset on manuscript player bar',
)
assertExcludes(playerManuscriptCss, /20vw/, 'manuscript player bar must use 20% not 20vw')
assertExcludes(
  playerManuscriptCss,
  /border-radius:\s*16px/,
  'no 16px corner radius on manuscript player bar',
)
assertExcludes(
  playerManuscriptCss,
  /bottom:\s*16px/,
  'no floating bottom inset on manuscript player bar',
)
assertExcludes(
  playerManuscriptCss,
  /\.player-bar\s*\[\s*data-player-presentation\s*=\s*(['"])manuscript\1\s*\]\s*:hover/,
  'no manuscript player-bar hover lift shadow',
)
assertExcludes(
  playerManuscriptCss,
  /0\s+12px\s+32px/,
  'no large outer hover projection on manuscript player bar',
)
assertIncludes(
  mainCss,
  ".player-bar[data-player-presentation='modern']",
  'modern player bar owns host geometry under presentation scope',
)
assertIncludes(shellManuscriptCss, '--auralis-playbar-safe-area: 88px', 'manuscript dock safe area')
assertIncludes(mainCss, '--auralis-playbar-safe-area: 96px', 'modern island safe area is 96px')
assertIncludes(playerBar, 'player-bar-dock-main', 'player bar dock main wrapper')
assertIncludes(playerBar, 'player-bar-dock-actions', 'player bar dock actions wrapper')
assertIncludes(
  playerManuscriptCss,
  'justify-content: flex-end',
  'player manuscript dock-actions end-align on the footer right edge',
)
assertIncludes(playerManuscriptCss, 'gap: 16px', 'player manuscript dock-actions fixed group gap')
assertIncludes(playerBar, 'PlayerBarTimeColophon', 'manuscript time colophon mount')
assertIncludes(playerManuscriptCss, '.player-bar-time', 'manuscript time colophon owner style')

// --- 2026-08-14 Playbar layout optimization: full-width bottom timeline +
// end-aligned right tool group (owner-scoped, per design doc §4.2/§4.3) ---
assertMatches(
  playerManuscriptCss,
  /\.player-bar\s*\[\s*data-player-presentation\s*=\s*(['"])manuscript\1\s*\]\s*\.track-progress\s*\{[^}]*position\s*:\s*absolute[^}]*left\s*:\s*20px[^}]*right\s*:\s*20px[^}]*bottom\s*:\s*0/,
  'manuscript progress is the full-width bottom rail',
)
assertIncludes(playerManuscriptCss, 'height: 72px', 'player manuscript dock height stays 72px')
assertExcludes(
  playerManuscriptCss,
  /max-width\s*:\s*160px/,
  'empty-state progress shares the full-width rail geometry',
)
assertMatches(
  playerManuscriptCss,
  /\.player-bar\s*\[\s*data-player-presentation\s*=\s*(['"])manuscript\1\s*\]\s*\.volume-control-group\s*\{[^}]*margin-left\s*:\s*8px[^}]*border-left\s*:\s*var\(--manuscript-hairline-width\)\s+solid\s+var\(--manuscript-border-subtle\)/,
  'volume group hairline separator from behavior buttons',
)
assertExcludes(
  playerManuscriptCss,
  /\.player-bar-time[^{]*\{[^}]*margin-left\s*:\s*auto/,
  'time colophon uses fixed group spacing, not margin-left auto',
)
assertIncludes(playerBar, 'player-bar-dock-rule', 'player bar dock rule wrapper')
assertIncludes(playerBar, 'volume-overlay', 'player bar volume overlay markup')
assertIncludes(
  playerManuscriptCss,
  '@container manuscript-player-bar',
  'volume collapse container query',
)
assertIncludes(playerOverlayManuscriptCss, 'volume-overlay', 'volume overlay manuscript styling')

for (const [label, source] of [
  ['manuscript.css', manuscriptCss],
  ['manuscript.overlays.css', overlayCss],
  ['albums manuscript.css', albumsManuscriptCss],
  ['albums manuscript.overlays.css', albumsOverlayCss],
  ['album detail manuscript.css', albumDetailManuscriptCss],
  ['archive manuscript.css', archiveManuscriptCss],
  ['archive manuscript.overlays.css', archiveOverlayCss],
  ['settings manuscript.css', settingsManuscriptCss],
  ['shell manuscript.css', shellManuscriptCss],
  ['sidebar manuscript.css', sidebarManuscriptCss],
  ['sidebar overlay manuscript.css', sidebarOverlayManuscriptCss],
  ['player manuscript.css', playerManuscriptCss],
  ['player overlay manuscript.css', playerOverlayManuscriptCss],
  ['shared manuscript tokens.css', sharedTokens],
  ['main.css', mainCss],
  ['uno.config.ts', unoConfig],
]) {
  assertExcludes(
    source,
    /(?:html|body|#app)[^{\n]*(?:data-visual-style|data-shell-presentation)[^\n{]*/i,
    label,
  )
}

for (const [label, source] of [
  ['library manuscript.css', manuscriptCss],
  ['library manuscript.overlays.css', overlayCss],
  ['albums manuscript.css', albumsManuscriptCss],
  ['albums manuscript.overlays.css', albumsOverlayCss],
  ['album detail manuscript.css', albumDetailManuscriptCss],
  ['archive manuscript.css', archiveManuscriptCss],
  ['archive manuscript.overlays.css', archiveOverlayCss],
  ['settings manuscript.css', settingsManuscriptCss],
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
  'Library, album catalog, album detail, archive, settings, shell, and player visual scope checks passed.',
)
