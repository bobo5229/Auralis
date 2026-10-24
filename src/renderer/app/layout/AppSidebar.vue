<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { MAX_RECENT_ADDED_LIBRARY_DAYS } from '@renderer/features/library/utils/recentAddedLibrary'
import FacetsDialog from '@renderer/features/facets/components/FacetsDialog.vue'
import SmartPlaylistBuilderDialog from '@renderer/features/smartPlaylists/components/SmartPlaylistBuilderDialog.vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import {
  SIDEBAR_WIDTH,
  useSidebarLayout,
} from '@renderer/features/appearance/composables/useSidebarLayout'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { useTheme } from '@renderer/composables/useTheme'
import { preloadSettingsContent } from '@renderer/features/settings/utils/settingsContentLoader'
import { auralis } from '@renderer/shared/ipc/client'
import { useSidebarPlaylistActions } from '../composables/useSidebarPlaylistActions'
import { useSidebarLibraryStatus } from '../composables/useSidebarLibraryStatus'
import { useSidebarResize } from '../composables/useSidebarResize'
import { useSidebarLibraryData } from '../composables/useSidebarLibraryData'
import { useSidebarFlavorLabel } from '../composables/useSidebarFlavorLabel'
import { useSidebarNavigation } from '../composables/useSidebarNavigation'
import { useSidebarRecentAddedRange } from '../composables/useSidebarRecentAddedRange'
import { useSidebarPlaylistMenus } from '../composables/useSidebarPlaylistMenus'
import { useSidebarPlaylistInteractions } from '../composables/useSidebarPlaylistInteractions'
import { onMenuKeydown } from '../utils/sidebarMenuKeyboard'
import { useSidebarPlaylistReorder } from '../utils/useSidebarPlaylistReorder'
import PlaylistIcon from './PlaylistIcon.vue'
import SidebarIcon from '@renderer/shared/components/SidebarIcon.vue'
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
const { isDark, toggleTheme } = useTheme()
const themeToggleLabel = computed(() =>
  t(isDark.value ? 'sidebar.tool.switchToLightTheme' : 'sidebar.tool.switchToDarkTheme'),
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
const { playlistItems, libraryStats, loadSidebarPlaylists, getPlaylistIcon } =
  useSidebarLibraryData(auralis)
const sidebarNavigation = ref<HTMLElement | null>(null)
const sidebarPlaylistSection = ref<HTMLElement | null>(null)
const albumMenuOpen = ref(false)
const {
  isFlavorHovered,
  isFlavorFocused,
  flavorLabel,
  flavorLabelRef,
  flavorTextRef,
  isFlavorOverflowing,
  flavorMarqueeStyle,
} = useSidebarFlavorLabel({ isRail, libraryStats, t })
const {
  activePath,
  primaryNavItems,
  isPrimaryNavActive,
  onRouteIntent,
  setPendingActive,
  setPendingActiveFromPointer,
} = useSidebarNavigation({ route, libraryStats, t })
const {
  recentAddedContextMenu,
  recentAddedContextPanel,
  recentAddedRangeSelectorOpen,
  recentAddedRangeSelectorPanel,
  recentAddedRangeOptions,
  recentAddedRangeSliderValue,
  recentAddedRangeSliderFill,
  selectedRecentAddedRange,
  customRecentAddedDays,
  getPrimaryNavTarget,
  onRecentAddedContextMenuKeydown,
  closeRecentAddedContextMenu,
  openRecentAddedRangeSelector,
  selectRecentAddedRangeBySlider,
  commitRecentAddedRangeBySlider,
  applyCustomRecentAddedRange,
  onPrimaryNavContextMenu,
  onPrimaryNavKeydown,
} = useSidebarRecentAddedRange({
  route,
  router,
  onBeforeOpen() {
    closeCreateMenu()
    closePlaylistContextMenu()
  },
})
const playlistActions = useSidebarPlaylistActions({
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
const {
  createPlaylistButton,
  createMenu,
  smartCreateTrigger,
  smartCreatePanel,
  smartCreateSubmenu,
  creatingPlaybackPreset,
  createError,
  creatingRegularPlaylist,
  playlistContextMenu,
  playlistContextHasPrevious,
  playlistContextHasNext,
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
} = playlistActions
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
function getPlaylistKey(item: { kind: string; id: number }): string {
  return `${item.kind}:${item.id}`
}
function getPlaylistPath(item: SidebarPlaylistItem): string {
  return item.kind === 'playlist' ? `/playlists/${item.id}` : `/smart-playlists/${item.id}`
}
const { onPlaylistClick, onPlaylistDoubleClick, onPlaylistKeydown } =
  useSidebarPlaylistInteractions({
    api: auralis,
    playback,
    shouldSuppressClick,
    setPendingActive,
    cancelPlaylistReorder,
    movePlaylist,
    openPlaylistContextMenu,
    getPlaylistPath,
  })
const { createMenuPanel, playlistContextPanel, deleteLid, renameDialogRef } =
  useSidebarPlaylistMenus(playlistActions)
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
            v-tooltip.fast="themeToggleLabel"
            type="button"
            class="sidebar-tool-button"
            :aria-label="themeToggleLabel"
            data-theme-toggle
            @click="toggleTheme()"
          >
            <SidebarIcon :kind="isDark ? 'sun' : 'moon'" />
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
            :disabled="creatingRegularPlaylist"
            :aria-busy="creatingRegularPlaylist"
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
