import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isThemeMode, resolveTheme, THEME_STORAGE_KEY, useTheme } from './useTheme'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value))
  }
}

class MockDocumentElement {
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
}

class MockDocument {
  documentElement = new MockDocumentElement()
}

describe('useTheme', () => {
  let originalStorage: Storage | undefined
  let originalDocument: Document | undefined
  let mockStorage: MemoryStorage
  let mockDoc: MockDocument

  beforeEach(() => {
    mockStorage = new MemoryStorage()
    mockDoc = new MockDocument()

    originalStorage = globalThis.localStorage
    originalDocument = globalThis.document

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })

    Object.defineProperty(globalThis, 'document', {
      value: mockDoc as unknown as Document,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    if (originalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalStorage,
        writable: true,
        configurable: true,
      })
    }
    if (originalDocument !== undefined) {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      })
    }
  })

  it('validates theme modes correctly', () => {
    expect(isThemeMode('dark')).toBe(true)
    expect(isThemeMode('light')).toBe(true)
    expect(isThemeMode('system')).toBe(false)
    expect(isThemeMode('')).toBe(false)
    expect(isThemeMode(null)).toBe(false)
    expect(isThemeMode(undefined)).toBe(false)
    expect(isThemeMode(123)).toBe(false)
  })

  it('resolves theme from requested value or storage fallback', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')

    // No requested mode, storage empty -> default to dark
    expect(resolveTheme()).toBe(DEFAULT_THEME)

    // Storage has light
    mockStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(resolveTheme()).toBe('light')

    // Storage has invalid value -> default to dark
    mockStorage.setItem(THEME_STORAGE_KEY, 'invalid')
    expect(resolveTheme()).toBe(DEFAULT_THEME)
  })

  it('initializes to dark by default when storage is empty', () => {
    const { theme, isDark, initTheme } = useTheme()
    initTheme()

    expect(theme.value).toBe('dark')
    expect(isDark.value).toBe(true)
    expect(mockDoc.documentElement.dataset.theme).toBe('dark')
    expect(mockDoc.documentElement.style.colorScheme).toBe('dark')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('initializes to light when stored in localStorage', () => {
    mockStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { theme, isDark, initTheme } = useTheme()
    initTheme()

    expect(theme.value).toBe('light')
    expect(isDark.value).toBe(false)
    expect(mockDoc.documentElement.dataset.theme).toBe('light')
    expect(mockDoc.documentElement.style.colorScheme).toBe('light')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('sets theme to light and dark and updates storage and document attributes', async () => {
    const { theme, isDark, nextThemeLabel, setTheme } = useTheme()

    await setTheme('light')
    expect(theme.value).toBe('light')
    expect(isDark.value).toBe(false)
    expect(nextThemeLabel.value).toBe('Dark theme')
    expect(mockDoc.documentElement.dataset.theme).toBe('light')
    expect(mockDoc.documentElement.style.colorScheme).toBe('light')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    await setTheme('dark')
    expect(theme.value).toBe('dark')
    expect(isDark.value).toBe(true)
    expect(nextThemeLabel.value).toBe('Light theme')
    expect(mockDoc.documentElement.dataset.theme).toBe('dark')
    expect(mockDoc.documentElement.style.colorScheme).toBe('dark')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('toggles theme back and forth', async () => {
    const { theme, initTheme, toggleTheme } = useTheme()
    mockStorage.setItem(THEME_STORAGE_KEY, 'dark')
    initTheme()
    expect(theme.value).toBe('dark')

    await toggleTheme()
    expect(theme.value).toBe('light')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(mockDoc.documentElement.dataset.theme).toBe('light')

    await toggleTheme()
    expect(theme.value).toBe('dark')
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(mockDoc.documentElement.dataset.theme).toBe('dark')
  })
})
