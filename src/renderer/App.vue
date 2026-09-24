<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import AppSidebar from './app/layout/AppSidebar.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import MiniPlayer from './app/layout/MiniPlayer.vue'
import FluidArtworkBackground from './features/playback/components/FluidArtworkBackground.vue'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useDesktopLyricsSync } from '@renderer/features/lyrics/composables/useDesktopLyricsSync'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'

const route = useRoute()
const playback = usePlayback()
const { shellFluidBackgroundEnabled } = useShellFluidBackground()
const { cdCanvasTheme } = useCdCanvasTheme()
useSystemMediaIntegration()
useDesktopLyricsSync()
const { displayMode, onMiniPlayerWindowStateChanged, syncMiniPlayerWindowState } =
  usePlayerDisplayMode()
let unsubscribeMiniPlayerWindowState: (() => void) | null = null

/** 上一导航来源路由名；在 beforeEach 中更新，供 Transition 在目标路由已切换时仍能判断方向 */
const previousRouteName = ref(route.name)
/** Albums ➔ AlbumDetail 专属进入过渡标记；在 beforeEach 提早设为 true，并在 after-enter/cancelled 时复位 */
const isAlbumDetailEntering = ref(false)
const isAlbumRouteTransitioning = ref(false)

const removeBeforeEach = router.beforeEach((to, from) => {
  previousRouteName.value = from.name
  isAlbumDetailEntering.value = to.name === 'album-detail' && from.name === 'albums'
  isAlbumRouteTransitioning.value =
    isAlbumDetailEntering.value || (to.name === 'albums' && from.name === 'album-detail')
})

onMounted(() => {
  void syncMiniPlayerWindowState()
  unsubscribeMiniPlayerWindowState = onMiniPlayerWindowStateChanged()
})

onBeforeUnmount(() => {
  removeBeforeEach()
  isAlbumDetailEntering.value = false
  unsubscribeMiniPlayerWindowState?.()
  unsubscribeMiniPlayerWindowState = null
})

const isAlbumDetail = computed(() => {
  return route.name === 'album-detail'
})

const isCdAlbums = computed(() => {
  return route.name === 'cd-albums'
})

const artworkUrl = computed(() =>
  getArtworkUrl(playback.state.currentTrack?.artworkCacheKey ?? null),
)
const shouldRenderShellArtwork = computed(
  () =>
    shellFluidBackgroundEnabled.value &&
    displayMode.value === 'normal' &&
    !isCdAlbums.value &&
    artworkUrl.value !== null,
)

/**
 * 路由过渡规则：
 * 1. 专辑列表 ➔ 专辑详情：景深穿梭与黑胶破土浮升 (album-detail-enter-matrix)
 * 2. 专辑详情 ➔ 专辑列表：黑胶沉降与景深聚拢归位 (album-detail-exit-matrix)
 * 3. 其余路由切换：不使用 CSS 过渡，立即完成
 */
const transitionName = computed(() => {
  if (route.name === 'album-detail' && previousRouteName.value === 'albums') {
    return 'album-detail-enter-matrix'
  }
  if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
    return 'album-detail-exit-matrix'
  }
  return null
})

function onTransitionAfterEnter(): void {
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
}

function onTransitionEnterCancelled(): void {
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
}
</script>

<template>
  <MiniPlayer v-if="displayMode === 'mini'" />

  <div
    v-else
    class="app-window"
    :class="{
      'is-cd-albums': isCdAlbums,
      'is-cd-albums-dark': isCdAlbums && cdCanvasTheme === 'dark',
    }"
    data-app-shell-root
  >
    <div
      class="app-shell relative"
      :class="{
        'is-album-detail': isAlbumDetail,
        'is-cd-albums': isCdAlbums,
        'is-cd-albums-dark': isCdAlbums && cdCanvasTheme === 'dark',
        'has-artwork': shouldRenderShellArtwork,
      }"
    >
      <div class="wco-drag-region" aria-hidden="true" />

      <FluidArtworkBackground
        v-if="shouldRenderShellArtwork"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="app-shell-bg-fluid"
      />
      <div v-if="shouldRenderShellArtwork" class="app-shell-bg-overlay" aria-hidden="true" />

      <AppSidebar v-if="!isCdAlbums" class="relative z-10" />

      <main class="app-main relative z-10">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition
            :name="transitionName ?? undefined"
            :css="transitionName !== null"
            @after-enter="onTransitionAfterEnter"
            @enter-cancelled="onTransitionEnterCancelled"
          >
            <KeepAlive include="AlbumsPage" :max="1">
              <component
                :is="Component"
                :key="String(viewRoute.name)"
                v-bind="
                  viewRoute.name === 'album-detail'
                    ? { isEntering: isAlbumDetailEntering }
                    : viewRoute.name === 'albums'
                      ? { isTransitioning: isAlbumRouteTransitioning }
                      : {}
                "
              />
            </KeepAlive>
          </Transition>
        </RouterView>
      </main>

      <NowPlayingPanel v-if="!isCdAlbums" class="relative z-10" />
      <PlayerBar v-if="!isCdAlbums" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
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

.app-shell-bg-fluid,
.app-shell-bg-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.app-shell-bg-fluid {
  z-index: 0;
}

.app-shell-bg-overlay {
  z-index: 1;
  background: color-mix(in srgb, #0c0b0a 65%, transparent);
  backdrop-filter: blur(20px) saturate(1.45) contrast(1.02);
  -webkit-backdrop-filter: blur(20px) saturate(1.45) contrast(1.02);
}
</style>
