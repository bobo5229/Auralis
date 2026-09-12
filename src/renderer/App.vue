<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import AppSidebar from './app/layout/AppSidebar.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import MiniPlayer from './app/layout/MiniPlayer.vue'
import { useDesktopLyricsSync } from '@renderer/features/lyrics/composables/useDesktopLyricsSync'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { provideAmdlDownload } from '@renderer/features/download/composables/downloadContext'

const route = useRoute()
provideAmdlDownload()
useSystemMediaIntegration()
useDesktopLyricsSync()
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

const isAlbumDetail = computed(() => {
  return route.name === 'album-detail'
})

/**
 * 路由过渡规则：
 * 1. 专辑列表 ➔ 专辑详情：景深穿梭与黑胶破土浮升 (album-detail-enter-matrix)
 * 2. 专辑详情 ➔ 专辑列表：黑胶沉降与景深聚拢归位 (album-detail-exit-matrix)
 * 3. 其余路由切换：通用平滑淡入淡出 (fade)
 */
const transitionName = computed(() => {
  if (route.name === 'album-detail' && previousRouteName.value === 'albums') {
    return 'album-detail-enter-matrix'
  }
  if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
    return 'album-detail-exit-matrix'
  }
  return 'fade'
})
</script>

<template>
  <MiniPlayer v-if="displayMode === 'mini'" />

  <div v-else class="app-window" data-app-shell-root>
    <div class="app-shell relative" :class="{ 'is-album-detail': isAlbumDetail }">
      <div class="wco-drag-region" aria-hidden="true" />

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
