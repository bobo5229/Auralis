<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { useRoute } from 'vue-router'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { ShellPresentation } from '../utils/shellPresentation'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { useSidebarOwnedModal } from '../utils/useSidebarOwnedModal'
import '../styles/manuscript.sidebar.css'
import '../styles/manuscript.sidebar-overlays.css'

defineProps<{
  presentation: ShellPresentation
}>()

const route = useRoute()
const router = useRouter()
const playback = usePlayback()
const { enterMiniPlayer } = usePlayerDisplayMode()
const isFacetsDialogOpen = ref(false)
const playlistItems = ref<SidebarPlaylistItem[]>([])
const libraryStats = ref<LibraryStats>({ trackCount: 0, albumCount: 0 })
const createMenu = ref<{ x: number; y: number } | null>(null)
const playlistContextMenu = ref<{ item: SidebarPlaylistItem; x: number; y: number } | null>(null)
const renamingPlaylist = ref<SidebarPlaylistItem | null>(null)
const deletingPlaylist = ref<SidebarPlaylistItem | null>(null)
const renameValue = ref('')
const renameError = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const renameDialogRef = ref<HTMLElement | null>(null)
const isQueryDialogOpen = ref(false)
const smartPlaylistQuery = ref('')
const smartPlaylistQueryError = ref('')
const queryInput = ref<HTMLTextAreaElement | null>(null)
const queryDialogRef = ref<HTMLElement | null>(null)
const deleteDialogRef = ref<HTMLElement | null>(null)
const sidebarModalTrigger = ref<HTMLElement | null>(null)
const isCreatingFromQuery = ref(false)
const pressedPlaylistKey = ref<string | null>(null)
const draggingPlaylistKey = ref<string | null>(null)
const dropTarget = ref<{ key: string; position: 'before' | 'after' } | null>(null)
let longPressTimer: number | null = null
let pendingDrag: {
  playlistKey: string
  pointerId: number
  startX: number
  startY: number
} | null = null
let suppressPlaylistClick = false
let unsubscribeLibraryChanged: (() => void) | null = null
/** Cleans up optimistic nav highlight listeners when a new press starts or the component unmounts. */
let pendingNavCleanup: (() => void) | null = null

const LONG_PRESS_DELAY_MS = 280
const POINTER_MOVE_TOLERANCE = 6

const { t } = useI18n()

const activePath = ref(route.path)

const primaryNav = computed(() => [
  { to: '/', label: t('nav.songs'), icon: 'i-lucide-music' },
  { to: '/albums', label: t('nav.albums'), icon: 'i-lucide-disc-3' },
  { to: '/archive', label: t('nav.archive'), icon: 'i-lucide-archive' },
])

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

function getPlaylistPath(item: SidebarPlaylistItem): string {
  return item.kind === 'playlist' ? `/playlists/${item.id}` : `/smart-playlists/${item.id}`
}

function getPlaylistIcon(item: SidebarPlaylistItem): string {
  return item.kind === 'playlist' ? 'i-lucide-list-music' : 'i-lucide-sparkles'
}

const deletingPlaylistTitle = computed(() =>
  deletingPlaylist.value?.kind === 'playlist'
    ? t('sidebar.deletePlaylistTitle')
    : t('sidebar.deleteSmartPlaylistTitle'),
)

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

function clearLongPressTimer(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function resetPlaylistDrag(): void {
  clearLongPressTimer()
  pendingDrag = null
  pressedPlaylistKey.value = null
  draggingPlaylistKey.value = null
  dropTarget.value = null
}

function onPlaylistPointerDown(item: SidebarPlaylistItem, event: PointerEvent): void {
  if (event.button !== 0) return

  resetPlaylistDrag()
  const playlistKey = getPlaylistKey(item)
  pendingDrag = {
    playlistKey,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  }
  pressedPlaylistKey.value = playlistKey
  longPressTimer = window.setTimeout(() => {
    if (!pendingDrag) return
    draggingPlaylistKey.value = pendingDrag.playlistKey
    suppressPlaylistClick = true
    longPressTimer = null
  }, LONG_PRESS_DELAY_MS)
}

function onPlaylistPointerMove(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return

  if (draggingPlaylistKey.value === null) {
    const distance = Math.hypot(
      event.clientX - pendingDrag.startX,
      event.clientY - pendingDrag.startY,
    )
    if (distance > POINTER_MOVE_TOLERANCE) {
      resetPlaylistDrag()
    }
    return
  }

  event.preventDefault()
  const element = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-sidebar-playlist-key]')
  if (!element) {
    dropTarget.value = null
    return
  }

  const targetKey = element.dataset.sidebarPlaylistKey
  if (!targetKey || targetKey === draggingPlaylistKey.value) {
    dropTarget.value = null
    return
  }

  const bounds = element.getBoundingClientRect()
  dropTarget.value = {
    key: targetKey,
    position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
  }
}

async function persistPlaylistDrop(): Promise<void> {
  const sourceKey = draggingPlaylistKey.value
  const target = dropTarget.value
  if (sourceKey === null || !target) return

  const next = playlistItems.value.filter((item) => getPlaylistKey(item) !== sourceKey)
  const source = playlistItems.value.find((item) => getPlaylistKey(item) === sourceKey)
  const targetIndex = next.findIndex((item) => getPlaylistKey(item) === target.key)
  if (!source || targetIndex < 0) return

  next.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, source)
  playlistItems.value = next

  try {
    playlistItems.value = await auralis.playlists.reorderSidebarItems(
      next.map((item) => ({ kind: item.kind, id: item.id })),
    )
  } catch {
    await loadSidebarPlaylists()
  }
}

function onPlaylistPointerUp(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
  const wasDragging = draggingPlaylistKey.value !== null
  if (wasDragging) void persistPlaylistDrop()
  resetPlaylistDrag()

  if (wasDragging) {
    window.setTimeout(() => {
      suppressPlaylistClick = false
    })
  }
}

function onPlaylistPointerCancel(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
  const wasDragging = draggingPlaylistKey.value !== null
  resetPlaylistDrag()
  if (wasDragging) {
    window.setTimeout(() => {
      suppressPlaylistClick = false
    })
  }
}

function onPlaylistClick(event: MouseEvent, path: string): void {
  if (suppressPlaylistClick) {
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
  if (suppressPlaylistClick || draggingPlaylistKey.value !== null) return
  void playRandomPlaylistTrack(item)
}

async function loadSidebarPlaylists(): Promise<void> {
  playlistItems.value = await auralis.playlists.listSidebarItems()
}

async function loadSidebarStats(): Promise<void> {
  const [stats, items] = await Promise.all([
    auralis.library.getStats(),
    auralis.playlists.listSidebarItems(),
  ])
  libraryStats.value = stats
  playlistItems.value = items
}

function openCreateMenu(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  createMenu.value = {
    x: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
    y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 124)),
  }
}

function closeCreateMenu(): void {
  createMenu.value = null
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

async function openQueryDialog(): Promise<void> {
  rememberSidebarModalTrigger(
    document.querySelector<HTMLElement>('.app-sidebar .smart-playlist-add-button'),
  )
  closeCreateMenu()
  smartPlaylistQuery.value = ''
  smartPlaylistQueryError.value = ''
  isQueryDialogOpen.value = true
  await nextTick()
  queryInput.value?.focus()
}

function closeQueryDialog(): void {
  if (isCreatingFromQuery.value) return
  isQueryDialogOpen.value = false
  smartPlaylistQueryError.value = ''
}

async function createFromQuery(): Promise<void> {
  if (!smartPlaylistQuery.value.trim()) {
    smartPlaylistQueryError.value = t('sidebar.queryRequired')
    return
  }

  isCreatingFromQuery.value = true
  smartPlaylistQueryError.value = ''
  try {
    const result = await auralis.smartPlaylists.createFromQuery(smartPlaylistQuery.value)
    isQueryDialogOpen.value = false
    onSmartPlaylistCreated(result.playlist)
  } catch (error) {
    rendererDiagnostics.error({
      scope: 'sidebar.smart-playlist',
      message: 'Failed to create a smart playlist from query',
      cause: error,
    })
    smartPlaylistQueryError.value = t('sidebar.queryParseFailed')
  } finally {
    isCreatingFromQuery.value = false
  }
}

function openPlaylistContextMenu(item: SidebarPlaylistItem, event: MouseEvent): void {
  const menuWidth = 160
  const menuHeight = 82
  playlistContextMenu.value = {
    item,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closePlaylistContextMenu(): void {
  playlistContextMenu.value = null
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

function openDeleteDialog(): void {
  if (!playlistContextMenu.value) return
  const item = playlistContextMenu.value.item
  rememberSidebarModalTrigger(playlistRowElement(item))
  deletingPlaylist.value = item
  closePlaylistContextMenu()
  void nextTick(() => {
    deleteDialogRef.value?.querySelector<HTMLElement>('button')?.focus()
  })
}

function closeDeleteDialog(): void {
  deletingPlaylist.value = null
}

useSidebarOwnedModal({
  isOpen: () => renamingPlaylist.value !== null,
  container: renameDialogRef,
  trigger: sidebarModalTrigger,
  onEscape: closeRenameDialog,
})
useSidebarOwnedModal({
  isOpen: () => isQueryDialogOpen.value,
  container: queryDialogRef,
  trigger: sidebarModalTrigger,
  canDismiss: () => !isCreatingFromQuery.value,
  onEscape: closeQueryDialog,
})
useSidebarOwnedModal({
  isOpen: () => deletingPlaylist.value !== null,
  container: deleteDialogRef,
  trigger: sidebarModalTrigger,
  onEscape: closeDeleteDialog,
})

function onPlaylistsChanged(): void {
  void loadSidebarStats()
}

async function confirmDelete(): Promise<void> {
  if (!deletingPlaylist.value) return
  const deleting = deletingPlaylist.value
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

  closeDeleteDialog()
}

onMounted(() => {
  void loadSidebarPlaylists()
  void loadSidebarStats()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void loadSidebarStats()
  })
  window.addEventListener('auralis-playlists-changed', onPlaylistsChanged)
  window.addEventListener('pointermove', onPlaylistPointerMove, { passive: false })
  window.addEventListener('pointerup', onPlaylistPointerUp)
  window.addEventListener('pointercancel', onPlaylistPointerCancel)
})

onBeforeUnmount(() => {
  pendingNavCleanup?.()
  pendingNavCleanup = null
  resetPlaylistDrag()
  unsubscribeLibraryChanged?.()
  unsubscribeLibraryChanged = null
  window.removeEventListener('auralis-playlists-changed', onPlaylistsChanged)
  window.removeEventListener('pointermove', onPlaylistPointerMove)
  window.removeEventListener('pointerup', onPlaylistPointerUp)
  window.removeEventListener('pointercancel', onPlaylistPointerCancel)
})
</script>

<template>
  <aside class="app-sidebar" :data-shell-presentation="presentation">
    <header class="sidebar-header">
      <div class="sidebar-header-main">
        <div class="sidebar-brand-left">
          <span class="sidebar-brand-mark" aria-hidden="true">
            <span class="i-lucide-audio-waveform"></span>
          </span>
          <div class="sidebar-brand-copy">
            <div class="sidebar-brand-name">AuralisMusic</div>
          </div>
        </div>
        <div class="sidebar-tools-grid" role="toolbar" :aria-label="t('sidebar.toolbarAria')">
          <button
            class="sidebar-tool-button"
            type="button"
            :aria-label="t('sidebar.tool.facetsPanel')"
            :title="t('sidebar.tool.facets')"
            @click="isFacetsDialogOpen = true"
          >
            <span class="i-lucide-list-filter"></span>
          </button>
          <button
            class="sidebar-tool-button"
            type="button"
            :aria-label="t('sidebar.tool.miniPlayerAction')"
            :title="t('sidebar.tool.miniPlayer')"
            @click="enterMiniPlayer"
          >
            <span class="i-lucide-panel-top-close"></span>
          </button>
          <RouterLink
            to="/settings"
            class="sidebar-tool-button"
            :class="{ 'sidebar-tool-button-active': activePath === '/settings' }"
            :aria-label="t('sidebar.tool.settings')"
            :title="t('sidebar.tool.settings')"
            :draggable="false"
            @dragstart.prevent
            @pointerdown="setPendingActiveFromPointer($event, '/settings')"
            @keydown.enter="setPendingActive('/settings')"
            @keydown.space="setPendingActive('/settings')"
          >
            <span class="i-lucide-settings"></span>
          </RouterLink>
        </div>
      </div>
    </header>

    <nav class="sidebar-navigation">
      <section class="sidebar-primary-section">
        <div class="sidebar-section-label">{{ t('sidebar.library') }}</div>
        <RouterLink
          v-for="item in primaryNavItems"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :draggable="false"
          :class="{
            'sidebar-link-with-count': item.count !== null,
            'sidebar-link-active':
              activePath === item.to ||
              (item.to === '/albums' && activePath.startsWith('/albums/')),
          }"
          @dragstart.prevent
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
            class="smart-playlist-add-button"
            type="button"
            :title="t('sidebar.newPlaylist')"
            :aria-label="t('sidebar.newPlaylist')"
            @click="openCreateMenu"
          >
            <span class="i-lucide-plus"></span>
          </button>
        </div>
        <RouterLink
          v-for="playlist in playlistItems"
          :key="getPlaylistKey(playlist)"
          :to="getPlaylistPath(playlist)"
          :data-sidebar-playlist-key="getPlaylistKey(playlist)"
          :draggable="false"
          class="sidebar-link"
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
            <span :class="getPlaylistIcon(playlist)"></span>
          </span>
          <span class="sidebar-link-label">{{ playlist.name }}</span>
          <span class="sidebar-link-count">{{ playlist.trackCount }}</span>
        </RouterLink>
        <div v-if="playlistItems.length === 0" class="smart-playlist-empty">
          <span class="i-lucide-sparkles"></span>
          <span>{{ t('sidebar.playlistsEmpty') }}</span>
        </div>
      </section>
    </nav>
    <FacetsDialog
      :open="isFacetsDialogOpen"
      :presentation="presentation"
      @close="isFacetsDialogOpen = false"
      @created="onSmartPlaylistCreated"
    />

    <Teleport to="body">
      <div
        v-if="createMenu"
        class="sidebar-overlay fixed inset-0 z-[88]"
        :data-shell-presentation="presentation"
        @click="closeCreateMenu"
      >
        <LiquidGlassPanel
          class="library-context-menu create-playlist-menu fixed w-48"
          :presentation="presentation"
          :style="{
            left: `${createMenu.x}px`,
            top: `${createMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="createRegularPlaylist">
            <span class="i-lucide-list-music"></span>
            <span>{{ t('sidebar.newPlaylist') }}</span>
          </button>
          <button class="library-context-menu-item" type="button" @click="openQueryDialog">
            <span class="i-lucide-sparkles"></span>
            <span>{{ t('sidebar.newSmartPlaylist') }}</span>
          </button>
        </LiquidGlassPanel>
      </div>

      <div
        v-if="playlistContextMenu"
        class="sidebar-overlay fixed inset-0 z-[90]"
        :data-shell-presentation="presentation"
        @click="closePlaylistContextMenu"
      >
        <LiquidGlassPanel
          class="library-context-menu fixed w-40"
          :presentation="presentation"
          :style="{
            left: `${playlistContextMenu.x}px`,
            top: `${playlistContextMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="openRenameDialog">
            <span class="i-lucide-pencil"></span>
            <span>{{ t('sidebar.rename') }}</span>
          </button>
          <button
            class="library-context-menu-item smart-playlist-context-danger"
            type="button"
            @click="openDeleteDialog"
          >
            <span class="i-lucide-trash-2"></span>
            <span>{{ t('sidebar.delete') }}</span>
          </button>
        </LiquidGlassPanel>
      </div>

      <div
        v-if="renamingPlaylist"
        class="sidebar-overlay smart-playlist-dialog-backdrop"
        :data-shell-presentation="presentation"
      >
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

      <div
        v-if="isQueryDialogOpen"
        class="sidebar-overlay smart-playlist-dialog-backdrop"
        :data-shell-presentation="presentation"
      >
        <form
          ref="queryDialogRef"
          class="smart-playlist-dialog smart-playlist-query-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('sidebar.queryDialogTitle')"
          @submit.prevent="createFromQuery"
        >
          <h2>{{ t('sidebar.queryDialogTitle') }}</h2>
          <textarea
            ref="queryInput"
            v-model="smartPlaylistQuery"
            rows="4"
            :aria-label="t('sidebar.queryAria')"
            placeholder='GENRE HAS "K-Pop" AND ARTIST HAS "aespa" OR "NMIXX"'
            spellcheck="false"
            @input="smartPlaylistQueryError = ''"
          ></textarea>
          <p v-if="smartPlaylistQueryError" class="smart-playlist-dialog-error">
            {{ smartPlaylistQueryError }}
          </p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" :disabled="isCreatingFromQuery" @click="closeQueryDialog">
              {{ t('sidebar.cancel') }}
            </button>
            <button
              type="submit"
              class="smart-playlist-dialog-primary"
              :disabled="isCreatingFromQuery"
            >
              {{ t('sidebar.create') }}
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="deletingPlaylist"
        class="sidebar-overlay smart-playlist-dialog-backdrop"
        :data-shell-presentation="presentation"
      >
        <section
          ref="deleteDialogRef"
          class="smart-playlist-dialog"
          role="alertdialog"
          aria-modal="true"
          :aria-label="deletingPlaylistTitle"
        >
          <h2>{{ deletingPlaylistTitle }}</h2>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeDeleteDialog">{{ t('sidebar.cancel') }}</button>
            <button type="button" class="smart-playlist-dialog-danger" @click="confirmDelete">
              {{ t('sidebar.delete') }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </aside>
</template>
