<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import AppSidebar from './app/layout/AppSidebar.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import MiniPlayer from './app/layout/MiniPlayer.vue'
import VisualStyleTransitionCurtain from './features/appearance/components/VisualStyleTransitionCurtain.vue'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import { useDesktopLyricsSync } from '@renderer/features/lyrics/composables/useDesktopLyricsSync'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { resolveShellPresentation } from './app/utils/shellPresentation'
import { resolvePlayerSurfacePresentation } from './app/utils/playerSurfacePresentation'
import { provideAmdlDownload } from '@renderer/features/download/composables/downloadContext'
import type { CSSProperties } from 'vue'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import './app/styles/manuscript.shell.css'
import './app/styles/manuscript.player.css'
import './app/styles/manuscript.player-overlays.css'

const route = useRoute()
const { visualStyle } = useVisualStyle()
provideAmdlDownload()
useSystemMediaIntegration()
useDesktopLyricsSync()
const { displayMode, onMiniPlayerWindowStateChanged, syncMiniPlayerWindowState } =
  usePlayerDisplayMode()
const shellPresentation = computed(() =>
  resolveShellPresentation(displayMode.value, visualStyle.value),
)
// Phase 18: persistent player surfaces (Now Playing + PlayerBar) get their own
// presentation — fullscreen and mini always resolve to modern (Phase 19/20 own
// those surfaces). Never used as a component key or v-if gate.
const playerPresentation = computed(() =>
  resolvePlayerSurfacePresentation(displayMode.value, visualStyle.value),
)
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

/** 壳层 chrome：modern 固定使用主题 token；manuscript 使用共享纸面 token。 */
const windowChromeStyle = computed<CSSProperties>(() => {
  if (shellPresentation.value === 'manuscript') {
    return {
      '--auralis-window-chrome-bg': 'var(--manuscript-surface-page)',
      '--auralis-window-chrome-accent': 'var(--manuscript-accent-primary)',
      '--auralis-window-chrome-border': 'var(--manuscript-border-strong)',
    } as CSSProperties
  }

  return {
    '--auralis-window-chrome-bg': 'var(--auralis-bg)',
    '--auralis-window-chrome-accent': 'var(--auralis-sidebar-active-indicator)',
    '--auralis-window-chrome-border': 'var(--auralis-border-strong)',
  } as CSSProperties
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

  <div
    v-else
    class="app-window"
    data-app-shell-root
    :data-shell-presentation="shellPresentation"
    :style="windowChromeStyle"
  >
    <div class="app-shell relative" :class="{ 'is-album-detail': isAlbumDetail }">
      <div class="wco-drag-region" aria-hidden="true" />

      <AppSidebar class="relative z-10" :presentation="shellPresentation" />

      <main class="app-main relative z-10">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition :name="transitionName">
            <component :is="Component" :key="String(viewRoute.name)" />
          </Transition>
        </RouterView>
      </main>

      <NowPlayingPanel class="relative z-10" :presentation="playerPresentation" />
      <PlayerBar class="relative z-10" :presentation="playerPresentation" />
      <VisualStyleTransitionCurtain />
    </div>
    <FullscreenPlayerOverlay />
  </div>
</template>
