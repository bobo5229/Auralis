import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '../types'
import { isLibrarySearchBarHovered } from '@renderer/features/library/utils/librarySearchHover'
import { canDismissPageSearch } from '@renderer/features/library/utils/librarySearchKeyboard'
import { normalizeSearchText } from '@renderer/features/library/utils/normalizeSearchText'
import { createDisplaySearchKeys } from '@renderer/features/library/utils/displaySearchKeys'
import { resolveNextAlbumSearchMatch } from '../utils/albumSearchNavigation'

export function useAlbumSearchSession({
  tracks,
  albums,
  canRefresh,
  displayMode,
  contextMenu,
  isLayoutTransitionActive,
  hasPageParameters,
  scrollToAlbum,
  t,
}: {
  tracks: Readonly<Ref<TrackListItem[]>>
  albums: Readonly<Ref<AlbumSummary[]>>
  canRefresh: Readonly<Ref<boolean>>
  displayMode: Readonly<Ref<string>>
  contextMenu: Readonly<Ref<unknown | null>>
  isLayoutTransitionActive: Readonly<Ref<boolean>>
  hasPageParameters: Readonly<Ref<boolean>>
  scrollToAlbum: (index: number) => void
  t: (key: string, values?: Record<string, string>) => string
}) {
  const searchQuery = ref('')

  const isSearchFocused = ref(false)

  const isSearchZoneHovered = ref(false)

  const isSearchOpen = ref(false)

  let searchReturnFocus: HTMLElement | null = null

  let searchFocusRevision = 0

  let isSearchHoverDismissed = false

  const searchInputRef = ref<HTMLInputElement | null>(null)

  const searchRootRef = ref<HTMLElement | null>(null)

  const highlightedAlbumKey = ref<string | null>(null)

  const searchOutcome = ref<'idle' | 'matched' | 'wrapped' | 'not-found'>('idle')

  const searchMatchPosition = ref(0)

  const searchMatchTotal = ref(0)

  let lastSearchQuery = ''

  let lastMatchedAlbumIndex = -1

  let searchHighlightTimeout: ReturnType<typeof setTimeout> | null = null

  const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)

  const shouldRenderSearchBar = computed(
    () =>
      isSearchOpen.value ||
      isSearchZoneHovered.value ||
      isSearchFocused.value ||
      hasSearchQuery.value,
  )

  const searchFeedback = computed(() => {
    if (searchOutcome.value === 'not-found') return t('albums.search.notFound')
    if (searchOutcome.value === 'wrapped') {
      return t('albums.search.wrapped', {
        index: String(searchMatchPosition.value).padStart(2, '0'),
        total: String(searchMatchTotal.value).padStart(2, '0'),
      })
    }
    if (searchOutcome.value === 'matched') {
      return t('albums.search.matched', {
        index: String(searchMatchPosition.value).padStart(2, '0'),
        total: String(searchMatchTotal.value).padStart(2, '0'),
      })
    }
    return ''
  })

  function resetSearchOutcome(): void {
    searchOutcome.value = 'idle'
    searchMatchPosition.value = 0
    searchMatchTotal.value = 0
    lastSearchQuery = ''
    lastMatchedAlbumIndex = -1
  }

  watch(searchQuery, () => {
    resetSearchOutcome()
  })

  watch(tracks, () => {
    resetSearchOutcome()
  })

  const albumSearchKeys = computed(
    () =>
      new Map(
        albums.value.map((album) => [
          album.key,
          [
            ...new Set([
              ...createDisplaySearchKeys(album.title),
              ...createDisplaySearchKeys(album.albumArtist, true),
            ]),
          ],
        ]),
      ),
  )

  function doesAlbumMatchSearch(album: AlbumSummary, normalizedQuery: string): boolean {
    if (!normalizedQuery) return false

    return (
      albumSearchKeys.value.get(album.key)?.some((key) => key.startsWith(normalizedQuery)) ?? false
    )
  }

  function locateNextSearchResult(): void {
    const query = searchQuery.value.trim()
    if (!query) {
      searchOutcome.value = 'idle'
      return
    }

    const isNewQuery = query !== lastSearchQuery
    if (isNewQuery) {
      lastSearchQuery = query
      lastMatchedAlbumIndex = -1
    }

    const normalizedQuery = normalizeSearchText(query)
    const matchingIndices = albums.value.flatMap((album, index) =>
      doesAlbumMatchSearch(album, normalizedQuery) ? [index] : [],
    )
    const match = resolveNextAlbumSearchMatch(matchingIndices, lastMatchedAlbumIndex, isNewQuery)
    searchMatchTotal.value = match.totalMatches
    if (match.targetIndex === null || match.matchPosition === null) {
      searchOutcome.value = 'not-found'
      return
    }

    const index = match.targetIndex
    const album = albums.value[index]
    lastMatchedAlbumIndex = index
    searchMatchPosition.value = match.matchPosition
    searchOutcome.value = match.wrapped ? 'wrapped' : 'matched'
    scrollToAlbum(index)
    highlightedAlbumKey.value = album.key
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
    searchHighlightTimeout = setTimeout(() => {
      highlightedAlbumKey.value = null
      searchHighlightTimeout = null
    }, 1800)
  }

  async function openSearch(): Promise<void> {
    if (!canRefresh.value || displayMode.value !== 'normal') return
    const revision = ++searchFocusRevision
    const activeElement = document.activeElement
    if (activeElement !== searchInputRef.value) {
      searchReturnFocus =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null
    }
    isSearchOpen.value = true
    isSearchHoverDismissed = false
    await nextTick()
    if (revision !== searchFocusRevision || !canRefresh.value || !isSearchOpen.value) return
    searchInputRef.value?.focus({ preventScroll: true })
  }

  function onPageSearchShortcut(event: KeyboardEvent): void {
    if (
      canRefresh.value &&
      displayMode.value === 'normal' &&
      !contextMenu.value &&
      !isLayoutTransitionActive.value &&
      !isSearchFocused.value &&
      (searchQuery.value !== '' || shouldRenderSearchBar.value) &&
      canDismissPageSearch(event)
    ) {
      event.preventDefault()
      clearSearch()
      dismissSearch(false)
      return
    }
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.shiftKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.key.toLowerCase() !== 'f' ||
      !canRefresh.value ||
      displayMode.value !== 'normal' ||
      contextMenu.value ||
      isLayoutTransitionActive.value ||
      document.querySelector('[role="menu"], [role="dialog"]')
    )
      return
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target !== searchInputRef.value &&
      (target.matches('input, textarea, select') || target.isContentEditable)
    )
      return
    event.preventDefault()
    void openSearch()
  }

  function onSearchBlur(): void {
    isSearchFocused.value = false
    isSearchOpen.value = false
  }

  function clearSearch(): void {
    searchQuery.value = ''
    resetSearchOutcome()
    highlightedAlbumKey.value = null
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
    searchHighlightTimeout = null
  }

  function dismissSearch(restoreFocus: boolean): void {
    const revision = ++searchFocusRevision
    isSearchOpen.value = false
    isSearchHoverDismissed ||= isSearchZoneHovered.value
    isSearchZoneHovered.value = false
    isSearchFocused.value = false
    const returnFocus = searchReturnFocus
    searchReturnFocus = null
    if (!restoreFocus) return
    searchInputRef.value?.blur()
    void nextTick(() => {
      if (revision !== searchFocusRevision || !canRefresh.value) return
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    })
  }

  function onSearchFocus(): void {
    isSearchHoverDismissed = false
    isSearchFocused.value = true
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (searchQuery.value !== '') {
        clearSearch()
      } else {
        dismissSearch(true)
      }
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    locateNextSearchResult()
  }

  function onAlbumsMouseMove(event: MouseEvent): void {
    const currentTarget = event.currentTarget as HTMLElement | null
    if (!currentTarget) return

    const bar = searchRootRef.value
    const hovered = isLibrarySearchBarHovered(
      event.clientX,
      event.clientY,
      currentTarget.getBoundingClientRect(),
      bar && !isSearchHoverDismissed ? bar.getBoundingClientRect() : null,
      hasPageParameters.value,
    )
    if (!hovered) isSearchHoverDismissed = false
    isSearchZoneHovered.value = hovered && !isSearchHoverDismissed
  }

  function onAlbumsMouseLeave(): void {
    isSearchHoverDismissed = false
    isSearchZoneHovered.value = false
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target
    const bar = searchRootRef.value
    if (!(target instanceof Node) || (bar && (bar === target || bar.contains(target)))) return

    isSearchFocused.value = false
    isSearchOpen.value = false
    searchFocusRevision += 1
    if (!hasSearchQuery.value) {
      isSearchZoneHovered.value = false
    }
  }

  function activate() {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onPageSearchShortcut)
  }
  function deactivate() {
    isSearchFocused.value = false
    isSearchOpen.value = false
    isSearchZoneHovered.value = false
    searchReturnFocus = null
    searchFocusRevision += 1
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onPageSearchShortcut)
  }
  function dispose() {
    deactivate()
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
  }
  return {
    searchOutcome,
    searchQuery,
    searchInputRef,
    searchRootRef,
    highlightedAlbumKey,
    searchFeedback,
    shouldRenderSearchBar,
    onSearchBlur,
    clearSearch,
    onSearchFocus,
    onSearchKeydown,
    onAlbumsMouseMove,
    onAlbumsMouseLeave,
    activate,
    deactivate,
    dispose,
  }
}
