<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import './app/styles/cdCanvasTransition.css'
import AppSidebar from './app/layout/AppSidebar.vue'
import WindowTrafficLights from '@renderer/shared/components/WindowTrafficLights.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import { useThemeTransition } from './app/layout/useThemeTransition'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import SettingsDialog from '@renderer/features/settings/components/SettingsDialog.vue'
import PageParameterPanel from './app/layout/PageParameterPanel.vue'
import CdViewSwitch from './features/albums/components/CdViewSwitch.vue'
import { provideCdViewSwitchVisibility } from './features/albums/composables/useCdViewSwitchVisibility'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useAppOverlays } from './app/composables/useAppOverlays'
import { useAppShellLayout } from './app/composables/useAppShellLayout'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { peekArtworkPalette, useArtworkPalette } from '@renderer/shared/artwork/useArtworkPalette'
import { readAlbumDetailSnapshot } from '@renderer/features/albums/albumDetailSnapshot'
import { provideAlbumDetailArtwork } from '@renderer/features/albums/albumDetailArtwork'
import { createAlbumSurfaceSynchronization } from './app/layout/albumSurfaceSynchronization'
import {
  getAlbumColorPreference,
  type AlbumColorAnchor,
} from '@renderer/features/albums/albumColorPreferences'
import { albumDetailColors, cssAlbumColor } from '@renderer/features/albums/albumDetailColors'
import { albumIdentityKey } from '@shared/utils/albumIdentity'

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
const frozenDetailColorStyle = ref<CSSProperties | null>(null)
const lateAlbumColorsPending = ref(false)
const paletteInstant = ref(false)
const albumNavigationInstant = ref(false)
let albumNavigationFrame = 0
const detailColorPreference = computed(() => {
  if (
    detailIdentity.value?.artist !== route.query.artist ||
    detailIdentity.value?.title !== route.query.title
  )
    return null
  return getAlbumColorPreference(detailAnchors.value)
})
const liveDetailColorStyle = computed<CSSProperties>(() => {
  const palette = detailPalette.value
  if (!detailPaletteEnabled.value) return {}
  const snapshot =
    typeof route.query.artist === 'string' && typeof route.query.title === 'string'
      ? readAlbumDetailSnapshot(route.query.artist, route.query.title)
      : null
  const snapshotPreference = snapshot
    ? getAlbumColorPreference(snapshot.tracks.map(({ id, createdAt }) => ({ id, createdAt })))
    : null
  const snapshotPalette = peekArtworkPalette(snapshot?.artworkCacheKey)
  const liveMatchesRoute =
    detailIdentity.value?.artist === route.query.artist &&
    detailIdentity.value?.title === route.query.title
  const selected =
    (liveMatchesRoute ? detailColorPreference.value : snapshotPreference) ??
    (liveMatchesRoute &&
    detailArtworkKey.value &&
    palette.key === detailArtworkKey.value &&
    palette.quality !== 'fallback'
      ? palette.dominant
      : (!liveMatchesRoute || detailArtworkKey.value === snapshot?.artworkCacheKey) &&
          snapshotPalette?.quality !== 'fallback'
        ? snapshotPalette?.dominant
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
    '--album-detail-accent': cssAlbumColor(c.accent),
    '--album-detail-accent-text': cssAlbumColor(c.accentText),
    '--album-detail-accent-border': cssAlbumColor(c.accentBorder),
    '--album-detail-accent-side-border': cssAlbumColor(c.accentSideBorder),
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
const detailColorStyle = computed<CSSProperties>(
  () => frozenDetailColorStyle.value ?? liveDetailColorStyle.value,
)
const { cdCanvasTheme } = useCdCanvasTheme()
const cdBrowseViewSwitchVisible = provideCdViewSwitchVisibility()
const cdViewSwitchRef = ref<InstanceType<typeof CdViewSwitch> | null>(null)
useSystemMediaIntegration()
const { displayMode } = usePlayerDisplayMode()
const { sidebarCollapsed } = useSidebarLayout()

const { isSettingsOpen, pageParameters } = useAppOverlays(route, displayMode)
const shellRef = ref<HTMLElement | null>(null)
useThemeTransition(shellRef, () => route.fullPath)
watch(shellRef, (shell, _previous, onCleanup) => {
  if (shell) onCleanup(createAlbumSurfaceSynchronization(shell))
})
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
  isAlbumRouteInteractionLocked,
  albumDetailTransitionHooks,
  transitionName,
  onTransitionBeforeEnter,
  onTransitionEnter,
  onTransitionBeforeLeave,
  restoreLeavingInteractivity,
  onTransitionAfterEnter,
  onTransitionEnterCancelled,
} = useAppShellLayout({
  getAlbumDetailColors: () => {
    const colors = liveDetailColorStyle.value
    if (route.name === 'album-detail') {
      frozenDetailColorStyle.value = { ...colors }
      lateAlbumColorsPending.value = !colors['--album-detail-main']
    }
    return Object.fromEntries(
      Object.entries(colors).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  },
  releaseAlbumDetailColors: () => {
    if (!lateAlbumColorsPending.value) frozenDetailColorStyle.value = null
  },
  route,
  router,
  shellRef,
  mainRef,
  displayMode,
  isSettingsOpen,
  pageParameters,
  prepareForDisplay: () => nowPlayingPanelRef.value?.prepareForDisplay(),
  syncCdViewSwitch: () => cdViewSwitchRef.value?.syncToCurrent(true),
})
watch(
  isAlbumRouteTransitioning,
  (transitioning) => {
    if (!transitioning) return
    cancelAnimationFrame(albumNavigationFrame)
    albumNavigationInstant.value = true
    albumNavigationFrame = requestAnimationFrame(() => {
      albumNavigationFrame = requestAnimationFrame(() => {
        albumNavigationInstant.value = false
      })
    })
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => cancelAnimationFrame(albumNavigationFrame))
let lateColorTransition: ViewTransition | null = null
let lateColorRevision = 0
function cancelLateColorTransition(): void {
  lateColorRevision++
  lateColorTransition?.skipTransition()
  lateColorTransition = null
  paletteInstant.value = false
  shellRef.value?.classList.remove('album-palette-instant')
  document.documentElement?.classList.remove('album-palette-reveal')
}
watch(
  () => route.fullPath,
  () => {
    cancelLateColorTransition()
    lateAlbumColorsPending.value = false
    frozenDetailColorStyle.value = null
  },
  { flush: 'sync' },
)
watch(
  [lateAlbumColorsPending, liveDetailColorStyle, isAlbumRouteTransitioning],
  ([pending, colors, transitioning]) => {
    if (
      !pending ||
      transitioning ||
      route.name !== 'album-detail' ||
      !colors['--album-detail-main']
    )
      return
    lateAlbumColorsPending.value = false
    const shell = shellRef.value
    if (!shell) {
      frozenDetailColorStyle.value = null
      return
    }
    paletteInstant.value = true
    shell.classList.add('album-palette-instant')
    const revision = ++lateColorRevision
    const applyColors = async () => {
      if (revision !== lateColorRevision) return
      frozenDetailColorStyle.value = null
      await nextTick()
    }
    if (
      typeof document.startViewTransition !== 'function' ||
      document.documentElement?.dataset.reducedMotion === 'true'
    ) {
      void applyColors().then(() => {
        if (revision !== lateColorRevision) return
        // Commit the new styles before restoring ordinary transitions.
        shell.getBoundingClientRect()
        paletteInstant.value = false
        shell.classList.remove('album-palette-instant')
      })
      return
    }
    document.documentElement?.classList.add('album-palette-reveal')
    try {
      const transition = document.startViewTransition(applyColors)
      lateColorTransition = transition
      const finished = () => {
        if (lateColorTransition === transition) cancelLateColorTransition()
      }
      // `ready` can reject before the update callback has run; keep the instant
      // styles until the whole transition has settled.
      void transition.ready.catch(() => {})
      void transition.finished.then(finished, finished)
    } catch {
      void applyColors().then(() => {
        if (revision !== lateColorRevision) return
        shell.getBoundingClientRect()
        cancelLateColorTransition()
      })
    }
  },
  { flush: 'post' },
)
onBeforeUnmount(cancelLateColorTransition)
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
        'album-palette-instant': paletteInstant,
        'album-navigation-instant': albumNavigationInstant,
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
      <span class="album-more-color-clock" aria-hidden="true"></span>
      <span class="album-lyrics-color-clock" aria-hidden="true"></span>
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
        :inert="isAlbumRouteInteractionLocked"
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
                :key="
                  viewRoute.name === 'album-detail'
                    ? `album-detail:${albumIdentityKey(String(viewRoute.query.artist ?? ''), String(viewRoute.query.title ?? ''))}`
                    : String(viewRoute.name)
                "
                :ref="viewRoute.name === 'albums' ? setActiveAlbumsPage : undefined"
                v-bind="
                  viewRoute.name === 'album-detail'
                    ? {
                        isEntering: isAlbumDetailEntering,
                        artist: String(viewRoute.query.artist ?? ''),
                        title: String(viewRoute.query.title ?? ''),
                      }
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
      />
      <PlayerBar v-if="!isCdCanvas" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
  <SettingsDialog />
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
