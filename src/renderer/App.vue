<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import {
  provideAlbumMetadataEditor,
  type AlbumMetadataEditorRequest,
} from './shared/albumMetadataEditor'
import AlbumMetadataEditDialog from './features/library/components/AlbumMetadataEditDialog.vue'
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
import TrackEditorDialog from './app/layout/TrackEditorDialog.vue'
import PageParameterPanel from './app/layout/PageParameterPanel.vue'
import CdViewSwitch from './features/albums/components/CdViewSwitch.vue'
import { provideCdViewSwitchVisibility } from './features/albums/composables/useCdViewSwitchVisibility'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useAppOverlays } from './app/composables/useAppOverlays'
import { useAppShellLayout } from './app/composables/useAppShellLayout'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { provideAlbumDetailArtwork } from '@renderer/features/albums/albumDetailArtwork'
import {
  getAlbumColorPreference,
  migrateAlbumColorPreference,
  type AlbumColorAnchor,
} from '@renderer/features/albums/albumColorPreferences'
import { albumDetailColors, cssAlbumColor } from '@renderer/features/albums/albumDetailColors'
import { legacyAlbumDetailSourceColor } from '@renderer/features/albums/albumColorLegacyMigration'

const {
  active: startupAlbumActive,
  presentation: startupAlbumPresentation,
  overlay: startupAlbumOverlay,
  shown: startupAlbumShown,
  close: closeStartupAlbum,
} = useStartupAlbum()
const albumEditRequest = ref<AlbumMetadataEditorRequest | null>(null)
provideAlbumMetadataEditor({
  open: (request) => {
    if (!isTrackEditorOpen.value) albumEditRequest.value = request
  },
})
const route = useRoute()
const detailArtworkKey = ref<string | null>(null)
const detailAnchors = ref<AlbumColorAnchor[]>([])
const detailIdentity = ref<{ artist: string; title: string } | null>(null)
let detailArtworkOwner: symbol | null = null
provideAlbumDetailArtwork({
  set: (owner, key, anchors = [], identity) => {
    detailArtworkOwner = owner
    detailArtworkKey.value = key
    detailAnchors.value = anchors
    detailIdentity.value = identity ?? null
  },
  clear: (owner) => {
    if (detailArtworkOwner !== owner) return
    detailArtworkOwner = null
    detailArtworkKey.value = null
    detailAnchors.value = []
    detailIdentity.value = null
  },
})
const detailPaletteEnabled = computed(() => route.name === 'album-detail')
const { palette: detailPalette } = useArtworkPalette(detailArtworkKey, {
  enabled: detailPaletteEnabled,
})
watch(
  [detailArtworkKey, detailAnchors, () => route.query.artist, () => route.query.title],
  ([key, anchors, artist, title]) => {
    if (!key || !anchors.length) return
    const sentinel = { r: 0, g: 0, b: 0 }
    const legacy = legacyAlbumDetailSourceColor(artist, title, key, sentinel)
    if (legacy !== sentinel) migrateAlbumColorPreference(anchors, key, legacy)
  },
  { immediate: true },
)
const detailColorStyle = computed<CSSProperties>(() => {
  const palette = detailPalette.value
  if (!detailPaletteEnabled.value || !albumDetailColorReady.value) return {}
  const identityMatches =
    detailIdentity.value?.artist === route.query.artist &&
    detailIdentity.value?.title === route.query.title
  const selected =
    (identityMatches ? getAlbumColorPreference(detailAnchors.value) : null) ??
    (detailArtworkKey.value &&
    palette.key === detailArtworkKey.value &&
    palette.quality !== 'fallback'
      ? palette.dominant
      : undefined)
  if (!selected) return {}
  const c = albumDetailColors(selected)
  return {
    '--album-detail-main': cssAlbumColor(c.main),
    '--album-detail-divider': cssAlbumColor(c.divider),
    '--album-detail-more': cssAlbumColor(c.more),
    '--album-detail-more-text': cssAlbumColor(c.moreText),
    '--album-detail-more-faint': cssAlbumColor(c.moreFaint),
    '--album-detail-side': cssAlbumColor(c.side),
    '--album-detail-lyrics-surface': cssAlbumColor(c.side),
    '--album-detail-main-text': cssAlbumColor(c.mainText),
    '--album-detail-main-muted': cssAlbumColor(c.mainMuted),
    '--album-detail-main-faint': cssAlbumColor(c.mainFaint),
    '--album-detail-side-text': cssAlbumColor(c.sideText),
    '--album-detail-side-muted': cssAlbumColor(c.sideMuted),
    '--album-detail-side-faint': cssAlbumColor(c.sideFaint),
    '--album-detail-lyrics-active': cssAlbumColor(c.lyricsActive),
    '--album-detail-lyrics-inactive': cssAlbumColor(c.lyricsInactive),
    '--album-detail-lyrics-muted': cssAlbumColor(c.lyricsMuted),
  } as CSSProperties
})
const { cdCanvasTheme } = useCdCanvasTheme()
const cdBrowseViewSwitchVisible = provideCdViewSwitchVisibility()
const cdViewSwitchRef = ref<InstanceType<typeof CdViewSwitch> | null>(null)
useSystemMediaIntegration()
const { displayMode } = usePlayerDisplayMode()
const { sidebarCollapsed } = useSidebarLayout()

const {
  isSettingsOpen,
  isTrackEditorOpen,
  trackEditorRef,
  trackEditorRequest,
  closeTrackEditor,
  openLyricsEditPanel,
  pageParameters,
} = useAppOverlays(route, displayMode, startupAlbumActive, () => {
  albumEditRequest.value = null
})
watch(isSettingsOpen, (open) => {
  if (open) albumEditRequest.value = null
})
watch(displayMode, (mode) => {
  if (mode === 'fullscreen') albumEditRequest.value = null
})
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
  albumDetailColorReady,
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
  isTrackEditorOpen,
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
        'has-album-detail-color': !!detailColorStyle['--album-detail-main'],
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
      :style="[shellStyle, detailColorStyle]"
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
            :css="transitionName !== null && !isAlbumRouteTransitioning"
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
  <AlbumMetadataEditDialog
    :request="albumEditRequest"
    :show-return-button="!isTrackEditorOpen && !isSettingsOpen && displayMode === 'normal'"
    @close="albumEditRequest = null"
    @reopen="albumEditRequest = {}"
  />
  <TrackEditorDialog ref="trackEditorRef" :request="trackEditorRequest" @close="closeTrackEditor" />
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
