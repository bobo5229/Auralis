import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@renderer/composables/useTheme'
import { SPLASH_DOT_TRAVEL_MS, SPLASH_FADE_OUT_MS } from './splashController'

/**
 * 开屏首帧与应用主样式之间的单一维护契约：
 * splash.css 的首帧色值、字体角色、波形轨迹必须与 main.css / typography.css /
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
      const names =
        theme === 'dark'
          ? ['--splash-bg', '--splash-text']
          : ['--splash-bg', '--splash-accent', '--splash-text']
      for (const name of names) {
        expect(readCustomProperty(block, name)).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })
  }

  it('uses the first-frame derived accent in the dark splash with a rose fallback', () => {
    expect(readCustomProperty(splashDark, '--splash-accent')).toBe(
      'var(--auralis-dark-accent, #f472b6)',
    )
    expect(readCustomProperty(mainDark, '--auralis-theme-accent')).toBe(
      'var(--auralis-dark-accent, #f472b6)',
    )
    expect(themeBootJs).toContain("setProperty('--auralis-dark-accent'")
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

describe('splash waveform contract', () => {
  it('reuses the app icon waveform path verbatim', () => {
    const iconPath = /<path\s+d="([^"]+)"/.exec(iconSvg)?.[1]
    const splashPath = /id="splash-waveform-path"\s+d="([^"]+)"/.exec(indexHtml)?.[1]
    expect(iconPath).toBeTruthy()
    expect(splashPath).toBe(iconPath?.trim())
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

  it('keeps the moving dot distinct from the waveform in both themes', () => {
    const waveBlock = extractCssBlock(splashCss, /#splash-waveform-path\s*\{/)
    const dotBlock = extractCssBlock(splashCss, /#splash-dot\s*\{/)
    expect(readCustomProperty(waveBlock, 'stroke')).toBe('var(--splash-accent)')
    expect(readCustomProperty(dotBlock, 'fill')).toBe('var(--splash-text)')
    expect(readCustomProperty(dotBlock, 'stroke')).toBe('var(--splash-bg)')
  })
})

describe('splash timing contract', () => {
  it('matches the fade duration between controller and splash.css', () => {
    const transition = /transition:\s*opacity\s+(\d+)ms/.exec(splashCss)?.[1]
    expect(transition).toBe(String(SPLASH_FADE_OUT_MS))
  })

  it('keeps the overall splash around 1.5 seconds', () => {
    expect(SPLASH_DOT_TRAVEL_MS + SPLASH_FADE_OUT_MS).toBe(1_500)
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
