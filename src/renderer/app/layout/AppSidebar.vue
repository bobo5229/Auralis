<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { DEFAULT_RECENT_PLAYED_DAYS } from '@shared/smartPlaylists/recentFrequent'
import { useRoute } from 'vue-router'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import SmartPlaylistBuilderDialog from '@renderer/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue'
import { useLibraryScanStart } from '@renderer/features/library/composables/useLibraryScanStart'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { prefetchRouteOnIntent } from '../router/routeWarmup'
import type { WarmableRouteName } from '../router/routeComponentLoaders'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { useSidebarOwnedModal } from '../utils/useSidebarOwnedModal'
import { useSidebarPlaylistReorder } from '../utils/useSidebarPlaylistReorder'
import { animateTrashLid } from '@renderer/shared/animation/motion'
import PlaylistIcon from './PlaylistIcon.vue'

const route = useRoute()
const router = useRouter()
const playback = usePlayback()
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
const smartCreateTrigger = ref<HTMLButtonElement | null>(null)
const smartCreatePanel = ref<HTMLElement | null>(null)
const smartCreateSubmenu = ref(false)
const creatingPlaybackPreset = ref<'recentPlayed' | 'mostListened' | null>(null)
const createError = ref('')
const playlistContextMenu = ref<{ item: SidebarPlaylistItem; x: number; y: number } | null>(null)
const renamingPlaylist = ref<SidebarPlaylistItem | null>(null)
const deletingPlaylist = ref<SidebarPlaylistItem | null>(null)
const isDeletingPlaylist = ref(false)
const deleteError = ref('')
const deleteLid = ref<SVGGElement | null>(null)
let stopDeleteLidAnimation: (() => void) | undefined
let deleteMotionPreference: MediaQueryList | undefined

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
const renameInput = ref<HTMLInputElement | null>(null)
const renameDialogRef = ref<HTMLElement | null>(null)
const isBuilderOpen = ref(false)
const sidebarModalTrigger = ref<HTMLElement | null>(null)
let unsubscribeLibraryChanged: (() => void) | null = null
/** Cleans up optimistic nav highlight listeners when a new press starts or the component unmounts. */
let pendingNavCleanup: (() => void) | null = null

const POINTER_MOVE_TOLERANCE = 6

const { t } = useI18n()

const activePath = ref(route.path)

const primaryNav = computed<
  Array<{ to: string; label: string; icon: string; routeName?: WarmableRouteName }>
>(() => [
  { to: '/', label: t('nav.songs'), icon: 'i-ph-music-notes', routeName: 'library' },
  { to: '/albums', label: t('nav.albums'), icon: 'i-ph-vinyl-record', routeName: 'albums' },
  { to: '/albums/cd', label: t('albums.cd.title'), icon: 'i-ph-disc' },
  { to: '/archive', label: t('nav.archive'), icon: 'i-ph-archive', routeName: 'archive' },
])

function onRouteIntent(routeName?: WarmableRouteName): void {
  if (routeName) {
    void prefetchRouteOnIntent(routeName)
  }
}

const primaryNavItems = computed(() =>
  primaryNav.value.map((item) => ({
    ...item,
    count:
      item.to === '/'
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
  dropTarget,
  onPointerDown: onPlaylistPointerDown,
  shouldSuppressClick,
} = useSidebarPlaylistReorder({
  playlistItems,
  persistOrder: (items) => auralis.playlists.reorderSidebarItems(items),
  reload: () => loadSidebarPlaylists(),
})

function getPlaylistPath(item: SidebarPlaylistItem): string {
  return item.kind === 'playlist' ? `/playlists/${item.id}` : `/smart-playlists/${item.id}`
}

function getPlaylistIcon(
  item: SidebarPlaylistItem,
): 'playlist' | 'recentPlayed' | 'mostListened' | 'custom' {
  if (item.kind === 'playlist') return 'playlist'
  const kind = smartPlaylistKinds.value.get(item.id)
  return kind === 'recentPlayed' || kind === 'mostListened' ? kind : 'custom'
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
  if (shouldSuppressClick()) {
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
  if (shouldSuppressClick()) return
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
  smartCreateSubmenu.value = false
  createError.value = ''
  const rect = createPlaylistButton.value.getBoundingClientRect()
  createMenu.value = {
    x: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
    y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 184)),
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
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const buttons = Array.from(
      smartCreatePanel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    )
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    ]?.focus()
  }
}

async function createPlaybackPreset(preset: 'recentPlayed' | 'mostListened'): Promise<void> {
  if (creatingPlaybackPreset.value) return
  creatingPlaybackPreset.value = preset
  createError.value = ''
  try {
    const { playlist } = await auralis.smartPlaylists.create(
      t(preset === 'recentPlayed' ? 'sidebar.recentPlayed' : 'sidebar.mostListened'),
      preset === 'recentPlayed' ? { preset, days: DEFAULT_RECENT_PLAYED_DAYS } : { preset },
    )
    await loadSidebarPlaylists()
    window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
    closeCreateMenu()
    await router.push(`/smart-playlists/${playlist.id}`)
  } catch (cause) {
    createError.value = t('sidebar.createPlaylistFailed')
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
  deletingPlaylist.value = null
  deleteError.value = ''
  const menuWidth = 160
  const menuHeight = 82
  playlistContextMenu.value = {
    item,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closePlaylistContextMenu(): void {
  deletingPlaylist.value = null
  deleteError.value = ''
  playlistContextMenu.value = null
}

function cancelDeleteOnOtherClick(event: MouseEvent): void {
  if (!(event.target as Element).closest('[data-delete-playlist]')) {
    deletingPlaylist.value = null
    deleteError.value = ''
  }
}

function onPlaylistMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && createMenu.value) {
    closeCreateMenu()
    createPlaylistButton.value?.focus()
    return
  }
  if (event.key !== 'Escape' || !playlistContextMenu.value) return
  const item = playlistContextMenu.value.item
  closePlaylistContextMenu()
  playlistRowElement(item)?.focus()
}

async function openRenameDialog(): Promise<void> {
  if (!playlistContextMenu.value) return
  const item = playlistContextMenu.value.item
  rememberSidebarModalTrigger(playlistRowElement(item))
  renamingPlaylist.value = item
  renameValue.value = item.name
  renameError.value = ''
  closePlaylistContextMenu()
  await nextTick()
  renameInput.value?.select()
}

function closeRenameDialog(): void {
  renamingPlaylist.value = null
  renameError.value = ''
}

async function submitRename(): Promise<void> {
  if (!renamingPlaylist.value) return
  if (!renameValue.value.trim()) {
    renameError.value = t('sidebar.playlistNameRequired')
    return
  }

  const renamed =
    renamingPlaylist.value.kind === 'playlist'
      ? await auralis.playlists.rename(renamingPlaylist.value.id, renameValue.value)
      : await auralis.smartPlaylists.rename(renamingPlaylist.value.id, renameValue.value)
  if (renamed) {
    await loadSidebarPlaylists()
    window.dispatchEvent(
      new CustomEvent(
        renamingPlaylist.value.kind === 'playlist'
          ? 'auralis-playlists-changed'
          : 'auralis-smart-playlists-changed',
      ),
    )
  }
  closeRenameDialog()
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
        await router.push('/')
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
      deleteError.value = '删除失败，请重试'
    }
  } finally {
    isDeletingPlaylist.value = false
  }
}

onMounted(() => {
  deleteMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  deleteMotionPreference.addEventListener('change', updateDeleteLid)
  window.addEventListener('keydown', onPlaylistMenuKeydown)
  void loadSidebarPlaylists()
  void loadSidebarStats()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void loadSidebarStats()
  })
  window.addEventListener('auralis-playlists-changed', onPlaylistsChanged)
})

onBeforeUnmount(() => {
  stopDeleteLidAnimation?.()
  deleteMotionPreference?.removeEventListener('change', updateDeleteLid)
  window.removeEventListener('keydown', onPlaylistMenuKeydown)
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
    :class="{ 'app-sidebar--full-height': sidebarFullHeight, 'app-sidebar--collapsed': isRail }"
  >
    <header class="sidebar-header">
      <div class="sidebar-header-main">
        <component
          :is="sidebarFullHeight ? 'button' : 'div'"
          v-tooltip.right="isRail ? t('sidebar.expand') : ''"
          class="sidebar-brand-left"
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
            <span class="i-ph-waveform"></span>
          </span>
          <div class="sidebar-brand-copy">
            <div class="sidebar-brand-name">AuralisMusic</div>
          </div>
        </component>
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
          <RouterLink
            v-tooltip.right="isRail ? t('sidebar.tool.settings') : ''"
            to="/settings"
            class="sidebar-tool-button"
            :class="{ 'sidebar-tool-button-active': activePath === '/settings' }"
            :aria-label="t('sidebar.tool.settings')"
            :draggable="false"
            @dragstart.prevent
            @pointerenter="onRouteIntent('settings')"
            @focusin="onRouteIntent('settings')"
            @pointerdown="setPendingActiveFromPointer($event, '/settings')"
            @keydown.enter="setPendingActive('/settings')"
            @keydown.space="setPendingActive('/settings')"
          >
            <span class="i-ph-gear"></span>
          </RouterLink>
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
        </div>
      </div>
    </header>

    <nav
      id="sidebar-navigation"
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
            'sidebar-link-active':
              activePath === item.to ||
              (item.to === '/albums' && route.name === 'album-detail' && activePath === route.path),
          }"
          @dragstart.prevent
          @pointerenter="onRouteIntent(item.routeName)"
          @focusin="onRouteIntent(item.routeName)"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
          @keydown.space="setPendingActive(item.to)"
        >
          <span class="sidebar-link-icon">
            <span :class="item.icon"></span>
          </span>
          <span class="sidebar-link-label">{{ item.label }}</span>
          <span v-if="item.count !== null" class="sidebar-link-count">{{ item.count }}</span>
        </RouterLink>
      </section>

      <section class="sidebar-playlist-section">
        <div class="smart-playlist-section-header">
          <div class="sidebar-section-title">
            <div class="sidebar-section-label">{{ t('sidebar.playlists') }}</div>
            <div class="sidebar-section-meta">{{ playlistItems.length }}</div>
          </div>
          <button
            ref="createPlaylistButton"
            v-tooltip.right="isRail ? t('sidebar.newPlaylist') : ''"
            class="smart-playlist-add-button"
            type="button"
            :aria-label="t('sidebar.newPlaylist')"
            @click="openCreateMenu"
          >
            <span class="i-ph-plus"></span>
          </button>
        </div>
        <RouterLink
          v-for="playlist in playlistItems"
          :key="getPlaylistKey(playlist)"
          v-tooltip.right="isRail ? playlist.name : ''"
          :to="getPlaylistPath(playlist)"
          :data-sidebar-playlist-key="getPlaylistKey(playlist)"
          :draggable="false"
          class="sidebar-link"
          :aria-label="playlist.name"
          :class="{
            'sidebar-link-with-count': true,
            'sidebar-link-active': activePath === getPlaylistPath(playlist),
            'smart-playlist-link-pressed': pressedPlaylistKey === getPlaylistKey(playlist),
            'smart-playlist-link-dragging': draggingPlaylistKey === getPlaylistKey(playlist),
            'smart-playlist-drop-before':
              dropTarget?.key === getPlaylistKey(playlist) && dropTarget.position === 'before',
            'smart-playlist-drop-after':
              dropTarget?.key === getPlaylistKey(playlist) && dropTarget.position === 'after',
          }"
          @pointerdown="onPlaylistPointerDown(playlist, $event)"
          @click="onPlaylistClick($event, getPlaylistPath(playlist))"
          @dblclick="onPlaylistDoubleClick(playlist, $event)"
          @dragstart.prevent
          @keydown.enter="setPendingActive(getPlaylistPath(playlist))"
          @keydown.space="setPendingActive(getPlaylistPath(playlist))"
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
          class="sidebar-create-menu library-context-menu frosted-context-menu fixed w-48"
          :style="{
            left: `${createMenu.x}px`,
            top: `${createMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="createRegularPlaylist">
            <PlaylistIcon kind="playlist" />
            <span>{{ t('sidebar.newPlaylist') }}</span>
          </button>
          <div class="library-context-menu-separator" role="separator"></div>
          <div class="library-context-menu-submenu-root">
            <button
              ref="smartCreateTrigger"
              class="library-context-menu-item"
              type="button"
              aria-haspopup="true"
              :aria-expanded="!!smartCreateSubmenu"
              aria-controls="sidebar-smart-create-submenu"
              @click="toggleSmartCreateSubmenu"
              @keydown.right.prevent="enterSmartCreateSubmenu"
              @keydown.down.prevent="enterSmartCreateSubmenu"
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
                  @keydown="onSmartCreateSubmenuKeydown"
                >
                  <button
                    class="library-context-menu-item"
                    type="button"
                    :disabled="!!creatingPlaybackPreset"
                    :aria-busy="creatingPlaybackPreset === 'recentPlayed'"
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
                    @click="createPlaybackPreset('mostListened')"
                  >
                    <PlaylistIcon kind="mostListened" />
                    <span>{{ t('sidebar.mostListened') }}</span>
                  </button>
                  <div class="library-context-menu-separator" role="separator"></div>
                  <button
                    class="library-context-menu-item"
                    type="button"
                    @click="openSmartPlaylistBuilder"
                  >
                    <PlaylistIcon kind="custom" />
                    <span>{{ t('sidebar.customSmartPlaylist') }}</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <p v-if="createError" class="sidebar-create-error" role="alert">{{ createError }}</p>
        </div>
      </div>

      <div
        v-if="playlistContextMenu"
        class="sidebar-overlay fixed inset-0 z-[90]"
        @click="closePlaylistContextMenu"
        @click.capture="cancelDeleteOnOtherClick"
      >
        <div
          class="library-context-menu frosted-context-menu fixed w-40"
          :style="{
            left: `${playlistContextMenu.x}px`,
            top: `${playlistContextMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="openRenameDialog">
            <span class="i-ph-pencil-simple"></span>
            <span>{{ t('sidebar.rename') }}</span>
          </button>
          <div class="library-context-menu-separator" role="separator"></div>
          <button
            class="library-context-menu-item smart-playlist-context-danger"
            type="button"
            data-delete-playlist
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
            <span>{{ deletingPlaylist ? '确认删除' : t('sidebar.delete') }}</span>
          </button>
          <p v-if="deleteError" class="px-3 py-1 text-xs" role="alert">{{ deleteError }}</p>
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
          <p v-if="renameError" class="smart-playlist-dialog-error">{{ renameError }}</p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeRenameDialog">{{ t('sidebar.cancel') }}</button>
            <button type="submit" class="smart-playlist-dialog-primary">
              {{ t('sidebar.save') }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>
  </aside>
</template>
