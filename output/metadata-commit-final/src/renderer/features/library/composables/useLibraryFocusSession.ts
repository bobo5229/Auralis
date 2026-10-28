import { nextTick, ref, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryDerivedIndex } from '../utils/libraryDerivedIndex'
import {
  resolveKeyboardFocusTrackId,
  resolveKeyboardMoveIndex,
  type LibraryKeyboardMoveDirection,
} from '../utils/libraryKeyboardFocus'
import type { LibraryMetadataFocusTarget } from './useLibraryMetadataEditor'
import type { useLibraryViewport } from './useLibraryViewport'

interface UseLibraryFocusSessionOptions {
  tracks: { readonly value: readonly TrackListItem[] }
  derivedIndex: { readonly value: Pick<LibraryDerivedIndex, 'trackById' | 'trackIndexById'> }
  scrollRef: Ref<HTMLElement | null>
  viewport: Pick<
    ReturnType<typeof useLibraryViewport>,
    'captureScrollGeneration' | 'isScrollInputCancelled' | 'scrollToTrackById'
  >
  selectedTrackId: () => number | null
  currentTrackId: () => number | null
  getAlbumGroupByTrackId: (trackId: number) => { key: string } | null
  isInteractiveTarget: (target: EventTarget | null) => boolean
  isContextMenuOpen: () => boolean
  isMetadataEditorOpen: () => boolean
  selectTrack: (trackId: number) => void
  playTrack: (trackId: number) => void
}

/** Shares the page's viewport and playback actions; owns only transient focus. */
export function useLibraryFocusSession(options: UseLibraryFocusSessionOptions) {
  const keyboardFocusTrackId = ref<number | null>(null)
  let pendingViewSwitchReturnTarget: LibraryMetadataFocusTarget | null = null

  function onRowFocus(trackId: number): void {
    keyboardFocusTrackId.value = trackId
  }

  async function restoreLibraryFocus(
    target: LibraryMetadataFocusTarget | null,
    scroll = true,
  ): Promise<void> {
    if (!target) return

    let activeTrackId = target.trackId
    const trackExists = options.derivedIndex.value.trackById.has(activeTrackId)

    if (!trackExists) {
      if (options.tracks.value.length === 0) {
        options.scrollRef.value?.focus()
        return
      }

      const selectedExists =
        options.selectedTrackId() != null &&
        options.derivedIndex.value.trackById.has(options.selectedTrackId()!)
      const currentExists =
        options.currentTrackId() != null &&
        options.derivedIndex.value.trackById.has(options.currentTrackId()!)

      if (selectedExists) {
        activeTrackId = options.selectedTrackId()!
      } else if (currentExists) {
        activeTrackId = options.currentTrackId()!
      } else {
        activeTrackId = options.tracks.value[0].id
      }
    }

    keyboardFocusTrackId.value = activeTrackId

    const startGeneration = options.viewport.captureScrollGeneration()
    if (scroll) {
      await options.viewport.scrollToTrackById(activeTrackId, undefined, startGeneration)
      await nextTick()
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      if (options.viewport.isScrollInputCancelled(startGeneration)) return
    }

    let targetEl: HTMLElement | null = null

    if (target.source === 'album-artwork' && trackExists) {
      targetEl = document.querySelector<HTMLElement>(
        `[data-first-track-id="${activeTrackId}"] .album-cover-artwork`,
      )
      if (!targetEl) {
        const group = options.getAlbumGroupByTrackId(activeTrackId)
        if (group) {
          targetEl = document.querySelector<HTMLElement>(
            `[data-album-key="${group.key}"] .album-cover-artwork`,
          )
        }
      }
    }

    if (!targetEl) {
      targetEl = document.querySelector<HTMLElement>(`[data-track-id="${activeTrackId}"]`)
    }

    if (!targetEl) {
      targetEl = options.scrollRef.value
    }

    targetEl?.focus(scroll ? undefined : { preventScroll: true })
  }

  function ensureKeyboardFocusTrackId(): number | null {
    const nextId = resolveKeyboardFocusTrackId({
      trackCount: options.tracks.value.length,
      currentFocusId: keyboardFocusTrackId.value,
      selectedTrackId: options.selectedTrackId(),
      currentTrackId: options.currentTrackId(),
      hasTrack: (id) => options.derivedIndex.value.trackIndexById.has(id),
      firstTrackId: options.tracks.value[0]?.id ?? null,
    })
    keyboardFocusTrackId.value = nextId
    return nextId
  }

  async function moveKeyboardFocus(direction: LibraryKeyboardMoveDirection): Promise<void> {
    if (options.tracks.value.length === 0) return

    const currentId = ensureKeyboardFocusTrackId()
    const currentIndex =
      currentId === null ? -1 : (options.derivedIndex.value.trackIndexById.get(currentId) ?? -1)
    const targetIndex = resolveKeyboardMoveIndex({
      direction,
      currentIndex,
      lastIndex: options.tracks.value.length - 1,
    })

    const targetTrack = options.tracks.value[targetIndex]
    if (!targetTrack) return

    keyboardFocusTrackId.value = targetTrack.id
    await options.viewport.scrollToTrackById(targetTrack.id)

    void nextTick(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-track-id="${targetTrack.id}"]`)
        el?.focus()
      })
    })
  }

  function onListShellKeyDown(event: KeyboardEvent): void {
    // 曲目行已经处理的 Enter/Space 不再冒泡触发第二次播放或选择。
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
    if (options.isInteractiveTarget(event.target)) return
    if (options.isContextMenuOpen() || options.isMetadataEditorOpen()) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      void moveKeyboardFocus('next')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      void moveKeyboardFocus('prev')
    } else if (event.key === 'Home') {
      event.preventDefault()
      void moveKeyboardFocus('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      void moveKeyboardFocus('last')
    } else if (event.key === ' ') {
      const focusId = ensureKeyboardFocusTrackId()
      if (focusId) {
        event.preventDefault()
        options.selectTrack(focusId)
      }
    } else if (event.key === 'Enter') {
      const focusId = ensureKeyboardFocusTrackId()
      if (focusId) {
        event.preventDefault()
        options.playTrack(focusId)
      }
    }
  }

  function setViewSwitchReturnTarget(target: LibraryMetadataFocusTarget): void {
    pendingViewSwitchReturnTarget = target
  }

  function onViewSwitchComplete(targetTrackId: number): void {
    if (pendingViewSwitchReturnTarget) {
      void restoreLibraryFocus(pendingViewSwitchReturnTarget)
      pendingViewSwitchReturnTarget = null
    } else {
      void restoreLibraryFocus({ trackId: targetTrackId, source: 'track' })
    }
  }

  return {
    keyboardFocusTrackId,
    onRowFocus,
    ensureKeyboardFocusTrackId,
    restoreLibraryFocus,
    onListShellKeyDown,
    setViewSwitchReturnTarget,
    onViewSwitchComplete,
  }
}
