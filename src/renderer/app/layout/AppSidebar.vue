<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router'
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { useSidebarPlaylistActions } from '../composables/useSidebarPlaylistActions'
import {
  MAX_RECENT_ADDED_LIBRARY_DAYS,
  parseRecentAddedLibraryRange,
  type RecentAddedLibraryRange,
} from '@renderer/features/library/utils/recentAddedLibrary'
import { useRoute } from 'vue-router'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import SmartPlaylistBuilderDialog from '@renderer/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import {
  SIDEBAR_WIDTH,
  useSidebarLayout,
} from '@renderer/features/appearance/composables/useSidebarLayout'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { usePageParameters } from '@renderer/features/appearance/composables/usePageParameters'
import { preloadSettingsContent } from '@renderer/features/settings/utils/settingsContentLoader'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { prefetchRouteOnIntent } from '../router/routeWarmup'
import type { WarmableRouteName } from '../router/routeComponentLoaders'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { useSidebarOwnedModal } from '../utils/useSidebarOwnedModal'
import { useSidebarPlaylistReorder } from '../utils/useSidebarPlaylistReorder'
import { createSidebarLibraryLoader } from '../utils/sidebarLibraryLoader'
import { useSidebarLibraryStatus } from '../composables/useSidebarLibraryStatus'
import { useSidebarFlavor } from '../composables/useSidebarFlavor'
import { useSidebarResize } from '../composables/useSidebarResize'
import { animateTrashLid } from '@renderer/shared/animation/motion'
import PlaylistIcon from './PlaylistIcon.vue'
import SidebarIcon, { type SidebarIconKind } from './SidebarIcon.vue'
import SidebarAlbumEntry from './SidebarAlbumEntry.vue'
import { vBrandResonance } from './sidebarBrandMotion'

const props = defineProps<{ maxWidth: number; resizeDisabled: boolean }>()
const emit = defineEmits<{ 'resize-active-change': [active: boolean] }>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const playback = usePlayback()
const { displayMode } = usePlayerDisplayMode()
const { isSettingsOpen, openSettings } = useSettingsDialog()
const pageParameters = usePageParameters()
const canOpenPageParameters = computed(() =>
  Boolean(pageParameters?.supported.value && pageParameters.context.value),
)
const pageParametersLabel = computed(() =>
  t(
    canOpenPageParameters.value
      ? 'sidebar.tool.pageParameters'
      : 'sidebar.tool.pageParametersUnavailable',
  ),
)
const { sidebarFullHeight, sidebarCollapsed, setSidebarCollapsed } = useSidebarLayout()
/** 收起图标栏仅在全高布局生效；悬浮布局始终展示完整侧栏。 */
const isRail = computed(() => sidebarFullHeight.value && sidebarCollapsed.value)

function toggleSidebarCollapsed(): void {
  if (!sidebarFullHeight.value) return
  setSidebarCollapsed(!sidebarCollapsed.value)
}
const isFacetsDialogOpen = ref(false)
const libraryStatus = useSidebarLibraryStatus(auralis.library)
const { isRefreshing, refreshLibrary } = libraryStatus
const libraryStatusLabel = computed(() =>
  t(`sidebar.status.${libraryStatus.status.value}`, libraryStatus.counts.value),
)
watch(isSettingsOpen, (open, wasOpen) => {
  if (wasOpen && !open) void libraryStatus.reload()
})

const playlistItems = ref<SidebarPlaylistItem[]>([])
const sidebarNavigation = ref<HTMLElement | null>(null)
const sidebarPlaylistSection = ref<HTMLElement | null>(null)
const smartPlaylists = ref<SmartPlaylist[]>([])
const smartPlaylistKinds = computed(
  () =>
    new Map(
      smartPlaylists.value.map((playlist) => [
        playlist.id,
        'preset' in playlist.rule ? playlist.rule.preset : 'custom',
      ]),
    ),
)
const libraryStats = ref<LibraryStats>({ trackCount: 0, albumCount: 0 })
const isFlavorHovered = ref(false)
const isFlavorFocused = ref(false)
const flavor = useSidebarFlavor(
  computed(() => !isRail.value),
  computed(() => isFlavorHovered.value || isFlavorFocused.value),
)
const flavorValues = computed(() => ({ count: libraryStats.value.trackCount }))
const flavorLabel = computed(() => t(`sidebar.flavor.${flavor.key.value}`, flavorValues.value))
const flavorLabelRef = ref<HTMLElement | null>(null)
const flavorTextRef = ref<HTMLElement | null>(null)
const isFlavorOverflowing = ref(false)
const flavorOverflowDistance = ref(0)

function updateFlavorOverflow(): void {
  if (isRail.value || !flavorLabelRef.value || !flavorTextRef.value) {
    isFlavorOverflowing.value = false
    flavorOverflowDistance.value = 0
    return
  }
  const containerWidth = flavorLabelRef.value.clientWidth
  const contentWidth = flavorTextRef.value.scrollWidth
  if (contentWidth > containerWidth + 4) {
    isFlavorOverflowing.value = true
    flavorOverflowDistance.value = contentWidth - containerWidth
  } else {
    isFlavorOverflowing.value = false
    flavorOverflowDistance.value = 0
  }
}

useResizeObserver(flavorLabelRef, updateFlavorOverflow)

const flavorMarqueeStyle = computed(() => {
  if (!isFlavorOverflowing.value) return undefined
  const duration = Math.max(7, Math.round(flavorOverflowDistance.value / 18))
  return {
    '--flavor-scroll-distance': `${flavorOverflowDistance.value}px`,
    '--flavor-scroll-duration': `${duration}s`,
  }
})

watch([() => flavorLabel.value, isRail], () => {
  void nextTick(updateFlavorOverflow)
})
const sidebarLibraryLoader = createSidebarLibraryLoader({
  playlistItems,
  smartPlaylists,
  libraryStats,
  getStats: () => auralis.library.getStats(),
  listSidebarItems: () => auralis.playlists.listSidebarItems(),
  listSmartPlaylists: () => auralis.smartPlaylists.list(),
  listSmartTrackCounts: () => auralis.smartPlaylists.listTrackCounts(),
})
const {
  createPlaylistButton,
  createMenu,
  smartCreateTrigger,
  smartCreatePanel,
  smartCreateSubmenu,
  creatingPlaybackPreset,
  createError,
  playlistContextMenu,
  playlistContextHasPrevious,
  playlistContextHasNext,
  playlistContextTrigger,
  renamingPlaylist,
  deletingPlaylist,
  isDeletingPlaylist,
  deleteError,
  renameValue,
  renameError,
  isSavingRename,
  renameInput,
  isBuilderOpen,
  sidebarModalTrigger,
  openCreateMenu,
  closeCreateMenu,
  toggleSmartCreateSubmenu,
  enterSmartCreateSubmenu,
  onSmartCreateSubmenuKeydown,
  createPlaybackPreset,
  createRegularPlaylist,
  openSmartPlaylistBuilder,
  openPlaylistContextMenu,
  closePlaylistContextMenu,
  movePlaylistFromMenu,
  cancelDeleteOnOtherClick,
  openRenameDialog,
  closeRenameDialog,
  submitRename,
  requestDelete,
} = useSidebarPlaylistActions({
  api: auralis,
  route,
  router,
  t,
  playlistItems,
  reloadPlaylists: loadSidebarPlaylists,
  cancelReorder: (immediate) => cancelPlaylistReorder(immediate),
  canMove: (item, direction) => canMovePlaylist(item, direction),
  move: (item, direction) => movePlaylist(item, direction),
  closeRecentAddedContextMenu,
  getPlaylistKey,
  getPlaylistPath,
  onMenuKeydown,
})
const createMenuPanel = ref<HTMLElement | null>(null)
const playlistContextPanel = ref<HTMLElement | null>(null)
const playlistContextPositioned = ref(false)
let playlistPosition: ReturnType<typeof startFloatingPosition> | undefined
watch(
  playlistContextMenu,
  () => {
    playlistPosition?.dispose()
    playlistContextPositioned.value = false
  },
  { flush: 'sync' },
)
watch(
  [playlistContextMenu, playlistContextPanel],
  (_values, _previous, onCleanup) => {
    const menu = playlistContextMenu.value
    const panel = playlistContextPanel.value
    if (!menu || !panel) return
    const session = startFloatingPosition({
      reference: pointReference(menu.x, menu.y),
      floating: panel,
      profile: 'point-menu',
      onPosition: () => {
        playlistContextPositioned.value = true
      },
      onError: closePlaylistContextMenu,
    })
    playlistPosition = session
    onCleanup(session.dispose)
  },
  { flush: 'post' },
)
const recentAddedContextMenu = ref<{ x: number; y: number } | null>(null)
const recentAddedContextPanel = ref<HTMLElement | null>(null)
const recentAddedContextTrigger = ref<HTMLElement | null>(null)
const recentAddedContextPositioned = ref(false)
const recentAddedRangeSelectorOpen = ref(false)
const recentAddedRangeSelectorPanel = ref<HTMLElement | null>(null)
const recentAddedRangeOptions = [
  { value: 7, label: 'sidebar.recentAddedRange7Days' },
  { value: 30, label: 'sidebar.recentAddedRange30Days' },
  { value: 90, label: 'sidebar.recentAddedRange90Days' },
  { value: 'all', label: 'sidebar.recentAddedRangeAll' },
] as const
const recentAddedRange = ref<RecentAddedLibraryRange>('all')
const recentAddedRangeDraft = ref<RecentAddedLibraryRange | null>(null)
const selectedRecentAddedRange = computed(() => {
  const range = recentAddedRangeDraft.value ?? recentAddedRange.value
  return recentAddedRangeOptions.some((option) => option.value === range) ? range : 'custom'
})
const recentAddedRangeSliderValue = ref(recentAddedRangeOptions.length - 1)
let committedRecentAddedSliderValue = recentAddedRangeSliderValue.value
const recentAddedRangeSliderFill = computed(
  () => `${(recentAddedRangeSliderValue.value / (recentAddedRangeOptions.length - 1)) * 100}%`,
)
const customRecentAddedDays = ref<number | ''>('')
let committedCustomRecentAddedDays: number | '' = ''
let recentAddedRangeNavigationId = 0
watch(
  [() => route.name, () => route.query.range],
  () => {
    if (route.name === 'recent-added') {
      syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
    }
  },
  { immediate: true },
)
let recentAddedContextPosition: ReturnType<typeof startFloatingPosition> | undefined
watch(
  recentAddedContextMenu,
  () => {
    recentAddedContextPosition?.dispose()
    recentAddedContextPositioned.value = false
  },
  { flush: 'sync' },
)
watch(
  [recentAddedContextMenu, recentAddedContextPanel],
  (_values, _previous, onCleanup) => {
    const menu = recentAddedContextMenu.value
    const panel = recentAddedContextPanel.value
    if (!menu || !panel) return
    const session = startFloatingPosition({
      reference: pointReference(menu.x, menu.y),
      floating: panel,
      profile: 'point-menu',
      onPosition: () => {
        recentAddedContextPositioned.value = true
      },
      onError: closeRecentAddedContextMenu,
    })
    recentAddedContextPosition = session
    onCleanup(session.dispose)
  },
  { flush: 'post' },
)
watch(
  [deleteError, deletingPlaylist, isDeletingPlaylist],
  () => {
    void playlistPosition?.update()
  },
  { flush: 'post' },
)
const deleteLid = ref<SVGGElement | null>(null)
let stopDeleteLidAnimation: (() => void) | undefined
let deleteMotionPreference: MotionQuery | undefined

function updateDeleteLid(): void {
  stopDeleteLidAnimation?.()
  if (deleteLid.value) {
    stopDeleteLidAnimation = animateTrashLid(
      deleteLid.value,
      deletingPlaylist.value !== null,
      deleteMotionPreference?.matches ?? false,
    )
  }
}
watch([deleteLid, deletingPlaylist], updateDeleteLid, { flush: 'post' })
const renameDialogRef = ref<HTMLElement | null>(null)
let unsubscribeLibraryChanged: (() => void) | null = null
/** Cleans up optimistic nav highlight listeners when a new press starts or the component unmounts. */
let pendingNavCleanup: (() => void) | null = null

const POINTER_MOVE_TOLERANCE = 6

const activePath = ref(route.path)
const albumMenuOpen = ref(false)

const primaryNav = computed<
  Array<{
    to: string
    label: string
    icon: SidebarIconKind
    routeName?: WarmableRouteName
  }>
>(() => [
  {
    to: '/songs',
    label: t('nav.songs'),
    icon: 'song',
    routeName: 'library',
  },
  {
    to: '/albums',
    label: t('nav.albums'),
    icon: 'albums',
    routeName: 'albums',
  },
  {
    to: '/recent-added',
    label: t('sidebar.recentAdded'),
    icon: 'recentAdded',
    routeName: 'library',
  },
  {
    to: '/archive',
    label: t('nav.archive'),
    icon: 'archive',
    routeName: 'archive',
  },
])

function isPrimaryNavActive(path: string): boolean {
  return (
    activePath.value === path ||
    (path === '/archive' && route.name === 'archive-annual-summary') ||
    (path === '/albums' && route.name === 'album-detail' && activePath.value === route.path)
  )
}

function onRouteIntent(routeName?: WarmableRouteName): void {
  if (routeName) {
    void prefetchRouteOnIntent(routeName)
  }
}

const primaryNavItems = computed(() =>
  primaryNav.value.map((item) => ({
    ...item,
    count:
      item.to === '/songs'
        ? libraryStats.value.trackCount
        : item.to === '/albums'
          ? libraryStats.value.albumCount
          : null,
  })),
)

function getPrimaryNavTarget(path: string): RouteLocationRaw {
  if (path !== '/recent-added') return path
  return {
    path,
    query: {
      ...(route.name === 'recent-added' ? route.query : {}),
      range: String(recentAddedRange.value),
    },
    hash: route.name === 'recent-added' ? route.hash : '',
  }
}

function getPlaylistKey(item: { kind: string; id: number }): string {
  return `${item.kind}:${item.id}`
}

const {
  pressedPlaylistKey,
  draggingPlaylistKey,
  hiddenPlaylistKey,
  dropTarget,
  isSaving: isSavingPlaylistOrder,
  reorderError,
  announcement: reorderAnnouncement,
  onPointerDown: onPlaylistPointerDown,
  shouldSuppressClick,
  canMove: canMovePlaylist,
  move: movePlaylist,
  cancel: cancelPlaylistReorder,
} = useSidebarPlaylistReorder({
  playlistItems,
  scrollContainer: sidebarNavigation,
  playlistContainer: sidebarPlaylistSection,
  persistOrder: (items) => auralis.playlists.reorderSidebarItems(items),
  reload: () => loadSidebarPlaylists(),
})

function getPlaylistPath(item: SidebarPlaylistItem): string {
  return item.kind === 'playlist' ? `/playlists/${item.id}` : `/smart-playlists/${item.id}`
}

function getPlaylistIcon(
  item: SidebarPlaylistItem,
): 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' {
  if (item.kind === 'playlist') return 'playlist'
  const kind = smartPlaylistKinds.value.get(item.id)
  return kind === 'recentPlayed' || kind === 'mostListened' || kind === 'recentAdded'
    ? kind
    : 'custom'
}

watch(
  () => route.path,
  (path) => {
    activePath.value = path
  },
)

function setPendingActive(path: string): void {
  activePath.value = path
}

function syncActivePathToRoute(): void {
  activePath.value = route.path
}

/**
 * Optimistic sidebar highlight on press. Must revert when the press does not
 * complete as a navigation (drag, cancel, release outside) so the active tab
 * never desyncs from the actual route.
 */
function setPendingActiveFromPointer(event: PointerEvent, path: string): void {
  if (event.button !== 0) {
    return
  }

  pendingNavCleanup?.()
  setPendingActive(path)

  const pointerId = event.pointerId
  const startX = event.clientX
  const startY = event.clientY
  let settled = false

  const cleanupListeners = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    if (pendingNavCleanup === settle) {
      pendingNavCleanup = null
    }
  }

  const revertIfStale = () => {
    if (activePath.value === path && route.path !== path) {
      syncActivePathToRoute()
    }
  }

  const settle = (shouldRevert: boolean) => {
    if (settled) return
    settled = true
    cleanupListeners()
    if (shouldRevert) {
      revertIfStale()
    }
  }

  const onMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY)
    if (distance > POINTER_MOVE_TOLERANCE) {
      // Drag / long-press move: cancel optimistic highlight; click usually will not navigate.
      settle(true)
    }
  }

  const onUp = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== pointerId) return
    cleanupListeners()
    // Defer past click + router navigation microtasks; revert if route never matched.
    window.setTimeout(() => {
      settled = true
      revertIfStale()
    }, 0)
  }

  const onCancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== pointerId) return
    settle(true)
  }

  pendingNavCleanup = () => settle(true)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}

function onPlaylistClick(event: MouseEvent, path: string): void {
  if (shouldSuppressClick(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  setPendingActive(path)
}

async function playRandomPlaylistTrack(item: SidebarPlaylistItem): Promise<void> {
  try {
    const detail =
      item.kind === 'playlist'
        ? await auralis.playlists.getDetail(item.id)
        : await auralis.smartPlaylists.getDetail(item.id)
    const tracks = detail?.tracks ?? []
    if (tracks.length === 0) return

    const track = tracks[Math.floor(Math.random() * tracks.length)]
    await playback.playTrackFromQueue(tracks, track.id, { shufflePool: tracks })
  } catch (error) {
    // 播放错误无 UI 消费方，仅打日志（原始 message 不直出，避免英文混排）。
    rendererDiagnostics.error({
      scope: 'sidebar.playlist',
      message: 'Failed to play a random playlist track',
      cause: error,
    })
    playback.clearError()
  }
}

function onPlaylistDoubleClick(item: SidebarPlaylistItem, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  if (shouldSuppressClick(event)) return
  void playRandomPlaylistTrack(item)
}

async function loadSidebarPlaylists(): Promise<void> {
  await sidebarLibraryLoader.loadPlaylists()
}

async function loadSidebarStats(): Promise<void> {
  await sidebarLibraryLoader.loadStats()
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const panel = event.currentTarget as HTMLElement
  const buttons = Array.from(
    panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  ).filter(
    (button) => button.closest('[role="menu"]') === panel && button.getClientRects().length > 0,
  )
  if (!buttons.length) return
  event.preventDefault()
  event.stopPropagation()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : index < 0
          ? event.key === 'ArrowDown'
            ? 0
            : buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}

function onRecentAddedContextMenuKeydown(event: KeyboardEvent): void {
  if (!recentAddedRangeSelectorOpen.value) {
    onMenuKeydown(event)
  }
}

useOverlayFocusTrap({
  isOpen: () => createMenu.value !== null,
  container: createMenuPanel,
  onEscape() {
    if (smartCreateSubmenu.value && smartCreatePanel.value?.contains(document.activeElement)) {
      smartCreateSubmenu.value = false
      smartCreateTrigger.value?.focus()
    } else closeCreateMenu()
  },
  restoreFocus: (captured) =>
    (
      resolveRestorableFocusTarget(captured) ??
      resolveRestorableFocusTarget(createPlaylistButton.value)
    )?.focus(),
})

useOverlayFocusTrap({
  isOpen: () => playlistContextMenu.value !== null && playlistContextPositioned.value,
  container: playlistContextPanel,
  onEscape: closePlaylistContextMenu,
  restoreFocus: () =>
    (
      resolveRestorableFocusTarget(playlistContextTrigger.value) ??
      resolveRestorableFocusTarget(createPlaylistButton.value)
    )?.focus(),
})

useOverlayFocusTrap({
  isOpen: () => recentAddedContextMenu.value !== null && recentAddedContextPositioned.value,
  container: recentAddedContextPanel,
  initialFocus: () =>
    recentAddedContextPanel.value?.querySelector<HTMLButtonElement>('button') ??
    recentAddedContextPanel.value ??
    undefined,
  onEscape: closeRecentAddedContextMenu,
  restoreFocus: () => resolveRestorableFocusTarget(recentAddedContextTrigger.value)?.focus(),
})

watch([() => route.path, isRail], () => {
  closeCreateMenu()
  closePlaylistContextMenu()
  closeRecentAddedContextMenu()
})

const resizeDisabled = computed(
  () =>
    props.resizeDisabled ||
    isRail.value ||
    isSettingsOpen.value ||
    albumMenuOpen.value ||
    createMenu.value !== null ||
    playlistContextMenu.value !== null ||
    recentAddedContextMenu.value !== null ||
    isFacetsDialogOpen.value ||
    isBuilderOpen.value ||
    renamingPlaylist.value !== null,
)
const {
  width: resizeWidth,
  isResizing,
  onPointerDown: onResizePointerDown,
  onKeyDown: onResizeKeyDown,
  resetWidth: resetSidebarWidth,
  cancel: cancelSidebarResize,
} = useSidebarResize({
  disabled: resizeDisabled,
  maxWidth: computed(() => props.maxWidth),
  onActiveChange: (active) => emit('resize-active-change', active),
})

watch([() => route.path, sidebarFullHeight, displayMode], cancelSidebarResize, { flush: 'sync' })

watch(
  [
    () => route.path,
    isRail,
    sidebarFullHeight,
    displayMode,
    createMenu,
    playlistContextMenu,
    recentAddedContextMenu,
    albumMenuOpen,
    isFacetsDialogOpen,
    isBuilderOpen,
    renamingPlaylist,
  ],
  () => cancelPlaylistReorder(true),
  { flush: 'sync' },
)

function onSmartPlaylistCreated(playlist: SmartPlaylist): void {
  void loadSidebarPlaylists()
  void router.push(`/smart-playlists/${playlist.id}`)
}

function openRecentAddedContextMenu(x: number, y: number, trigger: HTMLElement | null): void {
  closeCreateMenu()
  closePlaylistContextMenu()
  recentAddedRangeSelectorOpen.value = false
  recentAddedContextTrigger.value = trigger
  recentAddedContextMenu.value = { x, y }
}

function closeRecentAddedContextMenu(): void {
  recentAddedRangeSelectorOpen.value = false
  syncRecentAddedRange(recentAddedRange.value)
  customRecentAddedDays.value = committedCustomRecentAddedDays
  recentAddedContextMenu.value = null
}

async function openRecentAddedRangeSelector(): Promise<void> {
  recentAddedRangeSelectorOpen.value = true
  await nextTick()
  recentAddedRangeSelectorPanel.value
    ?.querySelector<HTMLInputElement>('input[type="range"]')
    ?.focus()
}

function syncRecentAddedRange(range: RecentAddedLibraryRange): void {
  recentAddedRange.value = range
  recentAddedRangeDraft.value = null
  const index = recentAddedRangeOptions.findIndex((option) => option.value === range)
  if (index >= 0) {
    committedRecentAddedSliderValue = index
    recentAddedRangeSliderValue.value = index
  } else if (typeof range === 'number') {
    recentAddedRangeSliderValue.value = committedRecentAddedSliderValue
    committedCustomRecentAddedDays = range
    customRecentAddedDays.value = range
  }
}

function applyRecentAddedRange(range: RecentAddedLibraryRange): void {
  if (route.name !== 'recent-added') {
    syncRecentAddedRange(range)
    return
  }
  recentAddedRangeDraft.value = range
  const navigationId = ++recentAddedRangeNavigationId
  void router
    .replace({ query: { ...route.query, range: String(range) }, hash: route.hash })
    .then(() => {
      if (navigationId === recentAddedRangeNavigationId && route.name === 'recent-added') {
        syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
      }
    })
    .catch((error) => {
      if (navigationId === recentAddedRangeNavigationId && route.name === 'recent-added') {
        syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
      }
      rendererDiagnostics.error({
        scope: 'sidebar.recent-added',
        message: 'Failed to update recently added range',
        cause: error,
      })
    })
}

function selectRecentAddedRangeBySlider(event: Event): void {
  const sliderValue = Number((event.target as HTMLInputElement).value)
  const option = recentAddedRangeOptions[sliderValue]
  if (!option) {
    syncRecentAddedRange(recentAddedRange.value)
    return
  }
  if (route.name !== 'recent-added') {
    syncRecentAddedRange(option.value)
    return
  }
  recentAddedRangeSliderValue.value = sliderValue
  recentAddedRangeDraft.value = option.value
}

function commitRecentAddedRangeBySlider(event: Event): void {
  const option = recentAddedRangeOptions[Number((event.target as HTMLInputElement).value)]
  if (!option) {
    syncRecentAddedRange(recentAddedRange.value)
    return
  }
  applyRecentAddedRange(option.value)
}

function applyCustomRecentAddedRange(): void {
  const days = parseRecentAddedLibraryRange(customRecentAddedDays.value)
  if (typeof days === 'number') {
    committedCustomRecentAddedDays = days
    applyRecentAddedRange(days)
  } else {
    customRecentAddedDays.value = committedCustomRecentAddedDays
  }
}

function onPrimaryNavContextMenu(item: { to: string }, event: MouseEvent): void {
  if (item.to !== '/recent-added') return
  event.preventDefault()
  event.stopPropagation()
  openRecentAddedContextMenu(
    event.clientX,
    event.clientY,
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  )
}

function onPrimaryNavKeydown(item: { to: string }, event: KeyboardEvent): void {
  if (
    item.to !== '/recent-added' ||
    (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey))
  )
    return

  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const rect = target.getBoundingClientRect()
  openRecentAddedContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, target)
}

function onPlaylistKeydown(item: SidebarPlaylistItem, event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    event.preventDefault()
    event.stopPropagation()
    cancelPlaylistReorder(true)
    movePlaylist(item, event.key === 'ArrowUp' ? -1 : 1)
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    openPlaylistContextMenu(
      item,
      new MouseEvent('contextmenu', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    )
  } else if (event.key === 'Enter') setPendingActive(getPlaylistPath(item))
}

useSidebarOwnedModal({
  isOpen: () => renamingPlaylist.value !== null,
  container: renameDialogRef,
  trigger: sidebarModalTrigger,
  onEscape: closeRenameDialog,
})

function onPlaylistsChanged(): void {
  void loadSidebarStats()
}

onMounted(() => {
  deleteMotionPreference = createReducedMotionQuery()
  deleteMotionPreference.addEventListener('change', updateDeleteLid)
  void loadSidebarStats()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
      void sidebarLibraryLoader.refreshPlayStats().catch((cause: unknown) => {
        rendererDiagnostics.error({
          scope: 'sidebar.playlist',
          message: 'Failed to refresh playback playlist counts',
          cause,
        })
      })
      return
    }
    void loadSidebarStats()
  })
  window.addEventListener('auralis-playlists-changed', onPlaylistsChanged)
  void nextTick(updateFlavorOverflow)
  window.addEventListener('resize', updateFlavorOverflow)
})

onBeforeUnmount(() => {
  sidebarLibraryLoader.dispose()
  playlistPosition?.dispose()
  stopDeleteLidAnimation?.()
  deleteMotionPreference?.removeEventListener('change', updateDeleteLid)
  pendingNavCleanup?.()
  pendingNavCleanup = null
  unsubscribeLibraryChanged?.()
  unsubscribeLibraryChanged = null
  window.removeEventListener('auralis-playlists-changed', onPlaylistsChanged)
  window.removeEventListener('resize', updateFlavorOverflow)
})
</script>

<template>
  <aside
    class="app-sidebar"
    :class="{
      'app-sidebar--full-height': sidebarFullHeight,
      'app-sidebar--collapsed': isRail,
    }"
  >
    <div
      v-if="!isRail"
      class="sidebar-resize-handle"
      :class="{ 'is-resizing': isResizing }"
      role="separator"
      aria-orientation="vertical"
      aria-controls="sidebar-navigation"
      :aria-label="t('sidebar.resize')"
      :aria-valuemin="SIDEBAR_WIDTH.min"
      :aria-valuemax="maxWidth"
      :aria-valuenow="resizeWidth"
      :aria-disabled="resizeDisabled || undefined"
      :tabindex="resizeDisabled ? -1 : 0"
      :title="t('sidebar.resizeHint')"
      @pointerdown="onResizePointerDown"
      @keydown="onResizeKeyDown"
      @dblclick.prevent.stop="resetSidebarWidth"
    />
    <header class="sidebar-header">
      <div class="sidebar-header-main">
        <component
          :is="sidebarFullHeight ? 'button' : 'div'"
          v-brand-resonance="isRail"
          v-tooltip.right="isRail ? t('sidebar.expand') : ''"
          class="sidebar-brand-left"
          :data-sidebar-toggle="sidebarFullHeight ? '' : undefined"
          :class="{ 'sidebar-brand-toggle': sidebarFullHeight }"
          v-bind="
            sidebarFullHeight
              ? {
                  type: 'button',
                  'aria-expanded': !sidebarCollapsed,
                  'aria-label': sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse'),
                  'aria-controls': 'sidebar-navigation',
                }
              : {}
          "
          @click="toggleSidebarCollapsed"
        >
          <span class="sidebar-brand-mark" aria-hidden="true">
            <svg
              class="sidebar-brand-symbol"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              stroke-width="7.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 52 27.3 13C29.1 8.9 34.9 8.9 36.7 13L54 52" />
              <path
                class="sidebar-brand-resonance"
                d="M17 38C23 29.5 28 45.5 34 37.5S42 32 47 38"
                stroke-width="6.5"
              />
            </svg>
          </span>
          <div class="sidebar-brand-copy" :aria-hidden="isRail || undefined">
            <div class="sidebar-brand-name" role="img" aria-label="AuralisMusic">
              <span
                v-for="(letter, index) in 'uralisMusic'"
                :key="index"
                class="sidebar-brand-letter"
                >{{ letter }}</span
              >
            </div>
          </div>
        </component>
      </div>
    </header>

    <nav
      id="sidebar-navigation"
      ref="sidebarNavigation"
      class="sidebar-navigation"
      :class="{ 'sidebar-navigation--empty': playlistItems.length === 0 && !isRail }"
    >
      <section class="sidebar-primary-section">
        <div class="sidebar-section-label">{{ t('sidebar.library') }}</div>
        <template v-for="item in primaryNavItems" :key="item.to">
          <SidebarAlbumEntry
            v-if="item.to === '/albums'"
            :rail="isRail"
            :active="isPrimaryNavActive(item.to)"
            :count="libraryStats.albumCount"
            :blocked="
              props.resizeDisabled ||
              isSettingsOpen ||
              isFacetsDialogOpen ||
              isBuilderOpen ||
              renamingPlaylist !== null ||
              createMenu !== null ||
              playlistContextMenu !== null ||
              displayMode !== 'normal'
            "
            @intent="onRouteIntent(item.routeName)"
            @navigate-pointer="setPendingActiveFromPointer($event, item.to)"
            @navigate-enter="setPendingActive(item.to)"
            @menu-open-change="albumMenuOpen = $event"
          />
          <RouterLink
            v-else
            v-tooltip.right="isRail ? item.label : ''"
            :to="getPrimaryNavTarget(item.to)"
            class="sidebar-link"
            :draggable="false"
            :aria-label="item.label"
            :aria-haspopup="item.to === '/recent-added' ? 'menu' : undefined"
            :aria-expanded="
              item.to === '/recent-added' ? recentAddedContextMenu !== null : undefined
            "
            :aria-controls="
              item.to === '/recent-added' && recentAddedContextMenu
                ? 'sidebar-recent-added-context-menu'
                : undefined
            "
            :aria-keyshortcuts="item.to === '/recent-added' ? 'ContextMenu Shift+F10' : undefined"
            :class="{
              'sidebar-link-with-count': item.count !== null,
              'sidebar-link-active': isPrimaryNavActive(item.to),
            }"
            @dragstart.prevent
            @pointerenter="onRouteIntent(item.routeName)"
            @focusin="onRouteIntent(item.routeName)"
            @pointerdown="setPendingActiveFromPointer($event, item.to)"
            @keydown.enter="setPendingActive(item.to)"
            @contextmenu="onPrimaryNavContextMenu(item, $event)"
            @keydown="onPrimaryNavKeydown(item, $event)"
          >
            <span class="sidebar-link-icon">
              <SidebarIcon :kind="item.icon" />
            </span>
            <span class="sidebar-link-label">{{ item.label }}</span>
            <span v-if="item.count !== null" class="sidebar-link-count">{{ item.count }}</span>
          </RouterLink>
        </template>
      </section>

      <section
        ref="sidebarPlaylistSection"
        class="sidebar-playlist-section"
        :aria-busy="isSavingPlaylistOrder"
        :data-playlist-drop-key="dropTarget?.key"
        :data-playlist-drop-position="dropTarget?.position"
      >
        <div class="smart-playlist-section-header">
          <div class="sidebar-section-title">
            <div class="sidebar-section-label">{{ t('sidebar.playlists') }}</div>
          </div>
          <button
            ref="createPlaylistButton"
            v-tooltip.right="isRail ? t('sidebar.newPlaylist') : ''"
            class="smart-playlist-add-button"
            type="button"
            :aria-label="t('sidebar.newPlaylist')"
            aria-haspopup="menu"
            :aria-expanded="createMenu !== null"
            aria-controls="sidebar-create-menu"
            @click="openCreateMenu"
          >
            <span class="i-ph-plus"></span>
          </button>
        </div>
        <p id="sidebar-playlist-reorder-help" class="sr-only">
          {{ t('sidebar.reorderHelp') }}
        </p>
        <p v-if="reorderError" class="sidebar-playlist-reorder-error" role="alert">
          {{ t(reorderError === 'save' ? 'sidebar.reorderFailed' : 'sidebar.reorderReloadFailed') }}
        </p>
        <RouterLink
          v-for="playlist in playlistItems"
          :key="getPlaylistKey(playlist)"
          v-memo="[
            playlist.kind,
            playlist.id,
            playlist.name,
            playlist.trackCount,
            playlist.viewMode,
            playlist.sortOrder,
            playlist.createdAt,
            playlist.updatedAt,
            activePath,
            pressedPlaylistKey === getPlaylistKey(playlist),
            draggingPlaylistKey === getPlaylistKey(playlist),
            hiddenPlaylistKey === getPlaylistKey(playlist),
            isRail,
            locale,
            getPlaylistIcon(playlist),
          ]"
          v-tooltip.right="isRail ? playlist.name : ''"
          :to="getPlaylistPath(playlist)"
          :data-sidebar-playlist-key="getPlaylistKey(playlist)"
          :draggable="false"
          class="sidebar-link"
          :aria-label="playlist.name"
          aria-describedby="sidebar-playlist-reorder-help"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Shift+F10"
          :class="{
            'sidebar-link-with-count': true,
            'sidebar-link-active': activePath === getPlaylistPath(playlist),
            'smart-playlist-link-pressed': pressedPlaylistKey === getPlaylistKey(playlist),
            'smart-playlist-link-dragging': draggingPlaylistKey === getPlaylistKey(playlist),
            'sidebar-playlist-drag-origin': hiddenPlaylistKey === getPlaylistKey(playlist),
          }"
          @pointerdown="onPlaylistPointerDown(playlist, $event)"
          @click.capture="onPlaylistClick($event, getPlaylistPath(playlist))"
          @dblclick="onPlaylistDoubleClick(playlist, $event)"
          @dragstart.prevent
          @keydown="onPlaylistKeydown(playlist, $event)"
          @contextmenu.prevent="openPlaylistContextMenu(playlist, $event)"
        >
          <span class="sidebar-link-icon">
            <PlaylistIcon :kind="getPlaylistIcon(playlist)" />
          </span>
          <span class="sidebar-link-label">{{ playlist.name }}</span>
          <span class="sidebar-link-count">{{ playlist.trackCount }}</span>
        </RouterLink>
        <div v-if="playlistItems.length === 0 && !isRail" class="smart-playlist-empty">
          <button class="sidebar-playlist-empty-action" type="button" @click="openCreateMenu">
            {{ t('sidebar.createFirstPlaylist') }}
          </button>
        </div>
      </section>
    </nav>
    <footer class="sidebar-footer">
      <div
        class="sidebar-status-card"
        :data-tone="libraryStatus.tone.value"
        role="status"
        :aria-label="libraryStatusLabel"
        tabindex="0"
        @pointerenter="isFlavorHovered = true"
        @pointerleave="isFlavorHovered = false"
        @focusin="isFlavorFocused = true"
        @focusout="isFlavorFocused = false"
      >
        <div class="sidebar-status-card-main">
          <span class="sidebar-status-dot" aria-hidden="true"></span>
          <span
            v-if="!isRail"
            ref="flavorLabelRef"
            class="sidebar-status-label auralis-type-caption"
            :class="{ 'sidebar-status-label--marquee': isFlavorOverflowing }"
            :style="flavorMarqueeStyle"
            aria-hidden="true"
          >
            <span ref="flavorTextRef" class="sidebar-flavor-text">{{ flavorLabel }}</span>
          </span>
          <span class="sr-only">{{ libraryStatusLabel }}</span>
        </div>
        <button
          v-if="!isRail"
          v-tooltip.fast="
            isRefreshing ? t('sidebar.tool.refreshBusy') : t('sidebar.tool.refreshAction')
          "
          class="sidebar-status-refresh-button"
          type="button"
          :aria-label="
            isRefreshing ? t('sidebar.tool.refreshBusy') : t('sidebar.tool.refreshAction')
          "
          :disabled="isRefreshing"
          :aria-busy="isRefreshing"
          @click.stop="refreshLibrary"
        >
          <SidebarIcon kind="refresh" :class="{ 'animate-spin': isRefreshing }" />
        </button>
      </div>

      <div class="sidebar-actions-row">
        <button
          v-tooltip.fast="isRail ? t('sidebar.tool.settings') : ''"
          type="button"
          class="sidebar-tool-button sidebar-settings-button"
          :class="{ 'sidebar-tool-button-active': isSettingsOpen }"
          :aria-label="t('sidebar.tool.settings')"
          aria-haspopup="dialog"
          :aria-expanded="isSettingsOpen"
          data-settings-trigger
          @pointerenter="preloadSettingsContent"
          @focusin="preloadSettingsContent"
          @click="openSettings()"
        >
          <span class="sidebar-settings-icon"><SidebarIcon kind="settings" /></span>
          <span v-if="!isRail" class="sidebar-settings-label auralis-type-control">{{
            t('sidebar.tool.settings')
          }}</span>
          <span v-if="!isRail" class="sidebar-settings-shortcut" aria-hidden="true">⌘,</span>
        </button>

        <div class="sidebar-tools-grid" role="group" :aria-label="t('sidebar.toolbarAria')">
          <button
            v-if="isRail"
            v-tooltip.fast="
              isRefreshing ? t('sidebar.tool.refreshBusy') : t('sidebar.tool.refreshAction')
            "
            class="sidebar-tool-button"
            type="button"
            :aria-label="
              isRefreshing ? t('sidebar.tool.refreshBusy') : t('sidebar.tool.refreshAction')
            "
            :disabled="isRefreshing"
            :aria-busy="isRefreshing"
            @click="refreshLibrary"
          >
            <SidebarIcon kind="refresh" :class="{ 'animate-spin': isRefreshing }" />
          </button>
          <button
            v-tooltip.fast="pageParametersLabel"
            type="button"
            class="sidebar-tool-button"
            :class="{ 'sidebar-tool-button-active': pageParameters?.open.value }"
            :aria-label="pageParametersLabel"
            :aria-disabled="!canOpenPageParameters"
            aria-haspopup="dialog"
            :aria-expanded="pageParameters?.open.value ?? false"
            aria-controls="page-parameter-panel"
            data-page-parameters-trigger
            @click="
              canOpenPageParameters && pageParameters?.toggle($event.currentTarget as HTMLElement)
            "
          >
            <SidebarIcon kind="parameters" />
          </button>
          <button
            v-tooltip.fast="t('sidebar.tool.facetsPanel')"
            class="sidebar-tool-button"
            type="button"
            :aria-label="t('sidebar.tool.facetsPanel')"
            @click="isFacetsDialogOpen = true"
          >
            <SidebarIcon kind="filters" />
          </button>
        </div>
      </div>
    </footer>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ reorderAnnouncement ? t('sidebar.reorderAnnouncement', reorderAnnouncement) : '' }}
    </p>
    <FacetsDialog
      :open="isFacetsDialogOpen"
      @close="isFacetsDialogOpen = false"
      @created="onSmartPlaylistCreated"
    />
    <SmartPlaylistBuilderDialog
      :open="isBuilderOpen"
      :trigger="sidebarModalTrigger"
      @close="isBuilderOpen = false"
      @created="onSmartPlaylistCreated"
    />

    <Teleport to="body">
      <div v-if="createMenu" class="sidebar-overlay fixed inset-0 z-[88]" @click="closeCreateMenu">
        <div
          id="sidebar-create-menu"
          ref="createMenuPanel"
          class="sidebar-create-menu library-context-menu frosted-context-menu fixed w-48"
          role="menu"
          :aria-label="t('sidebar.newPlaylist')"
          :style="{
            left: `${createMenu.x}px`,
            top: `${createMenu.y}px`,
          }"
          @click.stop
          @keydown="onMenuKeydown"
        >
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            @click="createRegularPlaylist"
          >
            <PlaylistIcon kind="playlist" />
            <span>{{ t('sidebar.newPlaylist') }}</span>
          </button>
          <div class="library-context-menu-separator" role="separator"></div>
          <div class="library-context-menu-submenu-root">
            <button
              ref="smartCreateTrigger"
              class="library-context-menu-item"
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              :aria-expanded="!!smartCreateSubmenu"
              aria-controls="sidebar-smart-create-submenu"
              @click="toggleSmartCreateSubmenu"
              @keydown.right.prevent.stop="enterSmartCreateSubmenu"
              @keydown.down.prevent.stop="enterSmartCreateSubmenu"
            >
              <span class="i-ph-sparkle" aria-hidden="true"></span>
              <span class="library-context-menu-text">{{ t('sidebar.newSmartPlaylist') }}</span>
              <span
                class="library-context-menu-chevron"
                :class="smartCreateSubmenu ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                aria-hidden="true"
              ></span>
            </button>
            <Transition name="sidebar-smart-create-expand">
              <div v-if="smartCreateSubmenu" class="sidebar-smart-create-submenu">
                <div
                  id="sidebar-smart-create-submenu"
                  ref="smartCreatePanel"
                  role="menu"
                  :aria-label="t('sidebar.newSmartPlaylist')"
                  @keydown="onSmartCreateSubmenuKeydown"
                >
                  <button
                    class="library-context-menu-item"
                    type="button"
                    :disabled="!!creatingPlaybackPreset"
                    :aria-busy="creatingPlaybackPreset === 'recentPlayed'"
                    role="menuitem"
                    @click="createPlaybackPreset('recentPlayed')"
                  >
                    <PlaylistIcon kind="recentPlayed" />
                    <span>{{ t('sidebar.recentPlayed') }}</span>
                  </button>
                  <div class="library-context-menu-separator" role="separator"></div>
                  <button
                    class="library-context-menu-item"
                    type="button"
                    :disabled="!!creatingPlaybackPreset"
                    :aria-busy="creatingPlaybackPreset === 'mostListened'"
                    role="menuitem"
                    @click="createPlaybackPreset('mostListened')"
                  >
                    <PlaylistIcon kind="mostListened" />
                    <span>{{ t('sidebar.mostListened') }}</span>
                  </button>
                  <div class="library-context-menu-separator" role="separator"></div>
                  <button
                    class="library-context-menu-item"
                    type="button"
                    role="menuitem"
                    @click="openSmartPlaylistBuilder"
                  >
                    <PlaylistIcon kind="custom" />
                    <span>{{ t('sidebar.customSmartPlaylist') }}</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <p v-if="createError" class="sidebar-create-error" role="alert">{{ t(createError) }}</p>
        </div>
      </div>

      <div
        v-if="recentAddedContextMenu"
        class="sidebar-overlay fixed inset-0 z-[90]"
        @click="closeRecentAddedContextMenu"
      >
        <div
          id="sidebar-recent-added-context-menu"
          ref="recentAddedContextPanel"
          class="collection-context-menu library-context-menu frosted-context-menu fixed sidebar-recent-added-context-panel"
          :role="recentAddedRangeSelectorOpen ? 'group' : 'menu'"
          :aria-label="
            t(recentAddedRangeSelectorOpen ? 'sidebar.recentAddedRange' : 'sidebar.recentAdded')
          "
          :style="{
            '--sidebar-recent-added-context-width': recentAddedRangeSelectorOpen
              ? 'min(560px, calc(100vw - 16px))'
              : '192px',
          }"
          @click.stop
          @keydown="onRecentAddedContextMenuKeydown"
        >
          <button
            v-if="!recentAddedRangeSelectorOpen"
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            @click="openRecentAddedRangeSelector"
          >
            <span class="i-lucide-clock" aria-hidden="true"></span>
            <span class="library-context-menu-text">{{ t('sidebar.recentAddedRange') }}</span>
          </button>
          <div
            v-else
            id="sidebar-recent-added-range-selector"
            ref="recentAddedRangeSelectorPanel"
            class="sidebar-recent-added-range-selector"
          >
            <div class="sidebar-recent-added-range-scale">
              <input
                class="sidebar-recent-added-range-slider"
                type="range"
                min="0"
                :max="recentAddedRangeOptions.length - 1"
                step="1"
                :value="recentAddedRangeSliderValue"
                :style="{ '--sidebar-recent-added-range-fill': recentAddedRangeSliderFill }"
                :aria-label="t('sidebar.recentAddedRange')"
                :aria-valuetext="t(recentAddedRangeOptions[recentAddedRangeSliderValue].label)"
                @input="selectRecentAddedRangeBySlider"
                @change="commitRecentAddedRangeBySlider"
              />
              <div class="sidebar-recent-added-range-labels" aria-hidden="true">
                <span
                  v-for="option in recentAddedRangeOptions"
                  :key="option.value"
                  :class="{
                    'is-active': selectedRecentAddedRange === option.value,
                  }"
                >
                  {{ t(option.label) }}
                </span>
              </div>
            </div>
            <label class="sidebar-recent-added-range-custom">
              <span class="sidebar-recent-added-range-custom-label">
                {{ t('sidebar.recentAddedRangeCustom') }}
              </span>
              <span class="sidebar-recent-added-range-custom-input-row">
                <input
                  v-model.number="customRecentAddedDays"
                  type="number"
                  min="1"
                  :max="MAX_RECENT_ADDED_LIBRARY_DAYS"
                  step="1"
                  inputmode="numeric"
                  :aria-label="t('sidebar.recentAddedRangeCustomInput')"
                  :placeholder="t('sidebar.recentAddedRangeCustomPlaceholder')"
                  @change="applyCustomRecentAddedRange"
                  @keydown.enter.prevent="applyCustomRecentAddedRange"
                />
                <span aria-hidden="true">{{ t('sidebar.recentAddedRangeDayUnit') }}</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div
        v-if="playlistContextMenu"
        class="sidebar-overlay fixed inset-0 z-[90]"
        @click="closePlaylistContextMenu"
        @click.capture="cancelDeleteOnOtherClick"
      >
        <div
          ref="playlistContextPanel"
          class="collection-context-menu library-context-menu frosted-context-menu fixed w-40"
          role="menu"
          :aria-label="playlistContextMenu.item.name"
          style="visibility: hidden; overflow: auto"
          @click.stop
          @keydown="onMenuKeydown"
        >
          <button
            v-if="playlistContextHasPrevious"
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            :disabled="!canMovePlaylist(playlistContextMenu.item, -1)"
            @click="movePlaylistFromMenu(-1)"
          >
            <span class="i-ph-arrow-up"></span>
            <span>{{ t('sidebar.moveUp') }}</span>
          </button>
          <div
            v-if="playlistContextHasPrevious && playlistContextHasNext"
            class="library-context-menu-separator"
            role="separator"
          ></div>
          <button
            v-if="playlistContextHasNext"
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            :disabled="!canMovePlaylist(playlistContextMenu.item, 1)"
            @click="movePlaylistFromMenu(1)"
          >
            <span class="i-ph-arrow-down"></span>
            <span>{{ t('sidebar.moveDown') }}</span>
          </button>
          <div
            v-if="playlistContextHasPrevious || playlistContextHasNext"
            class="library-context-menu-separator"
            role="separator"
          ></div>
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            @click="openRenameDialog"
          >
            <span class="i-ph-pencil-simple"></span>
            <span>{{ t('sidebar.rename') }}</span>
          </button>
          <div class="library-context-menu-separator" role="separator"></div>
          <button
            class="library-context-menu-item smart-playlist-context-danger"
            type="button"
            data-delete-playlist
            role="menuitem"
            :disabled="isDeletingPlaylist"
            @click="requestDelete"
          >
            <span aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                overflow="visible"
              >
                <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M10 10v8M14 10v8" />
                <g ref="deleteLid">
                  <path d="M3 6h18M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                </g>
              </svg>
            </span>
            <span>{{ t(deletingPlaylist ? 'sidebar.confirmDelete' : 'sidebar.delete') }}</span>
          </button>
          <p v-if="deleteError" class="px-3 py-1 text-xs" role="alert">{{ t(deleteError) }}</p>
        </div>
      </div>

      <div v-if="renamingPlaylist" class="sidebar-overlay smart-playlist-dialog-backdrop">
        <form
          ref="renameDialogRef"
          class="smart-playlist-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('sidebar.renameDialogTitle')"
          @submit.prevent="submitRename"
        >
          <h2>{{ t('sidebar.renameDialogTitle') }}</h2>
          <input
            ref="renameInput"
            v-model="renameValue"
            type="text"
            :aria-label="t('sidebar.playlistName')"
            @input="renameError = ''"
          />
          <p v-if="renameError" class="smart-playlist-dialog-error" role="alert">
            {{ t(renameError) }}
          </p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeRenameDialog">{{ t('sidebar.cancel') }}</button>
            <button
              type="submit"
              class="smart-playlist-dialog-primary"
              :disabled="isSavingRename"
              :aria-busy="isSavingRename"
            >
              {{ t('sidebar.save') }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar-recent-added-context-panel {
  width: var(--sidebar-recent-added-context-width);
  overflow: auto;
  visibility: hidden;
}

.sidebar-recent-added-range-selector {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 4px;
}

.sidebar-recent-added-range-scale {
  display: flex;
  min-width: 100px;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.sidebar-recent-added-range-slider {
  width: 100%;
  height: 20px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.sidebar-recent-added-range-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--auralis-theme-accent) 0,
    var(--auralis-theme-accent) var(--sidebar-recent-added-range-fill),
    var(--auralis-control-hover-bg) var(--sidebar-recent-added-range-fill),
    var(--auralis-control-hover-bg) 100%
  );
}

.sidebar-recent-added-range-slider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  appearance: none;
  border: 2px solid var(--auralis-control-bg);
  border-radius: 50%;
  background: var(--auralis-theme-accent);
  box-shadow: 0 1px 4px rgb(0 0 0 / 28%);
}

.sidebar-recent-added-range-slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--auralis-control-hover-bg);
}

.sidebar-recent-added-range-slider::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--auralis-theme-accent);
}

.sidebar-recent-added-range-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 2px solid var(--auralis-control-bg);
  border-radius: 50%;
  background: var(--auralis-theme-accent);
  box-shadow: 0 1px 4px rgb(0 0 0 / 28%);
}

.sidebar-recent-added-range-labels {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  white-space: nowrap;
}

.sidebar-recent-added-range-labels .is-active {
  color: var(--auralis-text);
}

.sidebar-recent-added-range-slider:focus-visible,
.sidebar-recent-added-range-custom input:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 1px;
}

.sidebar-recent-added-range-custom {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-left: auto;
  border-left: 1px solid var(--auralis-border-subtle);
  padding-left: 8px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  white-space: nowrap;
}

.sidebar-recent-added-range-custom-label {
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-overline-size);
  line-height: var(--auralis-type-overline-line-height);
}

.sidebar-recent-added-range-custom-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-recent-added-range-custom input {
  width: 64px;
  height: 30px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  padding: 4px 7px;
  background: var(--auralis-control-bg);
  color: var(--auralis-text);
  font: inherit;
  text-align: right;
}

.sidebar-recent-added-range-custom input::-webkit-inner-spin-button {
  transform: scale(0.75);
  transform-origin: center right;
}
</style>
