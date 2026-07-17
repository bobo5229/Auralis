<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { useRoute } from 'vue-router'
import { useTheme } from '@renderer/composables/useTheme'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import { auralis } from '@renderer/shared/ipc/client'

const route = useRoute()
const router = useRouter()
const { isDark, nextThemeLabel, isThemeTransitioning, toggleThemeFromElement } = useTheme()
const themeButton = ref<HTMLButtonElement>()
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
const isQueryDialogOpen = ref(false)
const smartPlaylistQuery = ref('')
const smartPlaylistQueryError = ref('')
const queryInput = ref<HTMLTextAreaElement | null>(null)
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

const LONG_PRESS_DELAY_MS = 280
const POINTER_MOVE_TOLERANCE = 6

function handleThemeToggle(): void {
  if (!themeButton.value) return
  toggleThemeFromElement(themeButton.value)
}
const activePath = ref(route.path)

const primaryNav = [
  { to: '/', label: '歌曲', icon: 'i-lucide-music' },
  { to: '/albums', label: '专辑', icon: 'i-lucide-disc-3' },
  { to: '/archive', label: '声迹', icon: 'i-lucide-archive' },
]

const primaryNavItems = computed(() =>
  primaryNav.map((item) => ({
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
  deletingPlaylist.value?.kind === 'playlist' ? '删除歌单？' : '删除智能歌单？',
)

watch(
  () => route.path,
  (path) => {
    activePath.value = path
  },
)

function setPendingActive(path: string): void {
  activePath.value = path
}

function setPendingActiveFromPointer(event: PointerEvent, path: string): void {
  if (event.button !== 0) {
    return
  }

  setPendingActive(path)
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
    smartPlaylistQueryError.value = '请输入查询语法'
    return
  }

  isCreatingFromQuery.value = true
  smartPlaylistQueryError.value = ''
  try {
    const result = await auralis.smartPlaylists.createFromQuery(smartPlaylistQuery.value)
    isQueryDialogOpen.value = false
    onSmartPlaylistCreated(result.playlist)
  } catch (error) {
    smartPlaylistQueryError.value = error instanceof Error ? error.message : '无法解析查询语法'
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
  renamingPlaylist.value = playlistContextMenu.value.item
  renameValue.value = playlistContextMenu.value.item.name
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
    renameError.value = '名称不能为空'
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
  deletingPlaylist.value = playlistContextMenu.value.item
  closePlaylistContextMenu()
}

function closeDeleteDialog(): void {
  deletingPlaylist.value = null
}

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
  <aside class="app-sidebar">
    <header class="sidebar-header">
      <div class="sidebar-brand">
        <span class="sidebar-brand-mark" aria-hidden="true">
          <span class="i-lucide-audio-waveform"></span>
        </span>
        <div class="sidebar-brand-copy">
          <div class="sidebar-brand-name">Auralis</div>
          <div class="sidebar-brand-caption">本地音乐档案</div>
        </div>
      </div>
      <div class="sidebar-tool-strip">
        <button
          class="sidebar-tool-button"
          type="button"
          aria-label="筛选面板"
          title="筛选面板"
          @click="isFacetsDialogOpen = true"
        >
          <span class="i-lucide-columns-3"></span>
        </button>
        <RouterLink
          to="/settings"
          class="sidebar-tool-button"
          :class="{ 'sidebar-tool-button-active': activePath === '/settings' }"
          aria-label="设置"
          title="设置"
          @pointerdown="setPendingActiveFromPointer($event, '/settings')"
          @keydown.enter="setPendingActive('/settings')"
          @keydown.space="setPendingActive('/settings')"
        >
          <span class="i-lucide-settings"></span>
        </RouterLink>
        <button
          ref="themeButton"
          class="sidebar-tool-button"
          type="button"
          :aria-label="nextThemeLabel"
          :title="nextThemeLabel"
          :aria-disabled="isThemeTransitioning"
          @click="handleThemeToggle"
        >
          <span :class="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"></span>
        </button>
      </div>
    </header>

    <nav class="sidebar-navigation">
      <section class="sidebar-primary-section">
        <div class="sidebar-section-label">资料库</div>
        <RouterLink
          v-for="item in primaryNavItems"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{
            'sidebar-link-with-count': item.count !== null,
            'sidebar-link-active':
              activePath === item.to ||
              (item.to === '/albums' && activePath.startsWith('/albums/')),
          }"
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
            <div class="sidebar-section-label">歌单</div>
            <div class="sidebar-section-meta">{{ playlistItems.length }}</div>
          </div>
          <button
            class="smart-playlist-add-button"
            type="button"
            title="新建歌单"
            aria-label="新建歌单"
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
          <span>暂无歌单</span>
        </div>
      </section>
    </nav>
    <FacetsDialog
      :open="isFacetsDialogOpen"
      @close="isFacetsDialogOpen = false"
      @created="onSmartPlaylistCreated"
    />

    <Teleport to="body">
      <div v-if="createMenu" class="fixed inset-0 z-[88]" @click="closeCreateMenu">
        <LiquidGlassPanel
          class="library-context-menu create-playlist-menu fixed w-48"
          :style="{
            left: `${createMenu.x}px`,
            top: `${createMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="createRegularPlaylist">
            <span class="i-lucide-list-music"></span>
            <span>新建歌单</span>
          </button>
          <button class="library-context-menu-item" type="button" @click="openQueryDialog">
            <span class="i-lucide-sparkles"></span>
            <span>新建智能歌单</span>
          </button>
        </LiquidGlassPanel>
      </div>

      <div
        v-if="playlistContextMenu"
        class="fixed inset-0 z-[90]"
        @click="closePlaylistContextMenu"
      >
        <LiquidGlassPanel
          class="library-context-menu fixed w-40"
          :style="{
            left: `${playlistContextMenu.x}px`,
            top: `${playlistContextMenu.y}px`,
          }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="openRenameDialog">
            <span class="i-lucide-pencil"></span>
            <span>重命名</span>
          </button>
          <button
            class="library-context-menu-item smart-playlist-context-danger"
            type="button"
            @click="openDeleteDialog"
          >
            <span class="i-lucide-trash-2"></span>
            <span>删除</span>
          </button>
        </LiquidGlassPanel>
      </div>

      <div v-if="renamingPlaylist" class="smart-playlist-dialog-backdrop">
        <form class="smart-playlist-dialog" @submit.prevent="submitRename">
          <h2>重命名歌单</h2>
          <input
            ref="renameInput"
            v-model="renameValue"
            type="text"
            aria-label="歌单名称"
            @input="renameError = ''"
          />
          <p v-if="renameError" class="smart-playlist-dialog-error">{{ renameError }}</p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeRenameDialog">取消</button>
            <button type="submit" class="smart-playlist-dialog-primary">保存</button>
          </div>
        </form>
      </div>

      <div v-if="isQueryDialogOpen" class="smart-playlist-dialog-backdrop">
        <form
          class="smart-playlist-dialog smart-playlist-query-dialog"
          @submit.prevent="createFromQuery"
        >
          <h2>创建智能歌单</h2>
          <textarea
            ref="queryInput"
            v-model="smartPlaylistQuery"
            rows="4"
            aria-label="智能歌单查询语法"
            placeholder='GENRE HAS "K-Pop" AND ARTIST HAS "aespa" OR "NMIXX"'
            spellcheck="false"
            @input="smartPlaylistQueryError = ''"
          ></textarea>
          <p v-if="smartPlaylistQueryError" class="smart-playlist-dialog-error">
            {{ smartPlaylistQueryError }}
          </p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" :disabled="isCreatingFromQuery" @click="closeQueryDialog">
              取消
            </button>
            <button
              type="submit"
              class="smart-playlist-dialog-primary"
              :disabled="isCreatingFromQuery"
            >
              创建
            </button>
          </div>
        </form>
      </div>

      <div v-if="deletingPlaylist" class="smart-playlist-dialog-backdrop">
        <section class="smart-playlist-dialog" role="alertdialog" aria-modal="true">
          <h2>{{ deletingPlaylistTitle }}</h2>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeDeleteDialog">取消</button>
            <button type="button" class="smart-playlist-dialog-danger" @click="confirmDelete">
              删除
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </aside>
</template>
