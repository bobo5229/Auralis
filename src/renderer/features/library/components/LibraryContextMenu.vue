<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import LiquidGlassPanel from './LiquidGlassPanel.vue'
import type {
  LibraryContextMenuAnchor,
  LibraryContextMenuSource,
  LibraryViewMode,
} from '../types/libraryInteraction'
import type { LibraryPresentation } from '../types/libraryPresentation'

const props = defineProps<{
  open: boolean
  presentation: LibraryPresentation
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
  trackTitle: string
  albumTitle: string
  canLocateCurrent: boolean
  canInsert: boolean
  currentViewMode: LibraryViewMode
  playlists: SidebarPlaylistItem[]
  playlistFeedback: { playlistId: number; message: string } | null
  playlistLoading: boolean
  playlistLoadError: string | null
  creatingPlaylist: boolean
  refreshing: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'locateCurrent'): void
  (e: 'play'): void
  (e: 'insertAfterCurrent'): void
  (e: 'addToPlaylist', playlist: SidebarPlaylistItem): void
  (e: 'createPlaylist'): void
  (e: 'editMetadata'): void
  (e: 'switchView', mode: LibraryViewMode): void
  (e: 'refresh'): void
}>()

const { t } = useI18n()

const menuRef = ref<InstanceType<typeof LiquidGlassPanel> | null>(null)
const subMenuRef = ref<InstanceType<typeof LiquidGlassPanel> | null>(null)

function getPanelElement(comp: InstanceType<typeof LiquidGlassPanel> | null): HTMLElement | null {
  return comp?.getElement() ?? null
}

const menuX = ref(0)
const menuY = ref(0)
const showSubMenu = ref(false)
const subMenuFlipsLeft = ref(false)
const subMenuMaxHeight = ref<number | undefined>(undefined)

/** 子菜单延迟关闭定时器（悬停切换专用） */
let subMenuCloseTimer: ReturnType<typeof setTimeout> | undefined

/** 鼠标进入歌单主菜单或子菜单：取消延迟关闭并打开子菜单 */
function onPlaylistMenuMouseEnter(): void {
  if (subMenuCloseTimer) {
    clearTimeout(subMenuCloseTimer)
    subMenuCloseTimer = undefined
  }
  showSubMenu.value = true
}

/** 鼠标离开主菜单：短暂延迟后再关闭，避免移向子菜单时闪退 */
function onPlaylistMenuMouseLeave(): void {
  if (subMenuCloseTimer) clearTimeout(subMenuCloseTimer)
  subMenuCloseTimer = setTimeout(() => {
    showSubMenu.value = false
    subMenuCloseTimer = undefined
  }, 180)
}

const activeIndex = ref(0)
const subActiveIndex = ref(0)
const isSubMenuFocused = ref(false)

// Item indices and actions mapping for main menu
interface MenuItemDef {
  id: string
  disabled?: boolean
  hasSubMenu?: boolean
  action?: () => void
}

const menuItems = computed<MenuItemDef[]>(() => {
  const list: MenuItemDef[] = []

  list.push({
    id: 'locate',
    disabled: !props.canLocateCurrent,
    action: () => {
      emit('locateCurrent')
      emit('close')
    },
  })

  list.push({
    id: 'play',
    action: () => {
      emit('play')
      emit('close')
    },
  })

  list.push({
    id: 'insert',
    disabled: !props.canInsert,
    action: () => {
      emit('insertAfterCurrent')
      emit('close')
    },
  })

  list.push({
    id: 'playlist',
    hasSubMenu: true,
  })

  list.push({
    id: 'editMetadata',
    action: () => {
      emit('editMetadata')
      // Note: do not emit close here immediately if metadata dialog takes focus return responsibility
      emit('close')
    },
  })

  list.push({
    id: 'switchView',
    action: () => {
      const targetMode: LibraryViewMode = props.currentViewMode === 'flat' ? 'cover' : 'flat'
      emit('switchView', targetMode)
      emit('close')
    },
  })

  list.push({
    id: 'refresh',
    disabled: props.refreshing,
    action: () => {
      emit('refresh')
      emit('close')
    },
  })

  return list
})

const enabledMenuIndices = computed(() =>
  menuItems.value.map((item, idx) => (item.disabled ? -1 : idx)).filter((idx) => idx !== -1),
)

const subMenuFlipsUp = ref(false)

interface SubMenuItemDef {
  id: string
  type: 'create' | 'playlist'
  playlist?: SidebarPlaylistItem
  disabled?: boolean
  action: () => void
}

function onCreatePlaylistClick(): void {
  emit('createPlaylist')
  showSubMenu.value = false
}

function onAddToPlaylistClick(pl: SidebarPlaylistItem): void {
  emit('addToPlaylist', pl)
  showSubMenu.value = false
}

const subMenuItems = computed<SubMenuItemDef[]>(() => {
  const list: SubMenuItemDef[] = []

  list.push({
    id: 'create-playlist',
    type: 'create',
    disabled: props.creatingPlaylist,
    action: () => onCreatePlaylistClick(),
  })

  if (!props.playlistLoading && !props.playlistLoadError) {
    props.playlists.forEach((pl) => {
      list.push({
        id: `playlist-${pl.id}`,
        type: 'playlist',
        playlist: pl,
        disabled: false,
        action: () => onAddToPlaylistClick(pl),
      })
    })
  }

  return list
})

const enabledSubMenuIndices = computed(() =>
  subMenuItems.value.map((item, idx) => (item.disabled ? -1 : idx)).filter((idx) => idx !== -1),
)

function updateSubMenuGeometry(): void {
  if (!props.open || !showSubMenu.value) return

  nextTick(() => {
    const subMenuEl = getPanelElement(subMenuRef.value)
    if (!subMenuEl) return

    const margin = 8
    const parentEl = subMenuEl.parentElement
    const parentRect = parentEl?.getBoundingClientRect()

    const itemTop = parentRect ? parentRect.top : menuY.value + 110
    const itemBottom = parentRect ? parentRect.bottom : menuY.value + 142

    const spaceBelow = window.innerHeight - itemTop - margin
    const spaceAbove = itemBottom - margin

    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      subMenuFlipsUp.value = true
      subMenuMaxHeight.value = Math.max(120, Math.min(spaceAbove, window.innerHeight - margin * 2))
    } else {
      subMenuFlipsUp.value = false
      subMenuMaxHeight.value = Math.max(120, Math.min(spaceBelow, window.innerHeight - margin * 2))
    }
  })
}

function updatePosition(): void {
  if (!props.open) return

  const margin = 8
  const defaultWidth = 240
  const defaultHeight = 320

  const menuEl = getPanelElement(menuRef.value)
  const width = menuEl ? menuEl.getBoundingClientRect().width : defaultWidth
  const height = menuEl ? menuEl.getBoundingClientRect().height : defaultHeight

  const maxX = window.innerWidth - width - margin
  const maxY = window.innerHeight - height - margin

  menuX.value = Math.max(margin, Math.min(props.anchor.clientX, maxX))
  menuY.value = Math.max(margin, Math.min(props.anchor.clientY, maxY))

  // Submenu position check
  const subWidth = 220
  if (menuX.value + width + subWidth > window.innerWidth - margin) {
    subMenuFlipsLeft.value = true
  } else {
    subMenuFlipsLeft.value = false
  }

  if (showSubMenu.value) {
    updateSubMenuGeometry()
  } else {
    subMenuMaxHeight.value = Math.max(160, window.innerHeight - 32)
  }
}

watch(
  () => [
    props.open,
    showSubMenu.value,
    props.playlists.length,
    props.playlistLoading,
    props.playlistLoadError,
    props.creatingPlaylist,
  ],
  () => {
    if (props.open && showSubMenu.value) {
      updateSubMenuGeometry()
      if (!enabledSubMenuIndices.value.includes(subActiveIndex.value)) {
        subActiveIndex.value = enabledSubMenuIndices.value[0] ?? 0
        if (isSubMenuFocused.value) {
          nextTick(() => focusActiveItem())
        }
      }
    }
  },
  { immediate: true },
)

watch(
  () => [props.open, props.anchor.clientX, props.anchor.clientY],
  () => {
    if (props.open) {
      showSubMenu.value = false
      isSubMenuFocused.value = false
      activeIndex.value = enabledMenuIndices.value[0] ?? 0
      subActiveIndex.value = enabledSubMenuIndices.value[0] ?? 0

      nextTick(() => {
        updatePosition()
        focusActiveItem()
      })
    }
  },
  { immediate: true },
)

function focusActiveItem(): void {
  const menuEl = getPanelElement(menuRef.value)
  const subMenuEl = getPanelElement(subMenuRef.value)

  if (isSubMenuFocused.value && subMenuEl) {
    const items = subMenuEl.querySelectorAll<HTMLButtonElement>('[data-context-sub-item]')
    const target = items[subActiveIndex.value]
    target?.focus()
  } else if (menuEl) {
    const items = menuEl.querySelectorAll<HTMLButtonElement>('[data-context-main-item]')
    const target = items[activeIndex.value]
    target?.focus()
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (!props.open) return

  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (isSubMenuFocused.value || showSubMenu.value) {
      showSubMenu.value = false
      isSubMenuFocused.value = false
      nextTick(() => focusActiveItem())
    } else {
      emit('close')
    }
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }

  if (isSubMenuFocused.value) {
    handleSubMenuKeyDown(e)
    return
  }

  handleMainMenuKeyDown(e)
}

function handleMainMenuKeyDown(e: KeyboardEvent): void {
  const enabled = enabledMenuIndices.value
  if (enabled.length === 0) return

  const currentPos = enabled.indexOf(activeIndex.value)

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const nextPos = (currentPos + 1) % enabled.length
    activeIndex.value = enabled[nextPos]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prevPos = (currentPos - 1 + enabled.length) % enabled.length
    activeIndex.value = enabled[prevPos]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'Home') {
    e.preventDefault()
    activeIndex.value = enabled[0]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'End') {
    e.preventDefault()
    activeIndex.value = enabled[enabled.length - 1]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'ArrowRight') {
    const item = menuItems.value[activeIndex.value]
    if (item?.hasSubMenu) {
      e.preventDefault()
      showSubMenu.value = true
      isSubMenuFocused.value = true
      subActiveIndex.value = enabledSubMenuIndices.value[0] ?? 0
      nextTick(() => focusActiveItem())
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const item = menuItems.value[activeIndex.value]
    if (item?.hasSubMenu) {
      showSubMenu.value = true
      isSubMenuFocused.value = true
      subActiveIndex.value = enabledSubMenuIndices.value[0] ?? 0
      nextTick(() => focusActiveItem())
    } else if (item?.action) {
      item.action()
    }
  }
}

function handleSubMenuKeyDown(e: KeyboardEvent): void {
  const enabled = enabledSubMenuIndices.value
  if (enabled.length === 0) {
    if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      showSubMenu.value = false
      isSubMenuFocused.value = false
      nextTick(() => focusActiveItem())
    }
    return
  }

  const currentPos = enabled.indexOf(subActiveIndex.value)
  const safePos = currentPos >= 0 ? currentPos : 0

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const nextPos = (safePos + 1) % enabled.length
    subActiveIndex.value = enabled[nextPos]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prevPos = (safePos - 1 + enabled.length) % enabled.length
    subActiveIndex.value = enabled[prevPos]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'Home') {
    e.preventDefault()
    subActiveIndex.value = enabled[0]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'End') {
    e.preventDefault()
    subActiveIndex.value = enabled[enabled.length - 1]
    nextTick(() => focusActiveItem())
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    showSubMenu.value = false
    isSubMenuFocused.value = false
    nextTick(() => focusActiveItem())
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const item = subMenuItems.value[subActiveIndex.value]
    if (item && !item.disabled && item.action) {
      item.action()
    }
  }
}

function onCreatePlaylistMouseEnter(): void {
  if (props.creatingPlaylist) return
  isSubMenuFocused.value = true
  subActiveIndex.value = 0
}

function onPlaylistMouseEnter(idx: number): void {
  if (props.playlistLoading || props.playlistLoadError) return
  isSubMenuFocused.value = true
  subActiveIndex.value = idx + 1
}

function activateMainItem(index: number): void {
  const item = menuItems.value[index]
  if (!item || item.disabled) return
  item.action?.()
}

function onBackdropClick(): void {
  emit('close')
}

// Window resize listener
function onWindowResize(): void {
  if (props.open) {
    updatePosition()
  }
}

window.addEventListener('resize', onWindowResize)
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  if (subMenuCloseTimer) {
    clearTimeout(subMenuCloseTimer)
    subMenuCloseTimer = undefined
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="library-overlay"
      :data-visual-style="presentation"
      data-library-overlay="context-menu"
    >
      <div class="fixed inset-0 z-[60]" @click="onBackdropClick" @keydown="onKeyDown">
        <LiquidGlassPanel
          ref="menuRef"
          :presentation="presentation"
          class="library-context-menu-root library-context-menu-main-panel library-context-menu-panel fixed z-[61] w-58 p-1 select-none"
          :style="{ left: `${menuX}px`, top: `${menuY}px` }"
          role="menu"
          :aria-label="t('library.contextMenu.ariaLabel')"
          @click.stop
        >
          <!-- 定位当前歌曲 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :disabled="!canLocateCurrent"
            :tabindex="activeIndex === 0 ? 0 : -1"
            @click="activateMainItem(0)"
            @mouseenter="activeIndex = 0"
          >
            <span class="i-lucide-locate-fixed"></span>
            <span class="library-context-menu-text truncate">{{
              t('library.contextMenu.locateCurrent')
            }}</span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 播放曲目 / 播放专辑 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :tabindex="activeIndex === 1 ? 0 : -1"
            @click="activateMainItem(1)"
            @mouseenter="activeIndex = 1"
          >
            <span class="i-lucide-play"></span>
            <span class="library-context-menu-text truncate">
              {{
                source === 'album-artwork'
                  ? t('library.contextMenu.playAlbum', { album: albumTitle })
                  : t('library.contextMenu.playTrack', { title: trackTitle })
              }}
            </span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 插播曲目 / 插播专辑 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :disabled="!canInsert"
            :tabindex="activeIndex === 2 ? 0 : -1"
            @click="activateMainItem(2)"
            @mouseenter="activeIndex = 2"
          >
            <span class="i-lucide-corner-down-right"></span>
            <span class="library-context-menu-text truncate">
              {{
                source === 'album-artwork'
                  ? t('library.contextMenu.insertAlbum', { album: albumTitle })
                  : t('library.contextMenu.insertTrack', { title: trackTitle })
              }}
            </span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 添加到歌单 (带子菜单) -->
          <div
            class="library-context-menu-submenu-root relative"
            @mouseenter="onPlaylistMenuMouseEnter"
            @mouseleave="onPlaylistMenuMouseLeave"
          >
            <button
              class="library-context-menu-item"
              type="button"
              role="menuitem"
              data-context-main-item
              aria-haspopup="true"
              :aria-expanded="showSubMenu"
              :tabindex="activeIndex === 3 ? 0 : -1"
              @mouseenter="activeIndex = 3"
              @click="showSubMenu = !showSubMenu"
            >
              <span class="i-lucide-folder-plus"></span>
              <span class="library-context-menu-text truncate">{{
                t('library.contextMenu.addToPlaylist')
              }}</span>
              <span
                class="library-context-menu-chevron i-lucide-chevron-right"
                :class="{ 'rotate-180': subMenuFlipsLeft }"
              ></span>
            </button>

            <!-- 子菜单 -->
            <LiquidGlassPanel
              v-if="showSubMenu"
              ref="subMenuRef"
              :presentation="presentation"
              class="library-context-menu-sub-panel library-context-menu-panel absolute z-[62] w-52 p-1"
              :class="[
                subMenuFlipsLeft ? 'right-full mr-1' : 'left-full ml-1',
                subMenuFlipsUp ? 'bottom-0' : 'top-0',
              ]"
              :style="{ maxHeight: subMenuMaxHeight ? `${subMenuMaxHeight}px` : undefined }"
              role="menu"
              :aria-label="t('library.contextMenu.addToPlaylist')"
              @mouseenter="onPlaylistMenuMouseEnter"
            >
              <!-- 新建歌单 -->
              <button
                class="library-context-menu-item"
                type="button"
                role="menuitem"
                data-context-sub-item
                :disabled="creatingPlaylist"
                :tabindex="isSubMenuFocused && subActiveIndex === 0 ? 0 : -1"
                @click="onCreatePlaylistClick"
                @mouseenter="onCreatePlaylistMouseEnter"
              >
                <span class="i-lucide-plus"></span>
                <span class="library-context-menu-text truncate">{{
                  t('library.contextMenu.createPlaylist')
                }}</span>
              </button>

              <div class="library-context-menu-separator" role="separator"></div>

              <!-- 歌单列表 -->
              <div v-if="playlistLoading" class="px-3 py-2 text-xs opacity-60">
                {{ t('library.contextMenu.playlistLoading') }}
              </div>
              <div v-else-if="playlistLoadError" class="px-3 py-2 text-xs text-red-500">
                {{ t('library.contextMenu.playlistLoadError') }}
              </div>
              <div v-else-if="playlists.length === 0" class="px-3 py-2 text-xs opacity-60">
                {{ t('library.contextMenu.noPlaylists') }}
              </div>
              <template v-else>
                <button
                  v-for="(pl, idx) in playlists"
                  :key="pl.id"
                  class="library-context-menu-item"
                  type="button"
                  role="menuitem"
                  data-context-sub-item
                  :tabindex="isSubMenuFocused && subActiveIndex === idx + 1 ? 0 : -1"
                  @click="onAddToPlaylistClick(pl)"
                  @mouseenter="onPlaylistMouseEnter(idx)"
                >
                  <span class="i-lucide-list-music"></span>
                  <span class="library-context-menu-text truncate" :title="pl.name">{{
                    pl.name
                  }}</span>
                  <span
                    v-if="playlistFeedback && playlistFeedback.playlistId === pl.id"
                    class="library-context-menu-chevron text-[10px] text-green-600 font-bold"
                    aria-live="polite"
                  >
                    ✓
                  </span>
                </button>
              </template>
            </LiquidGlassPanel>
          </div>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 编辑元数据 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :tabindex="activeIndex === 4 ? 0 : -1"
            @click="activateMainItem(4)"
            @mouseenter="activeIndex = 4"
          >
            <span class="i-lucide-pencil"></span>
            <span class="library-context-menu-text truncate">{{
              t('library.contextMenu.editMetadata')
            }}</span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 切换视图 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :tabindex="activeIndex === 5 ? 0 : -1"
            @click="activateMainItem(5)"
            @mouseenter="activeIndex = 5"
          >
            <span
              :class="currentViewMode === 'flat' ? 'i-lucide-layout-grid' : 'i-lucide-list-music'"
            ></span>
            <span class="library-context-menu-text truncate">
              {{
                currentViewMode === 'flat'
                  ? t('library.contextMenu.switchToCover')
                  : t('library.contextMenu.switchToFlat')
              }}
            </span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <!-- 刷新曲库 -->
          <button
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            data-context-main-item
            :disabled="refreshing"
            :tabindex="activeIndex === 6 ? 0 : -1"
            @click="activateMainItem(6)"
            @mouseenter="activeIndex = 6"
          >
            <span class="i-lucide-refresh-cw" :class="{ 'animate-spin': refreshing }"></span>
            <span class="library-context-menu-text truncate">{{
              t('library.contextMenu.refresh')
            }}</span>
          </button>

          <!-- 歌单添加成功反馈（位于主菜单根部，子菜单关闭后依然保留并朗读） -->
          <template v-if="playlistFeedback">
            <div class="library-context-menu-separator" role="separator"></div>
            <div
              class="flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-500 font-medium select-none"
              role="status"
              aria-live="polite"
            >
              <span class="i-lucide-check text-sm shrink-0"></span>
              <span class="truncate">{{ playlistFeedback.message }}</span>
            </div>
          </template>
        </LiquidGlassPanel>
      </div>
    </div>
  </Teleport>
</template>
