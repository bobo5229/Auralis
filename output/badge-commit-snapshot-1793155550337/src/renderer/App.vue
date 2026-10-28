<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import './app/styles/cdCanvasTransition.css'
import { useStartupAlbum } from './features/startupAlbum/useStartupAlbum'
import AppSidebar from './app/layout/AppSidebar.vue'
import WindowTrafficLights from '@renderer/shared/components/WindowTrafficLights.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import SettingsDialog from '@renderer/features/settings/components/SettingsDialog.vue'
import LyricsEditPanel from '@renderer/features/lyrics/components/LyricsEditPanel.vue'
import PageParameterPanel from './app/layout/PageParameterPanel.vue'
import CdViewSwitch from './features/albums/components/CdViewSwitch.vue'
import { provideCdViewSwitchVisibility } from './features/albums/composables/useCdViewSwitchVisibility'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useAppOverlays } from './app/composables/useAppOverlays'
import { useAppShellLayout } from './app/composables/useAppShellLayout'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'

const {
  active: startupAlbumActive,
  presentation: startupAlbumPresentation,
  overlay: startupAlbumOverlay,
  shown: startupAlbumShown,
  close: closeStartupAlbum,
} = useStartupAlbum()
const route = useRoute()
const { cdCanvasTheme } = useCdCanvasTheme()
const cdBrowseViewSwitchVisible = provideCdViewSwitchVisibility()
const cdViewSwitchRef = ref<InstanceType<typeof CdViewSwitch> | null>(null)
useSystemMediaIntegration()
const { displayMode } = usePlayerDisplayMode()
const { sidebarCollapsed } = useSidebarLayout()

const {
  isSettingsOpen,
  isLyricsEditOpen,
  lyricsEditPanelRef,
  lyricsEditReturnFocus,
  openLyricsEditPanel,
  pageParameters,
} = useAppOverlays(route, displayMode, startupAlbumActive)
const shellRef = ref<HTMLElement | null>(null)
const mainRef = ref<HTMLElement | null>(null)
const nowPlayingPanelRef = ref<InstanceType<typeof NowPlayingPanel> | null>(null)
const {
  shellStyle,
  isAlbumDetail,
  isCdCanvas,
  sidebarFullHeight,
  renderedSidebarRail,
  isFloatingLyrics,
  isLyricsCollapsed,
  isLyricsResizing,
  isSidebarResizing,
  isLyricsWidthResizing,
  isAlbumLayoutTransitioning,
  maxSidebarWidth,
  onSidebarResizeActiveChange,
  setActiveAlbumsPage,
  settleAlbumLyricsTransition,
  shouldMountLyrics,
  isLyricsInteractive,
  lyricsTargetWidthPx,
  maxLyricsPanelWidth,
  lyricsWidthResizeDisabled,
  isLyricsWidthDragging,
  onLyricsWidthPointerDown,
  onLyricsWidthKeyDown,
  resetLyricsWidth,
  cdIndexSlideDirection,
  isAlbumDetailEntering,
  isAlbumRouteTransitioning,
  albumDetailTransitionHooks,
  transitionName,
  onTransitionBeforeEnter,
  onTransitionEnter,
  onTransitionBeforeLeave,
  restoreLeavingInteractivity,
  onTransitionAfterEnter,
  onTransitionEnterCancelled,
} = useAppShellLayout({
  route,
  router,
  shellRef,
  mainRef,
  displayMode,
  isSettingsOpen,
  isLyricsEditOpen,
  startupAlbumActive,
  pageParameters,
  prepareForDisplay: () => nowPlayingPanelRef.value?.prepareForDisplay(),
  syncCdViewSwitch: () => cdViewSwitchRef.value?.syncToCurrent(true),
})
</script>

<template>
  <div
    class="app-window"
    :inert="displayMode === 'fullscreen'"
    :class="{
      'is-cd-albums': isCdCanvas,
      'is-cd-albums-dark': isCdCanvas && cdCanvasTheme === 'dark',
      'is-sidebar-floating': !sidebarFullHeight && !isCdCanvas,
    }"
    data-app-shell-root
  >
    <div
      ref="shellRef"
      class="app-shell relative"
      :class="{
        'is-album-detail': isAlbumDetail,
        'is-cd-albums': isCdCanvas,
        'is-cd-albums-dark': isCdCanvas && cdCanvasTheme === 'dark',
        'is-sidebar-collapsed': renderedSidebarRail,
        'is-lyrics-collapsed': isLyricsCollapsed,
        'is-lyrics-floating': isFloatingLyrics,
        'is-lyrics-resizing': isLyricsResizing,
        'is-sidebar-resizing': isSidebarResizing,
        'is-lyrics-width-resizing': isLyricsWidthResizing,
        'is-album-layout-transitioning': isAlbumLayoutTransitioning,
      }"
      :style="shellStyle"
    >
      <div
        class="shell-drag-region"
        :class="{ 'shell-drag-region--cd': isCdCanvas }"
        aria-hidden="true"
      />
      <WindowTrafficLights
        :cd-canvas="isCdCanvas"
        :sidebar-full-height="sidebarFullHeight"
        :sidebar-collapsed="sidebarCollapsed"
      />

      <AppSidebar
        v-if="!isCdCanvas"
        class="relative z-10"
        :max-width="maxSidebarWidth"
        :resize-disabled="
          isLyricsResizing ||
          isLyricsWidthResizing ||
          isAlbumRouteTransitioning ||
          displayMode !== 'normal'
        "
        @resize-active-change="onSidebarResizeActiveChange"
      />

      <main
        ref="mainRef"
        class="app-main relative z-10"
        tabindex="-1"
        :inert="isAlbumRouteTransitioning"
      >
        <CdViewSwitch
          v-if="isCdCanvas"
          v-show="route.name === 'cd-album-index' || cdBrowseViewSwitchVisible"
          ref="cdViewSwitchRef"
          :current="route.name === 'cd-album-index' ? 'index' : 'browse'"
          :transitioning="cdIndexSlideDirection !== null"
        />
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition
            :name="transitionName ?? undefined"
            :css="transitionName !== null && !isAlbumDetailEntering"
            v-bind="albumDetailTransitionHooks"
            @before-enter="onTransitionBeforeEnter"
            @enter="onTransitionEnter"
            @before-leave="onTransitionBeforeLeave"
            @after-leave="restoreLeavingInteractivity"
            @leave-cancelled="restoreLeavingInteractivity"
            @after-enter="onTransitionAfterEnter"
            @enter-cancelled="onTransitionEnterCancelled"
          >
            <KeepAlive include="AlbumsPage" :max="1">
              <component
                :is="Component"
                :key="String(viewRoute.name)"
                :ref="viewRoute.name === 'albums' ? setActiveAlbumsPage : undefined"
                v-bind="
                  viewRoute.name === 'album-detail'
                    ? { isEntering: isAlbumDetailEntering }
                    : viewRoute.name === 'albums'
                      ? {
                          isTransitioning: isAlbumRouteTransitioning,
                          isLayoutResizing:
                            isLyricsResizing || isSidebarResizing || isLyricsWidthResizing,
                        }
                      : {}
                "
                @cancel-layout-transition="settleAlbumLyricsTransition"
              />
            </KeepAlive>
          </Transition>
        </RouterView>
        <PageParameterPanel :controller="pageParameters" />
      </main>

      <NowPlayingPanel
        v-if="!isCdCanvas"
        ref="nowPlayingPanelRef"
        class="relative z-10"
        :should-mount-lyrics="shouldMountLyrics"
        :is-collapsed="isLyricsCollapsed"
        :is-interactive="isLyricsInteractive"
        :target-width-px="lyricsTargetWidthPx"
        :max-width-px="maxLyricsPanelWidth"
        :resize-disabled="lyricsWidthResizeDisabled"
        :is-width-resizing="isLyricsWidthResizing"
        :is-width-dragging="isLyricsWidthDragging"
        @resize-pointer-down="onLyricsWidthPointerDown"
        @resize-key-down="onLyricsWidthKeyDown"
        @reset-width="resetLyricsWidth"
        @edit-lyrics="openLyricsEditPanel"
      />
      <PlayerBar v-if="!isCdCanvas" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
  <SettingsDialog />
  <LyricsEditPanel
    ref="lyricsEditPanelRef"
    :open="isLyricsEditOpen"
    :return-focus-to="lyricsEditReturnFocus"
    @close="isLyricsEditOpen = false"
  />
  <component
    :is="startupAlbumOverlay"
    v-if="startupAlbumOverlay && startupAlbumPresentation"
    :presentation="startupAlbumPresentation"
    @shown="startupAlbumShown"
    @close="closeStartupAlbum"
  />
</template>

<style scoped>
.app-window.is-cd-albums {
  background: #eeeeec;
  box-shadow: none;
}

.app-shell.is-cd-albums {
  grid-template-columns: minmax(0, 1fr) !important;
  background: #eeeeec;
}

.app-window.is-cd-albums-dark,
.app-shell.is-cd-albums-dark {
  background: #2b2d30;
}

@media (min-width: 1280px) {
  .app-shell.is-cd-albums {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
</style>
