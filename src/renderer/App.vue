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
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'

const route = useRoute()
const playback = usePlayback()
useSystemMediaIntegration()
const { displayMode, onMiniPlayerWindowStateChanged, syncMiniPlayerWindowState } =
  usePlayerDisplayMode()
let unsubscribeMiniPlayerWindowState: (() => void) | null = null

/** 上一导航来源路由名；在 beforeEach 中更新，供 Transition 在目标路由已切换时仍能判断方向 */
const previousRouteName = ref(route.name)

const removeBeforeEach = router.beforeEach((_to, from) => {
  previousRouteName.value = from.name
})

onMounted(() => {
  void syncMiniPlayerWindowState()
  unsubscribeMiniPlayerWindowState = onMiniPlayerWindowStateChanged()
})

onBeforeUnmount(() => {
  removeBeforeEach()
  unsubscribeMiniPlayerWindowState?.()
  unsubscribeMiniPlayerWindowState = null
})

const artworkUrl = computed(() => {
  const artworkKey = playback.state.currentTrack?.artworkCacheKey ?? null
  return getArtworkUrl(artworkKey)
})

const isAlbumDetail = computed(() => {
  return route.name === 'album-detail'
})

/** 专辑详情 ➔ 专辑列表：黑胶沉降与景深聚拢归位；其余路由使用默认 fade */
const transitionName = computed(() => {
  if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
    return 'album-detail-exit-matrix'
  }
  return 'fade'
})
</script>

<template>
  <MiniPlayer v-if="displayMode === 'mini'" />

  <div v-else class="app-window" data-app-shell-root>
    <div
      class="app-shell relative"
      :class="{ 'is-album-detail': isAlbumDetail, 'has-artwork': !!artworkUrl }"
    >
      <!-- 只有在且有封面时才渲染在 app-shell 顶层网格之下的背景 -->
      <FluidArtworkBackground
        v-if="artworkUrl"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="app-shell-bg-fluid"
      />
      <div v-if="artworkUrl" class="app-shell-bg-overlay" aria-hidden="true"></div>

      <AppSidebar class="relative z-10" />

      <main class="app-main relative z-10">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition :name="transitionName">
            <component :is="Component" :key="String(viewRoute.name)" />
          </Transition>
        </RouterView>
      </main>

      <NowPlayingPanel class="relative z-10" />
      <PlayerBar class="relative z-10" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
</template>

<style scoped>
.app-shell-bg-fluid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.app-shell-bg-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--auralis-overlay-bg);
  backdrop-filter: var(--auralis-overlay-blur);
  -webkit-backdrop-filter: var(--auralis-overlay-blur);
  pointer-events: none;
}
</style>
