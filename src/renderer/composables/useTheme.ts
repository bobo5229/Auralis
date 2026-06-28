import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'auralis-theme'
const DEFAULT_THEME: ThemeMode = 'light'
const THEME_SWITCHING_CLASS = 'theme-switching'
const THEME_WALLPAPER_DURATION_MS = 1800

const theme = ref<ThemeMode>(DEFAULT_THEME)
const isThemeSwitching = ref(false)
let themeSwitchFrame: number | null = null
let wallpaperOverlay: HTMLElement | null = null
let wallpaperTimer: ReturnType<typeof setTimeout> | null = null

interface ScrollClonePair {
  source: HTMLElement
  clone: HTMLElement
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function applyTheme(nextTheme: ThemeMode): void {
  document.documentElement.dataset.theme = nextTheme
}

function commitTheme(nextTheme: ThemeMode): void {
  theme.value = nextTheme
  applyTheme(nextTheme)
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
}

function suppressThemeTransitionForNextPaint(): void {
  if (themeSwitchFrame !== null) {
    window.cancelAnimationFrame(themeSwitchFrame)
    themeSwitchFrame = null
  }

  document.documentElement.classList.add(THEME_SWITCHING_CLASS)
}

function releaseThemeTransitionSuppression(): void {
  void document.documentElement.offsetWidth

  themeSwitchFrame = window.requestAnimationFrame(() => {
    document.documentElement.classList.remove(THEME_SWITCHING_CLASS)
    themeSwitchFrame = null
  })
}

function patchCloneForTheme(clone: HTMLElement, nextTheme: ThemeMode): void {
  const icon = clone.querySelector('.theme-toggle-icon')
  if (icon) {
    const isNextDark = nextTheme === 'dark'
    icon.classList.toggle('i-lucide-sun', isNextDark)
    icon.classList.toggle('i-lucide-moon', !isNextDark)
  }
}

function collectScrollClonePairs(source: HTMLElement, clone: HTMLElement): ScrollClonePair[] {
  const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))]
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  const pairs: ScrollClonePair[] = []

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index]
    if (!cloneElement) return

    if (sourceElement.scrollTop > 0 || sourceElement.scrollLeft > 0) {
      pairs.push({
        source: sourceElement,
        clone: cloneElement,
      })
    }
  })

  return pairs
}

function syncCloneScrollPositions(pairs: ScrollClonePair[]): void {
  pairs.forEach(({ source, clone }) => {
    clone.scrollTop = source.scrollTop
    clone.scrollLeft = source.scrollLeft
  })
}

function preventThemeSwitchScroll(event: Event): void {
  if (!isThemeSwitching.value) return

  event.preventDefault()
}

function lockThemeSwitchScroll(): void {
  window.addEventListener('wheel', preventThemeSwitchScroll, {
    capture: true,
    passive: false,
  })
}

function unlockThemeSwitchScroll(): void {
  window.removeEventListener('wheel', preventThemeSwitchScroll, {
    capture: true,
  })
}

function createThemeWallpaperOverlay(nextTheme: ThemeMode): {
  overlay: HTMLElement
  scrollPairs: ScrollClonePair[]
} {
  const overlay = document.createElement('div')
  overlay.className = 'theme-wallpaper-overlay'
  overlay.dataset.theme = nextTheme
  overlay.setAttribute('aria-hidden', 'true')
  const surface = document.createElement('div')
  surface.className = 'theme-wallpaper-surface'
  const scrollPairs: ScrollClonePair[] = []

  const source = document.querySelector('[data-app-shell-root]')
  if (source) {
    const clone = source.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-app-shell-root')
    patchCloneForTheme(clone, nextTheme)
    scrollPairs.push(...collectScrollClonePairs(source as HTMLElement, clone))
    surface.appendChild(clone)
  }

  overlay.appendChild(surface)

  return {
    overlay,
    scrollPairs,
  }
}

function cleanupWallpaperOverlay(): void {
  if (wallpaperTimer !== null) {
    clearTimeout(wallpaperTimer)
    wallpaperTimer = null
  }

  if (wallpaperOverlay) {
    wallpaperOverlay.remove()
    wallpaperOverlay = null
  }
}

function runWallpaperThemeTransition(nextTheme: ThemeMode): Promise<void> {
  return new Promise((resolve) => {
    const { overlay, scrollPairs } = createThemeWallpaperOverlay(nextTheme)
    wallpaperOverlay = overlay
    let isResolved = false

    const done = () => {
      if (isResolved) return
      isResolved = true
      overlay.style.width = 'calc(100vw + 8px)'
      overlay.removeEventListener('animationend', onAnimationEnd)
      resolve()
    }

    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== overlay || event.animationName !== 'theme-wallpaper-cover') {
        return
      }

      done()
    }

    overlay.addEventListener('animationend', onAnimationEnd)
    document.body.append(overlay)
    syncCloneScrollPositions(scrollPairs)

    wallpaperTimer = window.setTimeout(() => {
      done()
    }, THEME_WALLPAPER_DURATION_MS + 100)

    requestAnimationFrame(() => {
      syncCloneScrollPositions(scrollPairs)
      overlay.classList.add('theme-wallpaper-overlay--running')
    })
  })
}

async function setTheme(nextTheme: ThemeMode, options?: { animate?: boolean }): Promise<void> {
  if (theme.value === nextTheme) return
  if (isThemeSwitching.value) return

  if (options?.animate === false || prefersReducedMotion()) {
    suppressThemeTransitionForNextPaint()
    commitTheme(nextTheme)
    releaseThemeTransitionSuppression()
    return
  }

  isThemeSwitching.value = true
  lockThemeSwitchScroll()

  try {
    await runWallpaperThemeTransition(nextTheme)
    suppressThemeTransitionForNextPaint()
    commitTheme(nextTheme)
    releaseThemeTransitionSuppression()
  } finally {
    cleanupWallpaperOverlay()
    unlockThemeSwitchScroll()
    isThemeSwitching.value = false
  }
}

function initTheme(): void {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  const initial = isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME
  suppressThemeTransitionForNextPaint()
  commitTheme(initial)
  releaseThemeTransitionSuppression()
}

export function useTheme() {
  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    isThemeSwitching,
    nextThemeLabel: computed(() =>
      theme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    ),
    initTheme,
    setTheme,
    toggleTheme: () => setTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
