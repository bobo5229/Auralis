import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  DARK_ACCENT_STORAGE_KEY,
  DEFAULT_DARK_ACCENT,
} from '@renderer/features/appearance/constants/darkAccent'
import { resolveDarkAccent } from '@renderer/features/appearance/utils/resolveDarkAccent'
import {
  DEFAULT_LIGHT_ACCENT,
  LIGHT_ACCENT_STORAGE_KEY,
} from '@renderer/features/appearance/constants/lightAccent'
import { resolveLightAccent } from '@renderer/features/appearance/utils/resolveLightAccent'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@renderer/composables/useTheme'

const script = readFileSync(new URL('../../public/splash/theme-boot.js', import.meta.url), 'utf8')

interface BootOptions {
  reducedMotion?: boolean
  values?: Record<string, string>
  failReads?: string[]
  navigationType?: string
}

function runBoot(options: BootOptions = {}) {
  const values = options.values ?? {}
  const failReads = new Set(options.failReads ?? [])
  const styleValues = new Map<string, string>()
  const storageWrites: Array<[string, string]> = []
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
      matchMedia: () => ({ matches: options.reducedMotion ?? false }),
      localStorage: {
        getItem(key: string) {
          if (failReads.has(key)) throw new Error(`read failed for ${key}`)
          return values[key] ?? null
        },
        setItem(key: string, value: string) {
          storageWrites.push([key, value])
        },
      },
      performance: {
        getEntriesByType: () => (options.navigationType ? [{ type: options.navigationType }] : []),
      },
    },
  })

  return { root, styleValues, storageWrites }
}

describe('boot motion preference', () => {
  it('applies the saved preference before the main bundle loads', () => {
    expect(
      runBoot({ values: { 'auralis-reduced-motion': 'reduce' } }).root.dataset.reducedMotion,
    ).toBe('true')
  })
  it('follows the system for absent, system or invalid stored values', () => {
    for (const value of [undefined, 'system', 'invalid']) {
      const values: Record<string, string> = value ? { 'auralis-reduced-motion': value } : {}
      expect(runBoot({ values, reducedMotion: true }).root.dataset.reducedMotion).toBe('true')
      expect(runBoot({ values, reducedMotion: false }).root.dataset.reducedMotion).toBe('false')
    }
  })
  it('keeps the system preference when storage cannot be read', () => {
    expect(
      runBoot({ failReads: ['auralis-reduced-motion'], reducedMotion: true }).root.dataset
        .reducedMotion,
    ).toBe('true')
  })
})

function expectAccentVars(styleValues: Map<string, string>, value: unknown): void {
  const expected = resolveDarkAccent(value)
  expect(styleValues.get('--auralis-dark-accent-source')).toBe(expected.source)
  expect(styleValues.get('--auralis-dark-accent')).toBe(expected.display)
  expect(styleValues.get('--auralis-dark-on-accent')).toBe(expected.onAccent)
}

function expectLightAccentVars(styleValues: Map<string, string>, value: unknown): void {
  const expected = resolveLightAccent(value)
  expect(styleValues.get('--auralis-light-accent-source')).toBe(expected.source)
  expect(styleValues.get('--auralis-light-accent')).toBe(expected.display)
  expect(styleValues.get('--auralis-light-accent-soft')).toBe(expected.soft)
  expect(styleValues.get('--auralis-light-on-accent')).toBe(expected.onAccent)
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

it.each([
  ['default', undefined, DEFAULT_LIGHT_ACCENT],
  ['white', '#FFFFFF', '#FFFFFF'],
  ['custom green', '#00FF00', '#00FF00'],
  ['fractional hover contrast', '#09AAB0', '#09AAB0'],
  ['mixed case', ' #60a5fa ', ' #60a5fa '],
  ['invalid value', 'rgba(2,3,4,.5)', 'rgba(2,3,4,.5)'],
])('applies matching Renderer light accent rules for %s', (_label, accent, stored) => {
  const values: Record<string, string> =
    accent === undefined ? {} : { [LIGHT_ACCENT_STORAGE_KEY]: stored as string }
  const { root, styleValues, storageWrites } = runBoot({ values })
  expect(root.dataset.theme).toBe(DEFAULT_THEME)
  expectLightAccentVars(styleValues, accent)
  expect(values[LIGHT_ACCENT_STORAGE_KEY]).toBe(accent === undefined ? undefined : stored)
  expect(storageWrites).toEqual([])
})

it('reads light and dark accents independently when either accent key throws', () => {
  const lightFailure = runBoot({
    values: { [DARK_ACCENT_STORAGE_KEY]: '#000000' },
    failReads: [LIGHT_ACCENT_STORAGE_KEY],
  })
  expectAccentVars(lightFailure.styleValues, '#000000')
  expectLightAccentVars(lightFailure.styleValues, DEFAULT_LIGHT_ACCENT)

  const darkFailure = runBoot({
    values: { [LIGHT_ACCENT_STORAGE_KEY]: '#00FF00' },
    failReads: [DARK_ACCENT_STORAGE_KEY],
  })
  expectAccentVars(darkFailure.styleValues, DEFAULT_DARK_ACCENT)
  expectLightAccentVars(darkFailure.styleValues, '#00FF00')
})

it('reads both accent preferences without modifying either stored value', () => {
  const values = {
    [DARK_ACCENT_STORAGE_KEY]: '#F472B6',
    [LIGHT_ACCENT_STORAGE_KEY]: '#FFFF80',
  }
  const { styleValues, storageWrites } = runBoot({ values })

  expectAccentVars(styleValues, values[DARK_ACCENT_STORAGE_KEY])
  expectLightAccentVars(styleValues, values[LIGHT_ACCENT_STORAGE_KEY])
  expect(storageWrites).toEqual([])
  expect(values).toEqual({
    [DARK_ACCENT_STORAGE_KEY]: '#F472B6',
    [LIGHT_ACCENT_STORAGE_KEY]: '#FFFF80',
  })
})

it.each(['navigate', 'reload', undefined])(
  'retains the existing refresh splash rule for %s',
  (navigationType) => {
    const { root } = runBoot({ navigationType })
    expect(root.dataset.splashSkipped).toBe(navigationType === 'reload' ? 'true' : undefined)
  },
)
