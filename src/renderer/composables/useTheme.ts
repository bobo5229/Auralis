import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

export type ThemeTransitionOrigin = {
  x: number
  y: number
}

export const THEME_STORAGE_KEY = 'auralis-theme'
export const DEFAULT_THEME: ThemeMode = 'dark'

const theme = ref<ThemeMode>(DEFAULT_THEME)
const isThemeTransitioning = ref(false)

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

export function resolveTheme(requested?: ThemeMode | null): ThemeMode {
  if (requested && isThemeMode(requested)) {
    return requested
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (isThemeMode(stored)) {
        return stored
      }
    }
  } catch {
    // Ignore storage access errors in restricted/headless contexts
  }

  return DEFAULT_THEME
}

function commitTheme(nextTheme: ThemeMode): void {
  const resolved = isThemeMode(nextTheme) ? nextTheme : DEFAULT_THEME
  theme.value = resolved

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, resolved)
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Apply theme immediately and persist to local storage.
 */
async function setTheme(
  nextTheme: ThemeMode,
  options?: {
    animate?: boolean
    origin?: ThemeTransitionOrigin
  },
): Promise<void> {
  void options
  if (isThemeTransitioning.value) return

  const resolved = isThemeMode(nextTheme) ? nextTheme : DEFAULT_THEME
  if (
    theme.value === resolved &&
    (typeof document === 'undefined' || document.documentElement?.dataset.theme === resolved)
  ) {
    return
  }

  commitTheme(resolved)
}

function toggleTheme(): Promise<void> {
  const next: ThemeMode = theme.value === 'dark' ? 'light' : 'dark'
  return setTheme(next)
}

function toggleThemeFromElement(trigger: HTMLElement): void {
  void trigger
  void toggleTheme()
}

function initTheme(): void {
  let stored: string | null = null
  try {
    if (typeof localStorage !== 'undefined') {
      stored = localStorage.getItem(THEME_STORAGE_KEY)
    }
  } catch {
    stored = null
  }

  const initialTheme: ThemeMode = isThemeMode(stored) ? stored : DEFAULT_THEME
  commitTheme(initialTheme)
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    nextThemeLabel: computed(() => (theme.value === 'dark' ? 'Light theme' : 'Dark theme')),
    isThemeTransitioning,
    initTheme,
    setTheme,
    toggleThemeFromElement,
    toggleTheme,
  }
}
