import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

export type ThemeTransitionOrigin = {
  x: number
  y: number
}

const THEME_STORAGE_KEY = 'auralis-theme'
const DEFAULT_THEME: ThemeMode = 'light'

const theme = ref<ThemeMode>(DEFAULT_THEME)
const isThemeTransitioning = ref(false)

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function commitTheme(nextTheme: ThemeMode): void {
  theme.value = nextTheme
  document.documentElement.dataset.theme = nextTheme
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
}

function getRevealRadius(origin: ThemeTransitionOrigin): number {
  const horizontal = Math.max(origin.x, window.innerWidth - origin.x)
  const vertical = Math.max(origin.y, window.innerHeight - origin.y)
  return Math.ceil(Math.hypot(horizontal, vertical)) + 2
}

function shouldAnimate(origin?: ThemeTransitionOrigin): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (typeof document.startViewTransition !== 'function') return false
  if (!origin || origin.x < 0 || origin.y < 0) return false
  if (window.innerWidth <= 0 || window.innerHeight <= 0) return false
  return true
}

async function runThemeReveal(nextTheme: ThemeMode, origin: ThemeTransitionOrigin): Promise<void> {
  if (typeof document.startViewTransition !== 'function') {
    commitTheme(nextTheme)
    return
  }

  const radius = getRevealRadius(origin)
  const clipFrom = `circle(0px at ${origin.x}px ${origin.y}px)`
  const clipTo = `circle(${radius}px at ${origin.x}px ${origin.y}px)`

  isThemeTransitioning.value = true

  let transition: ViewTransition | undefined

  try {
    transition = document.startViewTransition(() => {
      commitTheme(nextTheme)
    })

    await transition.ready

    const animation = document.documentElement.animate(
      {
        clipPath: [clipFrom, clipTo],
      },
      {
        duration: 850,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    )

    await Promise.all([animation.finished, transition.finished])
  } catch (error) {
    console.warn('[ThemeTransition] Animation failed:', error)
    transition?.skipTransition()
    // Ensure theme is committed even if the animation fails
    if (theme.value !== nextTheme) {
      commitTheme(nextTheme)
    }
  } finally {
    isThemeTransitioning.value = false
  }
}

async function setTheme(
  nextTheme: ThemeMode,
  options?: {
    animate?: boolean
    origin?: ThemeTransitionOrigin
  },
): Promise<void> {
  if (theme.value === nextTheme) return
  if (isThemeTransitioning.value) return

  if (options?.animate && shouldAnimate(options.origin)) {
    await runThemeReveal(nextTheme, options.origin!)
  } else {
    commitTheme(nextTheme)
  }
}

function toggleThemeFromElement(trigger: HTMLElement): void {
  if (isThemeTransitioning.value) return

  const rect = trigger.getBoundingClientRect()
  const origin: ThemeTransitionOrigin = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }

  const nextTheme: ThemeMode = theme.value === 'dark' ? 'light' : 'dark'
  setTheme(nextTheme, { animate: true, origin })
}

function initTheme(): void {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  commitTheme(isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME)
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    nextThemeLabel: computed(() =>
      theme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    ),
    isThemeTransitioning,
    initTheme,
    setTheme,
    toggleThemeFromElement,
    toggleTheme: () => setTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
