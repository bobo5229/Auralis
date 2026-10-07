<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { RouterLink, useRouter } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { DEFAULT_RECENT_PLAYED_DAYS } from '@shared/smartPlaylists/recentFrequent'
import { DEFAULT_RECENT_ADDED_DAYS } from '@shared/smartPlaylists/recentAdded'
import { useRoute } from 'vue-router'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import SmartPlaylistBuilderDialog from '@renderer/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue'
import { useLibraryScanStart } from '@renderer/features/library/composables/useLibraryScanStart'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useTheme } from '@renderer/composables/useTheme'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { preloadSettingsContent } from '@renderer/features/settings/utils/settingsContentLoader'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { prefetchRouteOnIntent } from '../router/routeWarmup'
import type { WarmableRouteName } from '../router/routeComponentLoaders'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { useSidebarOwnedModal } from '../utils/useSidebarOwnedModal'
import { useSidebarPlaylistReorder } from '../utils/useSidebarPlaylistReorder'
import { animateTrashLid } from '@renderer/shared/animation/motion'
import PlaylistIcon from './PlaylistIcon.vue'
import { vBrandResonance } from './sidebarBrandMotion'

const route = useRoute()
const router = useRouter()
const playback = usePlayback()
const { displayMode } = usePlayerDisplayMode()
const { isSettingsOpen, openSettings } = useSettingsDialog()
const { sidebarFullHeight, sidebarCollapsed, setSidebarCollapsed } = useSidebarLayout()
/** 收起图标栏仅在全高布局生效；悬浮布局始终展示完整侧栏。 */
const isRail = computed(() => sidebarFullHeight.value && sidebarCollapsed.value)

function toggleSidebarCollapsed(): void {
  if (!sidebarFullHeight.value) return
  setSidebarCollapsed(!sidebarCollapsed.value)
}
const isFacetsDialogOpen = ref(false)
const { isStartingLibraryRefresh, refreshLibrary } = useLibraryScanStart({
  getLibraryRoots: () => auralis.library.getRoots(),
  startLibraryScan: (rootId) => auralis.library.startScan(rootId),
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
const createPlaylistButton = ref<HTMLButtonElement | null>(null)
const createMenu = ref<{ x: number; y: number } | null>(null)
const createMenuPanel = ref<HTMLElement | null>(null)
const smartCreateTrigger = ref<HTMLButtonElement | null>(null)
const smartCreatePanel = ref<HTMLElement | null>(null)
const smartCreateSubmenu = ref(false)
const creatingPlaybackPreset = ref<'recentPlayed' | 'mostListened' | 'recentAdded' | null>(null)
const createError = ref('')
const playlistContextMenu = ref<{ item: SidebarPlaylistItem; x: number; y: number } | null>(null)
const playlistContextIndex = computed(() => {
  const item = playlistContextMenu.value?.item
  if (!item) return -1
  return playlistItems.value.findIndex(
    (candidate) => getPlaylistKey(candidate) === getPlaylistKey(item),
  )
})
const playlistContextHasPrevious = computed(() => playlistContextIndex.value > 0)
const playlistContextHasNext = computed(
  () =>
    playlistContextIndex.value >= 0 && playlistContextIndex.value < playlistItems.value.length - 1,
)
const playlistContextPanel = ref<HTMLElement | null>(null)
const playlistContextTrigger = ref<HTMLElement | null>(null)
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
const renamingPlaylist = ref<SidebarPlaylistItem | null>(null)
const deletingPlaylist = ref<SidebarPlaylistItem | null>(null)
const isDeletingPlaylist = ref(false)
const deleteError = ref('')
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
const renameValue = ref('')
const renameError = ref('')
const isSavingRename = ref(false)
let renameSession = 0
const renameInput = ref<HTMLInputElement | null>(null)
const renameDialogRef = ref<HTMLElement | null>(null)
const isBuilderOpen = ref(false)
const sidebarModalTrigger = ref<HTMLElement | null>(null)
let unsubscribeLibraryChanged: (() => void) | null = null
/** Cleans up optimistic nav highlight listeners when a new press starts or the component unmounts. */
let pendingNavCleanup: (() => void) | null = null

const POINTER_MOVE_TOLERANCE = 6

const { t, locale } = useI18n()
const { isDark, toggleTheme } = useTheme()
const themeToggleLabel = computed(() =>
  t(isDark.value ? 'sidebar.tool.themeToLight' : 'sidebar.tool.themeToDark'),
)

function onToggleTheme(): void {
  void toggleTheme()
}

const activePath = ref(route.path)

const primaryNav = computed<
  Array<{
    to: string
    label: string
    icon: string
    activeIcon: string
    routeName?: WarmableRouteName
  }>
>(() => [
  {
    to: '/songs',
    label: t('nav.songs'),
    icon: 'i-ph-music-note-simple',
    activeIcon: 'i-ph-music-note-simple-fill',
    routeName: 'library',
  },
  {
    to: '/albums',
    label: t('nav.albums'),
    icon: 'i-ph-stack',
    activeIcon: 'i-ph-stack-fill',
    routeName: 'albums',
  },
  {
    to: '/albums/cd',
    label: t('albums.cd.title'),
    icon: 'cd-case',
    activeIcon: 'cd-case',
  },
  {
    to: '/archive',
    label: t('nav.archive'),
    icon: 'i-lucide-notebook-pen',
    activeIcon: 'i-lucide-notebook-pen',
    routeName: 'archive',
  },
])

function isPrimaryNavActive(path: string): boolean {
  return (
    activePath.value === path ||
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

function rememberSidebarModalTrigger(preferred?: HTMLElement | null): void {
  sidebarModalTrigger.value =
    resolveRestorableFocusTarget(preferred ?? null) ??
    resolveRestorableFocusTarget(
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    )
}

function playlistRowElement(item: SidebarPlaylistItem): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-sidebar-playlist-key="${CSS.escape(getPlaylistKey(item))}"]`,
  )
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
  const [items, smart] = await Promise.all([
    auralis.playlists.listSidebarItems(),
    auralis.smartPlaylists.list(),
  ])
  playlistItems.value = items
  smartPlaylists.value = smart
}

async function loadSidebarStats(): Promise<void> {
  const [stats, items, smart] = await Promise.all([
    auralis.library.getStats(),
    auralis.playlists.listSidebarItems(),
    auralis.smartPlaylists.list(),
  ])
  libraryStats.value = stats
  playlistItems.value = items
  smartPlaylists.value = smart
}

function openCreateMenu(): void {
  if (!createPlaylistButton.value) return
  closePlaylistContextMenu()
  smartCreateSubmenu.value = false
  createError.value = ''
  const rect = createPlaylistButton.value.getBoundingClientRect()
  createMenu.value = {
    x: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
    y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 220)),
  }
}

function closeCreateMenu(): void {
  smartCreateSubmenu.value = false
  createMenu.value = null
}

function openSmartCreateSubmenu(): void {
  smartCreateSubmenu.value = true
}

function toggleSmartCreateSubmenu(): void {
  smartCreateSubmenu.value = !smartCreateSubmenu.value
}

async function enterSmartCreateSubmenu(): Promise<void> {
  openSmartCreateSubmenu()
  await nextTick()
  smartCreatePanel.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

function onSmartCreateSubmenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft' || event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    smartCreateTrigger.value?.focus()
    smartCreateSubmenu.value = false
  } else {
    onMenuKeydown(event)
  }
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

watch([() => route.path, isRail], () => {
  closeCreateMenu()
  closePlaylistContextMenu()
})

watch(
  [
    () => route.path,
    isRail,
    sidebarFullHeight,
    displayMode,
    createMenu,
    playlistContextMenu,
    isFacetsDialogOpen,
    isBuilderOpen,
    renamingPlaylist,
  ],
  () => cancelPlaylistReorder(true),
  { flush: 'sync' },
)

async function createPlaybackPreset(
  preset: 'recentPlayed' | 'mostListened' | 'recentAdded',
): Promise<void> {
  if (creatingPlaybackPreset.value) return
  creatingPlaybackPreset.value = preset
  createError.value = ''
  try {
    const { playlist } =
      preset === 'recentAdded'
        ? await auralis.smartPlaylists.createRecentAdded(DEFAULT_RECENT_ADDED_DAYS)
        : await auralis.smartPlaylists.create(
            t(preset === 'recentPlayed' ? 'sidebar.recentPlayed' : 'sidebar.mostListened'),
            preset === 'recentPlayed' ? { preset, days: DEFAULT_RECENT_PLAYED_DAYS } : { preset },
          )
    await loadSidebarPlaylists()
    window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
    closeCreateMenu()
    await router.push(`/smart-playlists/${playlist.id}`)
  } catch (cause) {
    createError.value = 'sidebar.createPlaylistFailed'
    rendererDiagnostics.warn({
      scope: 'sidebar.create-playlist',
      message: 'Failed to create playback preset playlist',
      cause,
    })
  } finally {
    creatingPlaybackPreset.value = null
  }
}

async function createRegularPlaylist(): Promise<void> {
  closeCreateMenu()
  const playlist = await auralis.playlists.create()
  await loadSidebarPlaylists()
  window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
  await router.push(`/playlists/${playlist.id}`)
}

function onSmartPlaylistCreated(playlist: SmartPlaylist): void {
  void loadSidebarPlaylists()
  void router.push(`/smart-playlists/${playlist.id}`)
}

function openSmartPlaylistBuilder(): void {
  rememberSidebarModalTrigger(
    document.querySelector<HTMLElement>('.app-sidebar .smart-playlist-add-button'),
  )
  closeCreateMenu()
  isBuilderOpen.value = true
}

function openPlaylistContextMenu(item: SidebarPlaylistItem, event: MouseEvent): void {
  cancelPlaylistReorder(true)
  closeCreateMenu()
  playlistContextTrigger.value = playlistRowElement(item)
  deletingPlaylist.value = null
  deleteError.value = ''
  playlistContextMenu.value = {
    item,
    x: event.clientX,
    y: event.clientY,
  }
}

function closePlaylistContextMenu(): void {
  deletingPlaylist.value = null
  deleteError.value = ''
  playlistContextMenu.value = null
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

function movePlaylistFromMenu(direction: -1 | 1): void {
  const item = playlistContextMenu.value?.item
  if (!item || !canMovePlaylist(item, direction)) return
  closePlaylistContextMenu()
  movePlaylist(item, direction)
}

function cancelDeleteOnOtherClick(event: MouseEvent): void {
  if (!(event.target as Element).closest('[data-delete-playlist]')) {
    deletingPlaylist.value = null
    deleteError.value = ''
  }
}

async function openRenameDialog(): Promise<void> {
  if (!playlistContextMenu.value) return
  const item = playlistContextMenu.value.item
  renameSession++
  isSavingRename.value = false
  rememberSidebarModalTrigger(playlistRowElement(item))
  renamingPlaylist.value = item
  renameValue.value = item.name
  renameError.value = ''
  closePlaylistContextMenu()
  await nextTick()
  renameInput.value?.select()
}

function closeRenameDialog(): void {
  renameSession++
  isSavingRename.value = false
  renamingPlaylist.value = null
  renameError.value = ''
}

async function submitRename(): Promise<void> {
  if (!renamingPlaylist.value || isSavingRename.value) return
  if (!renameValue.value.trim()) {
    renameError.value = 'sidebar.playlistNameRequired'
    return
  }

  const item = renamingPlaylist.value
  const name = renameValue.value
  const session = renameSession
  isSavingRename.value = true
  renameError.value = ''
  try {
    const renamed =
      item.kind === 'playlist'
        ? await auralis.playlists.rename(item.id, name)
        : await auralis.smartPlaylists.rename(item.id, name)
    if (renamed) {
      window.dispatchEvent(
        new CustomEvent(
          item.kind === 'playlist'
            ? 'auralis-playlists-changed'
            : 'auralis-smart-playlists-changed',
        ),
      )
      await loadSidebarPlaylists()
    }
    if (session === renameSession) closeRenameDialog()
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'sidebar.rename-playlist',
      message: 'Failed to rename playlist',
      cause,
    })
    if (session === renameSession) renameError.value = 'sidebar.renameFailed'
  } finally {
    if (session === renameSession) isSavingRename.value = false
  }
}

async function requestDelete(): Promise<void> {
  if (!playlistContextMenu.value || isDeletingPlaylist.value) return
  const item = playlistContextMenu.value.item
  if (deletingPlaylist.value && getPlaylistKey(deletingPlaylist.value) === getPlaylistKey(item)) {
    await confirmDelete()
    return
  }
  deletingPlaylist.value = item
  deleteError.value = ''
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

async function confirmDelete(): Promise<void> {
  if (!deletingPlaylist.value || isDeletingPlaylist.value) return
  const deleting = deletingPlaylist.value
  const menu = playlistContextMenu.value
  isDeletingPlaylist.value = true
  try {
    const result =
      deleting.kind === 'playlist'
        ? await auralis.playlists.delete(deleting.id)
        : await auralis.smartPlaylists.delete(deleting.id)

    if (result.deleted) {
      playlistItems.value = playlistItems.value.filter(
        (item) => getPlaylistKey(item) !== getPlaylistKey(deleting),
      )
      window.dispatchEvent(
        new CustomEvent(
          deleting.kind === 'playlist'
            ? 'auralis-playlists-changed'
            : 'auralis-smart-playlists-changed',
        ),
      )
      if (route.path === getPlaylistPath(deleting)) {
        await router.push('/songs')
      }
    }

    if (playlistContextMenu.value === menu) closePlaylistContextMenu()
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'sidebar.delete-playlist',
      message: 'Failed to delete playlist',
      cause,
    })
    if (playlistContextMenu.value === menu) {
      deletingPlaylist.value = null
      deleteError.value = 'sidebar.deleteFailed'
    }
  } finally {
    isDeletingPlaylist.value = false
  }
}

onMounted(() => {
  deleteMotionPreference = createReducedMotionQuery()
  deleteMotionPreference.addEventListener('change', updateDeleteLid)
  void loadSidebarPlaylists()
  void loadSidebarStats()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void loadSidebarStats()
  })
  window.addEventListener('auralis-playlists-changed', onPlaylistsChanged)
})

onBeforeUnmount(() => {
  playlistPosition?.dispose()
  stopDeleteLidAnimation?.()
  deleteMotionPreference?.removeEventListener('change', updateDeleteLid)
  pendingNavCleanup?.()
  pendingNavCleanup = null
  unsubscribeLibraryChanged?.()
  unsubscribeLibraryChanged = null
  window.removeEventListener('auralis-playlists-changed', onPlaylistsChanged)
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
        <RouterLink
          v-for="item in primaryNavItems"
          :key="item.to"
          v-tooltip.right="isRail ? item.label : ''"
          :to="item.to"
          class="sidebar-link"
          :draggable="false"
          :aria-label="item.label"
          :class="{
            'sidebar-link-with-count': item.count !== null,
            'sidebar-link-active': isPrimaryNavActive(item.to),
          }"
          @dragstart.prevent
          @pointerenter="onRouteIntent(item.routeName)"
          @focusin="onRouteIntent(item.routeName)"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
        >
          <span class="sidebar-link-icon">
            <span v-if="item.icon === 'cd-case'" aria-hidden="true">
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2.5" y="2.5" width="19" height="19" rx="4" />
                <path
                  v-if="isPrimaryNavActive(item.to)"
                  d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"
                  fill="currentColor"
                  fill-rule="evenodd"
                  stroke="none"
                />
                <template v-else>
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="1.5" />
                </template>
              </svg>
            </span>
            <span v-else :class="isPrimaryNavActive(item.to) ? item.activeIcon : item.icon"></span>
          </span>
          <span class="sidebar-link-label">{{ item.label }}</span>
          <span v-if="item.count !== null" class="sidebar-link-count">{{ item.count }}</span>
        </RouterLink>
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
      <div class="sidebar-tools-grid" role="toolbar" :aria-label="t('sidebar.toolbarAria')">
        <button
          v-tooltip.right="isRail ? t('sidebar.tool.facetsPanel') : ''"
          class="sidebar-tool-button"
          type="button"
          :aria-label="t('sidebar.tool.facetsPanel')"
          @click="isFacetsDialogOpen = true"
        >
          <span class="i-ph-sliders-horizontal"></span>
        </button>
        <button
          v-tooltip.right="isRail ? t('sidebar.tool.refreshAction') : ''"
          class="sidebar-tool-button"
          type="button"
          :aria-label="
            isStartingLibraryRefresh
              ? t('sidebar.tool.refreshBusy')
              : t('sidebar.tool.refreshAction')
          "
          :disabled="isStartingLibraryRefresh"
          :aria-busy="isStartingLibraryRefresh"
          @click="refreshLibrary"
        >
          <span
            class="i-ph-arrows-clockwise"
            :class="{ 'animate-spin': isStartingLibraryRefresh }"
          ></span>
        </button>
        <button
          v-tooltip.right="isRail ? themeToggleLabel : ''"
          class="sidebar-tool-button"
          type="button"
          :aria-label="themeToggleLabel"
          @click="onToggleTheme"
        >
          <span v-if="isDark" class="i-ph-sun"></span>
          <span v-else class="i-ph-moon"></span>
        </button>
        <button
          v-tooltip.right="isRail ? t('sidebar.tool.settings') : ''"
          type="button"
          class="sidebar-tool-button"
          :class="{ 'sidebar-tool-button-active': isSettingsOpen }"
          :aria-label="t('sidebar.tool.settings')"
          aria-haspopup="dialog"
          :aria-expanded="isSettingsOpen"
          data-settings-trigger
          @pointerenter="preloadSettingsContent"
          @focusin="preloadSettingsContent"
          @click="openSettings()"
        >
          <span class="i-ph-gear"></span>
        </button>
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
                    :disabled="!!creatingPlaybackPreset"
                    :aria-busy="creatingPlaybackPreset === 'recentAdded'"
                    role="menuitem"
                    @click="createPlaybackPreset('recentAdded')"
                  >
                    <PlaylistIcon kind="recentAdded" />
                    <span>{{ t('sidebar.recentAdded') }}</span>
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
        v-if="playlistContextMenu"
        class="sidebar-overlay fixed inset-0 z-[90]"
        @click="closePlaylistContextMenu"
        @click.capture="cancelDeleteOnOtherClick"
      >
        <div
          ref="playlistContextPanel"
          class="library-context-menu frosted-context-menu fixed w-40"
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
