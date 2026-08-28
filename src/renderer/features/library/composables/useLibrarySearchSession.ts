import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { LibrarySearchOutcome } from '../types/libraryInteraction'
import {
  createLibrarySearchIndexIncrementally,
  LibrarySearchIndexBuildStaleError,
} from '../utils/librarySearchIndex'
import { scanLibrarySearchIndex, type LibrarySearchRecord } from '../utils/librarySearchScan'
import { normalizeSearchText } from '../utils/normalizeSearchText'

export function useLibrarySearchSession(options: {
  isDisposed: () => boolean
  isLibrarySurface: () => boolean
  isInteractiveTarget: (target: EventTarget | null) => boolean
  scrollToTrackIndex: (index: number) => Promise<void>
}): {
  searchQuery: Ref<string>
  isSearchFocused: Ref<boolean>
  isSearchZoneHovered: Ref<boolean>
  searchInputRef: Ref<HTMLElement | null>
  searchRootRef: Ref<HTMLElement | null>
  searchOutcome: Ref<LibrarySearchOutcome>
  hasSearchQuery: ComputedRef<boolean>
  shouldRenderSearchBar: ComputedRef<boolean>
  scheduleLibrarySearchIndex: (tracks: readonly TrackListItem[]) => void
  jumpToNextSearchMatch: () => Promise<void>
  clearSearch: () => void
  resetMatchCursor: () => void
  onLibraryListMouseMove: (event: MouseEvent) => void
  onLibraryListMouseLeave: () => void
  onSearchBarPointerDown: () => void
  onSearchInputFocus: () => void
  onSearchInputBlur: () => void
  onSearchKeydown: (event: KeyboardEvent) => void
  onDocumentPointerDown: (event: PointerEvent) => void
  onWindowKeyDown: (event: KeyboardEvent) => void
  invalidate: () => void
} {
  const searchQuery = ref('')
  const isSearchFocused = ref(false)
  const isSearchZoneHovered = ref(false)
  const searchInputRef = ref<HTMLElement | null>(null)
  const searchRootRef = ref<HTMLElement | null>(null)
  const searchOutcome = ref<LibrarySearchOutcome>({ kind: 'idle' })
  let lastSearchQuery = ''
  let lastMatchedTrackIndex = -1
  let librarySearchIndexGeneration = 0
  let librarySearchIndexPromise: Promise<readonly LibrarySearchRecord[] | null> = Promise.resolve(
    [],
  )

  watch(searchQuery, (q) => {
    if (!q.trim()) {
      searchOutcome.value = { kind: 'idle' }
      lastSearchQuery = ''
      lastMatchedTrackIndex = -1
    }
  })

  const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
  const shouldRenderSearchBar = computed(
    () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
  )

  function scheduleLibrarySearchIndex(sourceTracks: readonly TrackListItem[]): void {
    const generation = ++librarySearchIndexGeneration
    const startedAt = performance.now()
    let chunkCount = 0
    let maxChunkMs = 0
    librarySearchIndexPromise = createLibrarySearchIndexIncrementally(sourceTracks, {
      isCurrent: () => !options.isDisposed() && generation === librarySearchIndexGeneration,
      onChunk: (durationMs) => {
        chunkCount += 1
        maxChunkMs = Math.max(maxChunkMs, durationMs)
      },
    }).catch((error: unknown) => {
      if (error instanceof LibrarySearchIndexBuildStaleError) return null
      rendererDiagnostics.error({
        scope: 'library.search',
        message: 'Failed to build library search index',
        cause: error,
      })
      return null
    })
    if (import.meta.env.DEV) {
      void librarySearchIndexPromise.then((index) => {
        if (index === null || generation !== librarySearchIndexGeneration) return
        rendererDiagnostics.info({
          scope: 'library.search',
          message: 'Library search index ready',
          context: {
            totalTracks: index.length,
            buildWallMs: performance.now() - startedAt,
            chunkCount,
            maxChunkMs,
          },
        })
      })
    }
  }

  async function jumpToNextSearchMatch(): Promise<void> {
    const query = searchQuery.value.trim()
    if (!query) {
      searchOutcome.value = { kind: 'idle' }
      return
    }
    const normalizedQuery = normalizeSearchText(query)
    const searchGeneration = librarySearchIndexGeneration
    const searchIndex = await librarySearchIndexPromise
    if (
      searchIndex === null ||
      searchGeneration !== librarySearchIndexGeneration ||
      query !== searchQuery.value.trim() ||
      options.isDisposed()
    ) {
      return
    }

    const isNewQuery = query !== lastSearchQuery
    const startIndex = isNewQuery ? 0 : lastMatchedTrackIndex + 1
    const scanResult = scanLibrarySearchIndex(searchIndex, normalizedQuery, startIndex)

    if (scanResult.targetIndex === null || scanResult.matchPosition === null) {
      searchOutcome.value = { kind: 'not-found' }
      return
    }

    if (isNewQuery) {
      lastSearchQuery = query
      lastMatchedTrackIndex = -1
    }

    lastMatchedTrackIndex = scanResult.targetIndex

    searchOutcome.value = {
      kind: 'matched',
      index: scanResult.matchPosition,
      total: scanResult.totalMatches,
      wrapped: scanResult.wrapped,
    }

    await options.scrollToTrackIndex(scanResult.targetIndex)
  }

  function onLibraryListMouseMove(event: MouseEvent): void {
    const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    if (event.clientY - containerRect.top > 48) {
      isSearchZoneHovered.value = false
      return
    }

    const bar = searchRootRef.value
    if (!bar) {
      isSearchZoneHovered.value = true
      return
    }

    const barRect = bar.getBoundingClientRect()
    isSearchZoneHovered.value =
      event.clientX >= barRect.left &&
      event.clientX <= barRect.right &&
      event.clientY >= barRect.top &&
      event.clientY <= barRect.bottom
  }

  function onLibraryListMouseLeave(): void {
    if (!isSearchFocused.value && !hasSearchQuery.value) {
      isSearchZoneHovered.value = false
    }
  }

  function onSearchBarPointerDown(): void {
    searchInputRef.value?.focus()
  }

  function onSearchInputFocus(): void {
    isSearchFocused.value = true
  }

  function onSearchInputBlur(): void {
    isSearchFocused.value = false
  }

  function clearSearch(): void {
    searchQuery.value = ''
    searchOutcome.value = { kind: 'idle' }
  }

  function resetMatchCursor(): void {
    lastMatchedTrackIndex = -1
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void jumpToNextSearchMatch()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (searchQuery.value !== '') {
        clearSearch()
      } else {
        searchInputRef.value?.blur()
        isSearchFocused.value = false
      }
    }
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Node)) return

    if (searchRootRef.value?.contains(target)) return
    isSearchFocused.value = false
    if (!hasSearchQuery.value) {
      isSearchZoneHovered.value = false
    }
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (
      options.isLibrarySurface() &&
      event.key === '/' &&
      !options.isInteractiveTarget(event.target)
    ) {
      event.preventDefault()
      isSearchFocused.value = true
      void nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }

  function invalidate(): void {
    librarySearchIndexGeneration += 1
  }

  return {
    searchQuery,
    isSearchFocused,
    isSearchZoneHovered,
    searchInputRef,
    searchRootRef,
    searchOutcome,
    hasSearchQuery,
    shouldRenderSearchBar,
    scheduleLibrarySearchIndex,
    jumpToNextSearchMatch,
    clearSearch,
    resetMatchCursor,
    onLibraryListMouseMove,
    onLibraryListMouseLeave,
    onSearchBarPointerDown,
    onSearchInputFocus,
    onSearchInputBlur,
    onSearchKeydown,
    onDocumentPointerDown,
    onWindowKeyDown,
    invalidate,
  }
}
