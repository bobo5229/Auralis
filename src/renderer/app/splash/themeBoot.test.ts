import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import {
  DARK_ACCENT_STORAGE_KEY,
  DEFAULT_DARK_ACCENT,
} from '@renderer/features/appearance/constants/darkAccent'
import { resolveDarkAccent } from '@renderer/features/appearance/utils/resolveDarkAccent'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@renderer/composables/useTheme'

const script = readFileSync(new URL('../../public/splash/theme-boot.js', import.meta.url), 'utf8')

interface BootOptions {
  values?: Record<string, string>
  failReads?: string[]
  navigationType?: string
}

function runBoot(options: BootOptions = {}) {
  const values = options.values ?? {}
  const failReads = new Set(options.failReads ?? [])
  const styleValues = new Map<string, string>()
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: '',
      setProperty(name: string, value: string) {
        styleValues.set(name, value)
      },
    },
  }

  runInNewContext(script, {
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem(key: string) {
          if (failReads.has(key)) throw new Error(`read failed for ${key}`)
          return values[key] ?? null
        },
      },
      performance: {
        getEntriesByType: () => (options.navigationType ? [{ type: options.navigationType }] : []),
      },
    },
  })

  return { root, styleValues }
}

function expectAccentVars(styleValues: Map<string, string>, value: unknown): void {
  const expected = resolveDarkAccent(value)
  expect(styleValues.get('--auralis-dark-accent-source')).toBe(expected.source)
  expect(styleValues.get('--auralis-dark-accent')).toBe(expected.display)
  expect(styleValues.get('--auralis-dark-on-accent')).toBe(expected.onAccent)
}

it.each([
  ['default', undefined, DEFAULT_DARK_ACCENT],
  ['black', '#000000', '#000000'],
  ['near white', '#FFFFFF', '#FFFFFF'],
  ['saturated blue', '#0000FF', '#0000FF'],
  ['mixed case', ' #60a5fa ', ' #60a5fa '],
  ['invalid value', 'rgba(2,3,4,.5)', 'rgba(2,3,4,.5)'],
])('applies matching Renderer dark accent rules for %s', (_label, accent, stored) => {
  const values: Record<string, string> =
    accent === undefined ? {} : { [DARK_ACCENT_STORAGE_KEY]: stored as string }
  const { root, styleValues } = runBoot({ values })
  expect(root.dataset.theme).toBe(DEFAULT_THEME)
  expect(root.style.colorScheme).toBe(DEFAULT_THEME)
  expectAccentVars(styleValues, accent)
  expect(values[DARK_ACCENT_STORAGE_KEY]).toBe(accent === undefined ? undefined : stored)
})

it('reads the theme and accent independently when one storage key throws', () => {
  const accentFailure = runBoot({
    values: { [THEME_STORAGE_KEY]: 'light' },
    failReads: [DARK_ACCENT_STORAGE_KEY],
  })
  expect(accentFailure.root.dataset.theme).toBe('light')
  expectAccentVars(accentFailure.styleValues, DEFAULT_DARK_ACCENT)

  const themeFailure = runBoot({
    values: { [DARK_ACCENT_STORAGE_KEY]: '#000000' },
    failReads: [THEME_STORAGE_KEY],
  })
  expect(themeFailure.root.dataset.theme).toBe(DEFAULT_THEME)
  expectAccentVars(themeFailure.styleValues, '#000000')
})

it.each(['navigate', 'reload', undefined])(
  'retains the existing refresh splash rule for %s',
  (navigationType) => {
    const { root } = runBoot({ navigationType })
    expect(root.dataset.splashSkipped).toBe(navigationType === 'reload' ? 'true' : undefined)
  },
)
