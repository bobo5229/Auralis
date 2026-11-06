import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import {
  canDismissPageSearch,
  hasVisiblePageOverlay,
} from '@renderer/shared/search/librarySearchKeyboard'
import { normalizeSearchText } from '@renderer/shared/search/normalizeSearchText'
import { createDisplaySearchKeys } from '@renderer/shared/search/displaySearchKeys'
import { resolveNextAlbumSearchMatch } from '../utils/albumSearchNavigation'

export function useAlbumSearchSession({
  tracks,
  albums,
  canRefresh,
  displayMode,
  contextMenu,
  isLayoutTransitionActive,
  scrollToAlbum,
  t,
}: {
  tracks: Readonly<Ref<TrackListItem[]>>
  albums: Readonly<Ref<AlbumSummary[]>>
  canRefresh: Readonly<Ref<boolean>>
  displayMode: Readonly<Ref<string>>
  contextMenu: Readonly<Ref<unknown | null>>
  isLayoutTransitionActive: Readonly<Ref<boolean>>
  scrollToAlbum: (index: number) => void
  t: (key: string, values?: Record<string, string>) => string
}) {
  const searchQuery = ref('')

  const isSearchFocused = ref(false)

  const isSearchOpen = ref(false)

  let searchReturnFocus: HTMLElement | null = null

  let searchFocusRevision = 0

  const searchInputRef = ref<HTMLInputElement | null>(null)

  const searchRootRef = ref<HTMLElement | null>(null)

  const highlightedAlbumKey = ref<string | null>(null)

  const searchHighlightRevision = ref(0)

  const searchOutcome = ref<'idle' | 'matched' | 'wrapped' | 'not-found'>('idle')

  const searchMatchPosition = ref(0)

  const searchMatchTotal = ref(0)

  let lastSearchQuery = ''

  let lastMatchedAlbumIndex = -1

  let searchHighlightTimeout: ReturnType<typeof setTimeout> | null = null

  let searchWrapTimeout: ReturnType<typeof setTimeout> | null = null

  const searchFeedback = computed(() => {
    if (searchOutcome.value === 'not-found') return t('albums.search.notFound')
    if (searchOutcome.value === 'wrapped') {
      return t('albums.search.wrapped')
    }
    if (searchOutcome.value === 'matched') {
      return t('albums.search.matched', {
        index: String(searchMatchPosition.value).padStart(2, '0'),
        total: String(searchMatchTotal.value).padStart(2, '0'),
      })
    }
    return ''
  })

  function clearSearchHighlight(): void {
    highlightedAlbumKey.value = null
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
    searchHighlightTimeout = null
  }

  function resetSearchOutcome(): void {
    clearSearchHighlight()
    clearWrapNotice()
    searchOutcome.value = 'idle'
    searchMatchPosition.value = 0
    searchMatchTotal.value = 0
    lastSearchQuery = ''
    lastMatchedAlbumIndex = -1
  }

  function clearWrapNotice(): void {
    if (searchWrapTimeout) clearTimeout(searchWrapTimeout)
    searchWrapTimeout = null
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
              ...createDisplaySearchKeys(album.indexArtist ?? album.albumArtist, true),
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

  const searchMatches = computed(() => {
    const query = normalizeSearchText(searchQuery.value.trim())
    return albums.value.flatMap((album, index) =>
      doesAlbumMatchSearch(album, query) ? [index] : [],
    )
  })

  function locateNextSearchResult(): void {
    clearWrapNotice()
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

    const matchingIndices = searchMatches.value
    const match = resolveNextAlbumSearchMatch(matchingIndices, lastMatchedAlbumIndex, isNewQuery)
    searchMatchTotal.value = match.totalMatches
    if (match.targetIndex === null || match.matchPosition === null) {
      clearSearchHighlight()
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
    searchHighlightRevision.value++
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
    searchHighlightTimeout = setTimeout(() => {
      highlightedAlbumKey.value = null
      searchHighlightTimeout = null
    }, 900)
    if (match.wrapped) {
      searchWrapTimeout = setTimeout(() => {
        searchOutcome.value = 'matched'
        searchWrapTimeout = null
      }, 1200)
    }
  }

  async function openSearch(): Promise<void> {
    if (!canRefresh.value || displayMode.value !== 'normal' || albums.value.length === 0) return
    const revision = ++searchFocusRevision
    const activeElement = document.activeElement
    if (activeElement !== searchInputRef.value) {
      searchReturnFocus =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null
    }
    isSearchOpen.value = true
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
      (searchQuery.value !== '' || isSearchOpen.value) &&
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
      albums.value.length === 0 ||
      displayMode.value !== 'normal' ||
      contextMenu.value ||
      isLayoutTransitionActive.value ||
      hasVisiblePageOverlay()
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
  }

  function dismissSearch(restoreFocus: boolean): void {
    const revision = ++searchFocusRevision
    isSearchOpen.value = false
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

  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target
    const bar = searchRootRef.value
    if (!(target instanceof Node) || (bar && (bar === target || bar.contains(target)))) return

    isSearchFocused.value = false
    isSearchOpen.value = false
    searchFocusRevision += 1
  }

  function activate() {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onPageSearchShortcut)
  }
  function deactivate() {
    clearSearchHighlight()
    clearWrapNotice()
    if (searchOutcome.value === 'wrapped') searchOutcome.value = 'matched'
    isSearchFocused.value = false
    isSearchOpen.value = false
    searchReturnFocus = null
    searchFocusRevision += 1
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onPageSearchShortcut)
  }
  function dispose() {
    deactivate()
  }
  return {
    searchOutcome,
    searchQuery,
    searchInputRef,
    searchRootRef,
    highlightedAlbumKey,
    searchHighlightRevision,
    searchFeedback,
    onSearchBlur,
    clearSearch,
    onSearchFocus,
    onSearchKeydown,
    activate,
    deactivate,
    dispose,
  }
}
