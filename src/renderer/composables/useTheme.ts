import { computed, ref } from 'vue'

/**
 * Theme API is kept as a shell so additional modes can return later.
 * Product currently ships dark-only: light is accepted by the type system
 * but always coerced to dark.
 */
export type ThemeMode = 'light' | 'dark'

export type ThemeTransitionOrigin = {
  x: number
  y: number
}

const THEME_STORAGE_KEY = 'auralis-theme'
/** Only mode applied while the app is dark-only. */
const FORCED_THEME: ThemeMode = 'dark'
const DEFAULT_THEME: ThemeMode = FORCED_THEME

const theme = ref<ThemeMode>(DEFAULT_THEME)
const isThemeTransitioning = ref(false)

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function resolveTheme(requested?: ThemeMode | null): ThemeMode {
  void requested
  // Dark-only: ignore stored/requested light until multi-theme returns.
  return FORCED_THEME
}

function commitTheme(nextTheme: ThemeMode): void {
  const resolved = resolveTheme(nextTheme)
  theme.value = resolved
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = 'dark'
  localStorage.setItem(THEME_STORAGE_KEY, resolved)
}

/**
 * Apply theme. While dark-only, non-dark values are coerced to dark and
 * animations are skipped (no visual mode change).
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

  const resolved = resolveTheme(nextTheme)
  if (theme.value === resolved && document.documentElement.dataset.theme === resolved) {
    return
  }

  commitTheme(resolved)
}

/** Kept for API compatibility; dark-only so this is a no-op. */
function toggleThemeFromElement(trigger: HTMLElement): void {
  void trigger
  void setTheme(FORCED_THEME)
}

function initTheme(): void {
  // Drop stale light preference so storage cannot reintroduce light later.
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme !== null && isThemeMode(storedTheme) && storedTheme !== FORCED_THEME) {
    localStorage.removeItem(THEME_STORAGE_KEY)
  }
  commitTheme(DEFAULT_THEME)
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    nextThemeLabel: computed(() => 'Dark theme'),
    isThemeTransitioning,
    initTheme,
    setTheme,
    toggleThemeFromElement,
    toggleTheme: () => setTheme(FORCED_THEME),
  }
}
