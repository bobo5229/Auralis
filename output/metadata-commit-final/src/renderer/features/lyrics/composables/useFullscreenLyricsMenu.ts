import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'
import type { LyricsStatus } from './useTrackLyrics'
import type { LyricLine } from '../types'

interface Options {
  isOpen: Readonly<Ref<boolean>>
  currentTrackId: Readonly<Ref<number | null>>
  lyricsStatus: Readonly<Ref<LyricsStatus>>
  lines: Readonly<Ref<readonly LyricLine[]>>
  scrollRef: Ref<HTMLElement | null>
  closeOtherMenus: () => void
  onKeydown: (event: KeyboardEvent) => void
  onWheel: (event: WheelEvent) => void
  pauseAutoFollow: () => void
}

/** Owns lyrics-menu invocation, keyboard/native-event deduplication and focus hand-off. */
export function useFullscreenLyricsMenu(options: Options) {
  const {
    isOpen: isFullscreenPlayerOpen,
    lyricsStatus,
    lines: fullscreenLyricLines,
    scrollRef: lyricsScrollRef,
  } = options
  const { lyricsScript, lyricsPersistFailed, setLyricsScript } = useChineseTextDisplay()
  const lyricsContextMenuOpen = ref(false)
  const lyricsContextMenuAnchor = ref({ clientX: 0, clientY: 0 })
  let keyboardContextMenuPending = false
  let keyboardContextMenuFallbackTimer: ReturnType<typeof setTimeout> | null = null

  const lyricsContextMenuEnabled = computed(
    () =>
      isFullscreenPlayerOpen.value &&
      (lyricsStatus.value === 'lrc' || lyricsStatus.value === 'plain') &&
      fullscreenLyricLines.value.length > 0,
  )

  function focusLyricsScroll(): void {
    void nextTick(() => lyricsScrollRef.value?.focus({ preventScroll: true }))
  }

  function closeLyricsContextMenuWithoutFocus(): void {
    lyricsContextMenuOpen.value = false
    clearKeyboardContextMenuFallback()
  }

  function closeLyricsContextMenu(
    reason: 'escape' | 'tab' | 'outside' | 'focusout' | 'scroll' | 'position-error',
  ): void {
    if (!lyricsContextMenuOpen.value) return
    lyricsContextMenuOpen.value = false
    clearKeyboardContextMenuFallback()
    if (reason === 'escape' || reason === 'position-error') focusLyricsScroll()
  }

  function selectLyricsScript(script: ChineseScript): void {
    setLyricsScript(script)
    closeLyricsContextMenuWithoutFocus()
    focusLyricsScroll()
  }

  function openLyricsContextMenu(clientX: number, clientY: number): boolean {
    if (!lyricsContextMenuEnabled.value || !lyricsScrollRef.value) return false
    options.closeOtherMenus()
    lyricsContextMenuAnchor.value = { clientX, clientY }
    lyricsContextMenuOpen.value = true
    return true
  }

  function getLyricsKeyboardAnchor(): { clientX: number; clientY: number } | null {
    const rect = lyricsScrollRef.value?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    }
  }

  function clearKeyboardContextMenuFallback(): void {
    keyboardContextMenuPending = false
    if (keyboardContextMenuFallbackTimer) clearTimeout(keyboardContextMenuFallbackTimer)
    keyboardContextMenuFallbackTimer = null
  }

  function markKeyboardContextMenuPending(): void {
    clearKeyboardContextMenuFallback()
    keyboardContextMenuPending = true
    keyboardContextMenuFallbackTimer = setTimeout(clearKeyboardContextMenuFallback, 750)
  }

  function handleLyricsContextMenu(event: MouseEvent): void {
    if (!lyricsContextMenuEnabled.value) return
    event.preventDefault()
    event.stopPropagation()

    if (event.clientX === 0 && event.clientY === 0) {
      if (keyboardContextMenuPending && lyricsContextMenuOpen.value) {
        clearKeyboardContextMenuFallback()
        return
      }
      clearKeyboardContextMenuFallback()
      const anchor = getLyricsKeyboardAnchor()
      if (anchor) openLyricsContextMenu(anchor.clientX, anchor.clientY)
      return
    }

    clearKeyboardContextMenuFallback()
    openLyricsContextMenu(event.clientX, event.clientY)
  }

  function handleLyricsContainerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      if (!lyricsContextMenuEnabled.value) return
      event.preventDefault()
      event.stopPropagation()
      const anchor = getLyricsKeyboardAnchor()
      if (anchor && openLyricsContextMenu(anchor.clientX, anchor.clientY))
        markKeyboardContextMenuPending()
      return
    }
    options.onKeydown(event)
  }

  function handleLyricsWheel(event: WheelEvent): void {
    closeLyricsContextMenuWithoutFocus()
    options.onWheel(event)
  }

  function handleLyricsTouchMove(): void {
    closeLyricsContextMenuWithoutFocus()
    options.pauseAutoFollow()
  }

  watch(
    () => [options.currentTrackId.value, lyricsStatus.value, fullscreenLyricLines.value],
    () => closeLyricsContextMenuWithoutFocus(),
    { flush: 'post' },
  )

  watch(
    isFullscreenPlayerOpen,
    (isOpen) => {
      if (!isOpen) closeLyricsContextMenuWithoutFocus()
    },
    { flush: 'sync' },
  )

  return {
    lyricsScript,
    lyricsPersistFailed,
    lyricsContextMenuOpen,
    lyricsContextMenuAnchor,
    lyricsContextMenuEnabled,
    closeLyricsContextMenu,
    closeLyricsContextMenuWithoutFocus,
    selectLyricsScript,
    handleLyricsContextMenu,
    handleLyricsContainerKeydown,
    handleLyricsWheel,
    handleLyricsTouchMove,
    dispose: clearKeyboardContextMenuFallback,
  }
}
