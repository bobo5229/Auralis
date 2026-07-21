<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
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

const playback = usePlayback()
useSystemMediaIntegration()
const { displayMode, onMiniPlayerWindowStateChanged, syncMiniPlayerWindowState } =
  usePlayerDisplayMode()
let unsubscribeMiniPlayerWindowState: (() => void) | null = null

onMounted(() => {
  void syncMiniPlayerWindowState()
  unsubscribeMiniPlayerWindowState = onMiniPlayerWindowStateChanged()
})

onBeforeUnmount(() => {
  unsubscribeMiniPlayerWindowState?.()
  unsubscribeMiniPlayerWindowState = null
})

const artworkUrl = computed(() => {
  const artworkKey = playback.state.currentTrack?.artworkCacheKey ?? null
  return getArtworkUrl(artworkKey)
})

const isAlbumDetail = computed(() => {
  const name = router.currentRoute.value.name
  return name === 'album-detail'
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
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
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
