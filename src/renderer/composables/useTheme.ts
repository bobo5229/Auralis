import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'auralis-theme'
const DEFAULT_THEME: ThemeMode = 'light'

const theme = ref<ThemeMode>(DEFAULT_THEME)

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function applyTheme(nextTheme: ThemeMode): void {
  document.documentElement.dataset.theme = nextTheme
}

function setTheme(nextTheme: ThemeMode): void {
  theme.value = nextTheme
  applyTheme(nextTheme)
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
}

function initTheme(): void {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  setTheme(isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME)
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    nextThemeLabel: computed(() =>
      theme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    ),
    initTheme,
    setTheme,
    toggleTheme: () => setTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
