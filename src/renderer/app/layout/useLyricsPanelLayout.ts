import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'

const XL_BREAKPOINT_QUERY = '(min-width: 1280px)'

function getMatchMedia(): ((query: string) => MediaQueryList) | null {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia.bind(window)
  }
  if (typeof matchMedia === 'function') {
    return matchMedia
  }
  return null
}

function getInitialWideScreen(): boolean {
  const mm = getMatchMedia()
  return mm ? mm(XL_BREAKPOINT_QUERY).matches : true
}

const isWideScreen = ref(getInitialWideScreen())
let mediaQueryList: MediaQueryList | null = null
let subscriberCount = 0

function handleMediaChange(event: MediaQueryListEvent): void {
  isWideScreen.value = event.matches
}

export function subscribeLyricsBreakpoint(): () => void {
  const mm = getMatchMedia()
  if (!mm) {
    return () => {}
  }

  if (subscriberCount === 0) {
    mediaQueryList = mm(XL_BREAKPOINT_QUERY)
    isWideScreen.value = mediaQueryList.matches
    mediaQueryList.addEventListener('change', handleMediaChange)
  }
  subscriberCount++

  return () => {
    subscriberCount--
    if (subscriberCount <= 0) {
      subscriberCount = 0
      mediaQueryList?.removeEventListener('change', handleMediaChange)
      mediaQueryList = null
    }
  }
}

export function computeLyricsTargetWidth(shellWidthPx?: number): number {
  const baseWidth =
    typeof shellWidthPx === 'number' && shellWidthPx > 0
      ? shellWidthPx
      : typeof window !== 'undefined'
        ? window.innerWidth
        : 1280
  return Math.round(baseWidth * 0.2)
}

export interface UseLyricsPanelLayoutOptions {
  /** If provided, manually manages breakpoint subscription in Vue lifecycle */
  autoSubscribe?: boolean
}

export function useLyricsPanelLayout(options: UseLyricsPanelLayoutOptions = {}) {
  const { autoSubscribe = true } = options
  const route = useRoute()
  const { displayMode } = usePlayerDisplayMode()

  if (autoSubscribe) {
    let unsubscribe: (() => void) | null = null
    onMounted(() => {
      unsubscribe = subscribeLyricsBreakpoint()
    })
    onBeforeUnmount(() => {
      unsubscribe?.()
      unsubscribe = null
    })
  }

  const isStandaloneCanvas = computed(() => {
    const name = String(route?.name ?? '')
    return name === 'cd-albums' || name === 'cd-album-index' || name === 'archive'
  })

  // Fullscreen covers the shell. Keep its columns stable while disabling panel controls.
  const canLayoutLyricsPanel = computed(() => isWideScreen.value && !isStandaloneCanvas.value)
  const canDisplayLyricsPanel: ComputedRef<boolean> = computed(
    () => canLayoutLyricsPanel.value && displayMode.value === 'normal',
  )

  return {
    isWideScreen: isWideScreen as Ref<boolean>,
    canLayoutLyricsPanel,
    canDisplayLyricsPanel,
  }
}
