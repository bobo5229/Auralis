<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const smartPlaylists = ref<SmartPlaylist[]>([])
const playlistContextMenu = ref<{ playlist: SmartPlaylist; x: number; y: number } | null>(null)
const renamingPlaylist = ref<SmartPlaylist | null>(null)
const deletingPlaylist = ref<SmartPlaylist | null>(null)
const renameValue = ref('')
const renameError = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const pressedPlaylistId = ref<number | null>(null)
const draggingPlaylistId = ref<number | null>(null)
const dropTarget = ref<{ id: number; position: 'before' | 'after' } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let pendingDrag: {
  playlistId: number
  pointerId: number
  startX: number
  startY: number
} | null = null
let suppressPlaylistClick = false

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

const utilityNav = [{ to: '/settings', label: 'Settings', icon: 'i-lucide-settings' }]

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
  pressedPlaylistId.value = null
  draggingPlaylistId.value = null
  dropTarget.value = null
}

function onPlaylistPointerDown(playlistId: number, event: PointerEvent): void {
  if (event.button !== 0) return

  resetPlaylistDrag()
  pendingDrag = {
    playlistId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  }
  pressedPlaylistId.value = playlistId
  longPressTimer = window.setTimeout(() => {
    if (!pendingDrag) return
    draggingPlaylistId.value = pendingDrag.playlistId
    suppressPlaylistClick = true
    longPressTimer = null
  }, LONG_PRESS_DELAY_MS)
}

function onPlaylistPointerMove(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return

  if (draggingPlaylistId.value === null) {
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
    ?.closest<HTMLElement>('[data-smart-playlist-id]')
  if (!element) {
    dropTarget.value = null
    return
  }

  const targetId = Number(element.dataset.smartPlaylistId)
  if (!Number.isInteger(targetId) || targetId === draggingPlaylistId.value) {
    dropTarget.value = null
    return
  }

  const bounds = element.getBoundingClientRect()
  dropTarget.value = {
    id: targetId,
    position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
  }
}

async function persistPlaylistDrop(): Promise<void> {
  const sourceId = draggingPlaylistId.value
  const target = dropTarget.value
  if (sourceId === null || !target) return

  const next = smartPlaylists.value.filter((playlist) => playlist.id !== sourceId)
  const source = smartPlaylists.value.find((playlist) => playlist.id === sourceId)
  const targetIndex = next.findIndex((playlist) => playlist.id === target.id)
  if (!source || targetIndex < 0) return

  next.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, source)
  smartPlaylists.value = next

  try {
    smartPlaylists.value = await auralis.smartPlaylists.reorder(next.map((playlist) => playlist.id))
  } catch {
    await loadSmartPlaylists()
  }
}

function onPlaylistPointerUp(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
  const wasDragging = draggingPlaylistId.value !== null
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
  const wasDragging = draggingPlaylistId.value !== null
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

async function loadSmartPlaylists(): Promise<void> {
  smartPlaylists.value = await auralis.smartPlaylists.list()
}

function onSmartPlaylistCreated(playlist: SmartPlaylist): void {
  const existingIndex = smartPlaylists.value.findIndex((item) => item.id === playlist.id)
  if (existingIndex >= 0) {
    smartPlaylists.value[existingIndex] = playlist
  } else {
    smartPlaylists.value.push(playlist)
  }

  void router.push(`/smart-playlists/${playlist.id}`)
}

function openPlaylistContextMenu(playlist: SmartPlaylist, event: MouseEvent): void {
  const menuWidth = 160
  const menuHeight = 82
  playlistContextMenu.value = {
    playlist,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closePlaylistContextMenu(): void {
  playlistContextMenu.value = null
}

async function openRenameDialog(): Promise<void> {
  if (!playlistContextMenu.value) return
  renamingPlaylist.value = playlistContextMenu.value.playlist
  renameValue.value = playlistContextMenu.value.playlist.name
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

  const renamed = await auralis.smartPlaylists.rename(renamingPlaylist.value.id, renameValue.value)
  if (renamed) {
    const index = smartPlaylists.value.findIndex((item) => item.id === renamed.id)
    if (index >= 0) smartPlaylists.value[index] = renamed
  }
  closeRenameDialog()
}

function openDeleteDialog(): void {
  if (!playlistContextMenu.value) return
  deletingPlaylist.value = playlistContextMenu.value.playlist
  closePlaylistContextMenu()
}

function closeDeleteDialog(): void {
  deletingPlaylist.value = null
}

async function confirmDelete(): Promise<void> {
  if (!deletingPlaylist.value) return
  const playlistId = deletingPlaylist.value.id
  const result = await auralis.smartPlaylists.delete(playlistId)

  if (result.deleted) {
    smartPlaylists.value = smartPlaylists.value.filter((item) => item.id !== playlistId)
    if (route.path === `/smart-playlists/${playlistId}`) {
      await router.push('/')
    }
  }

  closeDeleteDialog()
}

onMounted(() => {
  void loadSmartPlaylists()
  window.addEventListener('pointermove', onPlaylistPointerMove, { passive: false })
  window.addEventListener('pointerup', onPlaylistPointerUp)
  window.addEventListener('pointercancel', onPlaylistPointerCancel)
})

onBeforeUnmount(() => {
  resetPlaylistDrag()
  window.removeEventListener('pointermove', onPlaylistPointerMove)
  window.removeEventListener('pointerup', onPlaylistPointerUp)
  window.removeEventListener('pointercancel', onPlaylistPointerCancel)
})
</script>

<template>
  <aside class="app-sidebar">
    <div class="px-5 py-5">
      <div class="flex items-center justify-between">
        <div class="min-w-0 text-xl font-semibold tracking-0">Auralis</div>
        <div class="flex items-center gap-2">
          <button
            class="theme-toggle-button"
            type="button"
            aria-label="Facets"
            title="Facets"
            @click="isFacetsDialogOpen = true"
          >
            <span class="i-lucide-columns-3 h-4 w-4"></span>
          </button>
          <button
            ref="themeButton"
            class="theme-toggle-button"
            type="button"
            :aria-label="nextThemeLabel"
            :title="nextThemeLabel"
            :aria-disabled="isThemeTransitioning"
            @click="handleThemeToggle"
          >
            <span class="h-4 w-4" :class="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"></span>
          </button>
        </div>
      </div>
      <div class="mt-1 text-xs text-[var(--auralis-text-subtle)]">Local Music Archive</div>
    </div>

    <nav class="flex flex-1 flex-col gap-6 px-3">
      <section>
        <div class="sidebar-section-label">Library</div>
        <RouterLink
          v-for="item in primaryNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{
            'sidebar-link-active':
              activePath === item.to ||
              (item.to === '/albums' && activePath.startsWith('/albums/')),
          }"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
          @keydown.space="setPendingActive(item.to)"
        >
          <span class="inline-block h-4 w-4" :class="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </section>

      <section v-if="smartPlaylists.length > 0">
        <div class="sidebar-section-label">智能歌单</div>
        <RouterLink
          v-for="playlist in smartPlaylists"
          :key="playlist.id"
          :to="`/smart-playlists/${playlist.id}`"
          :data-smart-playlist-id="playlist.id"
          class="sidebar-link"
          :class="{
            'sidebar-link-active': activePath === `/smart-playlists/${playlist.id}`,
            'smart-playlist-link-pressed': pressedPlaylistId === playlist.id,
            'smart-playlist-link-dragging': draggingPlaylistId === playlist.id,
            'smart-playlist-drop-before':
              dropTarget?.id === playlist.id && dropTarget.position === 'before',
            'smart-playlist-drop-after':
              dropTarget?.id === playlist.id && dropTarget.position === 'after',
          }"
          @pointerdown="onPlaylistPointerDown(playlist.id, $event)"
          @click="onPlaylistClick($event, `/smart-playlists/${playlist.id}`)"
          @keydown.enter="setPendingActive(`/smart-playlists/${playlist.id}`)"
          @keydown.space="setPendingActive(`/smart-playlists/${playlist.id}`)"
          @contextmenu.prevent="openPlaylistContextMenu(playlist, $event)"
        >
          <span class="i-lucide-list-music inline-block h-4 w-4"></span>
          <span>{{ playlist.name }}</span>
        </RouterLink>
      </section>

      <section>
        <div class="sidebar-section-label">Tools</div>
        <RouterLink
          v-for="item in utilityNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{ 'sidebar-link-active': activePath === item.to }"
          @pointerdown="setPendingActiveFromPointer($event, item.to)"
          @keydown.enter="setPendingActive(item.to)"
          @keydown.space="setPendingActive(item.to)"
        >
          <span class="inline-block h-4 w-4" :class="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </section>
    </nav>
    <FacetsDialog
      :open="isFacetsDialogOpen"
      @close="isFacetsDialogOpen = false"
      @created="onSmartPlaylistCreated"
    />

    <Teleport to="body">
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
          <button class="library-context-menu-item" type="button" @click="openDeleteDialog">
            <span class="i-lucide-trash-2"></span>
            <span>删除</span>
          </button>
        </LiquidGlassPanel>
      </div>

      <div v-if="renamingPlaylist" class="smart-playlist-dialog-backdrop">
        <form class="smart-playlist-dialog" @submit.prevent="submitRename">
          <h2>重命名智能歌单</h2>
          <input
            ref="renameInput"
            v-model="renameValue"
            type="text"
            aria-label="智能歌单名称"
            @input="renameError = ''"
          />
          <p v-if="renameError" class="smart-playlist-dialog-error">{{ renameError }}</p>
          <div class="smart-playlist-dialog-actions">
            <button type="button" @click="closeRenameDialog">取消</button>
            <button type="submit" class="smart-playlist-dialog-primary">保存</button>
          </div>
        </form>
      </div>

      <div v-if="deletingPlaylist" class="smart-playlist-dialog-backdrop">
        <section class="smart-playlist-dialog" role="alertdialog" aria-modal="true">
          <h2>删除智能歌单？</h2>
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
