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
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { resolveShellPresentation } from './app/utils/shellPresentation'
import { resolvePlayerSurfacePresentation } from './app/utils/playerSurfacePresentation'
import type { CSSProperties } from 'vue'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import './app/styles/manuscript.shell.css'
import './app/styles/manuscript.player.css'

const route = useRoute()
const playback = usePlayback()
const { visualStyle } = useVisualStyle()
useSystemMediaIntegration()
const { displayMode, onMiniPlayerWindowStateChanged, syncMiniPlayerWindowState } =
  usePlayerDisplayMode()
const shellPresentation = computed(() =>
  resolveShellPresentation(displayMode.value, visualStyle.value),
)
const isModernShell = computed(() => shellPresentation.value === 'modern')
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

const artworkUrl = computed(() => {
  const artworkKey = playback.state.currentTrack?.artworkCacheKey ?? null
  return getArtworkUrl(artworkKey)
})

const isAlbumDetail = computed(() => {
  return route.name === 'album-detail'
})

/** 当前曲封面 key；无曲 / 无封面时为 null（色板回退主题） */
const artworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
const { palette: chromePalette } = useArtworkPalette(artworkCacheKey, {
  enabled: isModernShell,
})
const shouldRenderShellArtwork = computed(() => isModernShell.value && !!artworkUrl.value)

/** 壳层 chrome 变量：modern 跟当前曲色板；manuscript 使用共享纸面 token */
const windowChromeStyle = computed<CSSProperties>(() => {
  if (shellPresentation.value === 'manuscript') {
    return {
      '--auralis-window-chrome-bg': 'var(--manuscript-surface-page)',
      '--auralis-window-chrome-accent': 'var(--manuscript-accent-primary)',
      '--auralis-window-chrome-border': 'var(--manuscript-border-strong)',
    } as CSSProperties
  }

  const hasTrack = !!playback.state.currentTrack
  const pal = chromePalette.value
  const accent = pal?.accents[0]?.rgb
  const accentCss = accent ? `rgb(${accent.r} ${accent.g} ${accent.b})` : null

  return {
    '--auralis-window-chrome-bg':
      hasTrack && pal
        ? `rgb(${pal.background.r} ${pal.background.g} ${pal.background.b})`
        : 'var(--auralis-app-background)',
    '--auralis-window-chrome-accent': accentCss ?? 'var(--auralis-sidebar-active-indicator)',
    '--auralis-window-chrome-border': accentCss
      ? `color-mix(in srgb, ${accentCss} 35%, transparent)`
      : 'var(--auralis-border-subtle)',
  } as CSSProperties
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

  <div
    v-else
    class="app-window"
    data-app-shell-root
    :data-shell-presentation="shellPresentation"
    :style="windowChromeStyle"
  >
    <div
      class="app-shell relative"
      :class="{ 'is-album-detail': isAlbumDetail, 'has-artwork': shouldRenderShellArtwork }"
    >
      <!-- 仅 modern 且有封面时挂载流体背景，避免手稿模式继续跑 canvas / RAF -->
      <FluidArtworkBackground
        v-if="shouldRenderShellArtwork"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="app-shell-bg-fluid"
      />
      <div v-if="shouldRenderShellArtwork" class="app-shell-bg-overlay" aria-hidden="true"></div>

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
