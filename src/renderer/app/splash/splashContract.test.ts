import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@renderer/composables/useTheme'
import { SPLASH_FADE_OUT_MS } from './splashController'
import { SPLASH_FORMATION_MS, SPLASH_RESONANCE_PATH } from './splashMotion'

/**
 * 开屏首帧与应用主样式之间的单一维护契约：
 * splash.css 的首帧色值、字体角色、品牌路径必须与 main.css / typography.css /
 * 应用图标 SVG 保持一致；任一侧漂移都会在这里失败。
 */

const mainCss = readFileSync(fileURLToPath(new URL('../styles/main.css', import.meta.url)), 'utf8')
const typographyCss = readFileSync(
  fileURLToPath(new URL('../styles/typography.css', import.meta.url)),
  'utf8',
)
const splashCss = readFileSync(
  fileURLToPath(new URL('../../public/splash/splash.css', import.meta.url)),
  'utf8',
)
const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
const iconSvg = readFileSync(
  fileURLToPath(new URL('../../../../resources/icons/auralis-icon.svg', import.meta.url)),
  'utf8',
)
const themeBootJs = readFileSync(
  fileURLToPath(new URL('../../public/splash/theme-boot.js', import.meta.url)),
  'utf8',
)
const markSvg = readFileSync(
  fileURLToPath(new URL('../../../../resources/icons/auralis-mark.svg', import.meta.url)),
  'utf8',
)
const sidebarVue = readFileSync(
  fileURLToPath(new URL('../layout/AppSidebar.vue', import.meta.url)),
  'utf8',
)

function extractCssBlock(css: string, startRegex: RegExp): string {
  const match = startRegex.exec(css)
  if (!match) throw new Error(`CSS block not found: ${startRegex}`)
  const start = match.index + match[0].length
  const end = css.indexOf('}', start)
  if (end === -1) throw new Error(`Unterminated CSS block: ${startRegex}`)
  return css.slice(start, end)
}

function readCustomProperty(block: string, name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block)
  if (!match) throw new Error(`Custom property not found: ${name}`)
  return match[1].trim().replace(/\s+/g, ' ')
}

describe('splash first-frame color contract', () => {
  const mainDark = extractCssBlock(mainCss, /:root,\s*\[data-theme='dark'\]\s*\{/)
  const mainLight = extractCssBlock(mainCss, /\[data-theme='light'\]\s*\{/)
  const splashDark = extractCssBlock(splashCss, /:root,\s*\[data-theme='dark'\]\s*\{/)
  const splashLight = extractCssBlock(splashCss, /\[data-theme='light'\]\s*\{/)

  const pairs = [
    { theme: 'dark', block: splashDark, main: mainDark },
    { theme: 'light', block: splashLight, main: mainLight },
  ] as const

  for (const { theme, block, main } of pairs) {
    it(`matches main.css tokens in the ${theme} theme`, () => {
      expect(readCustomProperty(block, '--splash-bg')).toBe(
        readCustomProperty(main, '--auralis-bg'),
      )
      expect(readCustomProperty(block, '--splash-accent')).toBe(
        readCustomProperty(main, '--auralis-theme-accent'),
      )
      expect(readCustomProperty(block, '--splash-text')).toBe(
        readCustomProperty(main, '--auralis-text'),
      )
    })

    it(`uses hex color literals for the static ${theme} splash colors`, () => {
      const names = ['--splash-bg', '--splash-text']
      for (const name of names) {
        expect(readCustomProperty(block, name)).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  }

  it('uses the first-frame derived accent in the dark splash with a rose fallback', () => {
    expect(readCustomProperty(splashDark, '--splash-accent')).toBe(
      'var(--auralis-dark-accent, #1dd55f)',
    )
    expect(readCustomProperty(mainDark, '--auralis-theme-accent')).toBe(
      'var(--auralis-dark-accent, #1dd55f)',
    )
    expect(themeBootJs).toContain("setProperty('--auralis-dark-accent'")
  })

  it('uses the first-frame derived accent in the light splash', () => {
    expect(readCustomProperty(splashLight, '--splash-accent')).toBe(
      'var(--auralis-light-accent, #585b5f)',
    )
    expect(readCustomProperty(mainLight, '--auralis-theme-accent')).toBe(
      'var(--auralis-light-accent, #585b5f)',
    )
    expect(themeBootJs).toContain("setProperty('--auralis-light-accent'")
  })

  it('does not reference the legacy icon blues', () => {
    expect(splashCss).not.toMatch(/#2563eb|#4d8fff/i)
  })
})

describe('splash typography contract', () => {
  it('mirrors the --auralis-font-ui stack for the brand text', () => {
    const uiStack = readCustomProperty(typographyCss, '--auralis-font-ui')
    const latinFont = readCustomProperty(typographyCss, '--auralis-font-latin')
    const brandBlock = extractCssBlock(splashCss, /#splash-brand\s*\{/)
    expect(readCustomProperty(splashCss, '--auralis-font-latin')).toBe(latinFont)
    expect(readCustomProperty(splashCss, '--splash-font-ui')).toBe(uiStack)
    expect(readCustomProperty(brandBlock, 'font-family')).toBe('var(--splash-font-ui)')

    const errorBlock = extractCssBlock(splashCss, /\.splash-startup-error\s*\{/)
    expect(readCustomProperty(errorBlock, 'font-family')).toBe(
      "var(--auralis-font-latin), 'HarmonyOS Sans SC', sans-serif",
    )
  })
})

describe('splash brand mark contract', () => {
  it('uses both source paths in the app icon, sidebar and splash', () => {
    const paths = (markup: string): string[] =>
      Array.from(markup.matchAll(/<path\b[^>]*\bd="([^"]+)"/g), (match) => match[1])
    const sourcePaths = paths(markSvg)
    const splashSvg = /<svg\s+id="splash-mark"[\s\S]*?<\/svg>/.exec(indexHtml)?.[0] ?? ''
    const sidebarSvg =
      /<svg\s+class="sidebar-brand-symbol"[\s\S]*?<\/svg>/.exec(sidebarVue)?.[0] ?? ''
    expect(sourcePaths).toHaveLength(2)
    expect(paths(iconSvg)).toEqual(sourcePaths)
    // 前两条是最终定格路径；后两条将同一外轮廓拆成左右两半，仅用于成形。
    expect(paths(splashSvg).slice(0, 2)).toEqual(sourcePaths)
    expect(paths(splashSvg)).toHaveLength(4)
    expect(sourcePaths[1]).toBe(SPLASH_RESONANCE_PATH)
    expect(paths(sidebarSvg)).toEqual(sourcePaths)
    expect(splashSvg).toContain('viewBox="0 0 64 64"')
    expect(sidebarSvg).toContain('viewBox="0 0 64 64"')
  })

  it('renders a bare line without the icon plate or hardcoded colors', () => {
    const start = indexHtml.indexOf('<div id="splash"')
    const end = indexHtml.indexOf('<script type="module"')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const splashMarkup = indexHtml.slice(start, end)
    expect(splashMarkup).not.toContain('<rect')
    expect(splashMarkup).not.toMatch(/#2563eb|#4d8fff/i)
  })

  it('keeps round caps and joins in splash.css', () => {
    expect(splashCss).toContain('stroke-linecap: round')
    expect(splashCss).toContain('stroke-linejoin: round')
  })

  it('uses the theme accent for all strokes and hides auxiliary legs by default', () => {
    const waveBlock = extractCssBlock(splashCss, /\.splash-brand-stroke\s*\{/)
    const legsBlock = extractCssBlock(splashCss, /\.splash-forming-leg\s*\{/)
    expect(readCustomProperty(waveBlock, 'stroke')).toBe('var(--splash-accent)')
    expect(readCustomProperty(legsBlock, 'opacity')).toBe('0')
    expect(indexHtml).not.toContain('splash-dot')
  })
})

describe('splash timing contract', () => {
  it('matches the fade duration between controller and splash.css', () => {
    const transition = /transition:\s*opacity\s+(\d+)ms/.exec(splashCss)?.[1]
    expect(transition).toBe(String(SPLASH_FADE_OUT_MS))
  })

  it('uses the approved 900ms formation and 300ms exit', () => {
    expect(SPLASH_FORMATION_MS).toBe(900)
    expect(SPLASH_FORMATION_MS + SPLASH_FADE_OUT_MS).toBe(1_200)
  })
})

describe('theme boot contract', () => {
  it('follows the useTheme storage key, valid values and default', () => {
    expect(themeBootJs).toContain(`'${THEME_STORAGE_KEY}'`)
    expect(themeBootJs).toMatch(/AURALIS_THEME_VALUES\s*=\s*\['light',\s*'dark'\]/)
    expect(themeBootJs).toContain(`'${DEFAULT_THEME}'`)
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('applies data-theme and color-scheme on the root element', () => {
    expect(themeBootJs).toContain('localStorage.getItem')
    expect(themeBootJs).toContain('dataset.theme')
    expect(themeBootJs).toContain('colorScheme')
  })
})
