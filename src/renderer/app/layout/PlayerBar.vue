<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'

const playback = usePlayback()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
const { colors: albumPaletteColors } = useArtworkPalette(currentArtworkCacheKey)

const activeAlbumGradient = ref<string | null>(null)
const previousAlbumGradient = ref<string | null>(null)
const isAlbumGradientCrossfading = ref(false)
const playerBarRef = ref<HTMLElement | null>(null)
let albumGradientTimer: ReturnType<typeof setTimeout> | null = null
const ALBUM_GRADIENT_FLOW_PX_PER_MS = 0.018
let albumGradientFlowElapsedMs = 0
let albumGradientFlowStartedAt = performance.now()
let albumGradientFlowFrame: number | null = null
let reducedMotionQuery: MediaQueryList | null = null

function formatAlbumColor(color: { r: number; g: number; b: number }): string {
  return `rgb(${color.r} ${color.g} ${color.b} / var(--auralis-playbar-album-alpha))`
}

const albumGradient = computed(() => {
  const colors = albumPaletteColors.value
  if (!colors || colors.length === 0 || !playback.state.currentTrack) {
    return null
  }

  if (colors.length === 1) {
    const color = formatAlbumColor(colors[0])
    return `linear-gradient(90deg, ${color} 0%, ${color} 100%)`
  }

  if (colors.length === 2) {
    const first = formatAlbumColor(colors[0])
    const second = formatAlbumColor(colors[1])
    return `linear-gradient(90deg, ${first} 0%, ${second} 50%, ${first} 100%)`
  }

  return `linear-gradient(90deg, ${formatAlbumColor(colors[0])} 0%, ${formatAlbumColor(colors[1])} 25%, ${formatAlbumColor(colors[2])} 50%, ${formatAlbumColor(colors[1])} 75%, ${formatAlbumColor(colors[0])} 100%)`
})

function updateAlbumGradientFlowPosition(): void {
  if (!playback.state.isPlaying) {
    return
  }

  albumGradientFlowElapsedMs = performance.now() - albumGradientFlowStartedAt
}

function writeAlbumGradientFlowPosition(): void {
  const offsetPx = Math.round(albumGradientFlowElapsedMs * ALBUM_GRADIENT_FLOW_PX_PER_MS)
  playerBarRef.value?.style.setProperty('--playbar-album-flow-x', `${offsetPx}px`)
}

function stopAlbumGradientFlow(): void {
  if (albumGradientFlowFrame !== null) {
    cancelAnimationFrame(albumGradientFlowFrame)
    albumGradientFlowFrame = null
  }
}

function shouldRunAlbumGradientFlow(): boolean {
  return (
    playback.state.isPlaying &&
    activeAlbumGradient.value !== null &&
    reducedMotionQuery?.matches !== true
  )
}

function runAlbumGradientFlow(): void {
  updateAlbumGradientFlowPosition()
  writeAlbumGradientFlowPosition()

  if (!shouldRunAlbumGradientFlow()) {
    albumGradientFlowFrame = null
    return
  }

  albumGradientFlowFrame = requestAnimationFrame(runAlbumGradientFlow)
}

function startAlbumGradientFlow(): void {
  if (!shouldRunAlbumGradientFlow() || albumGradientFlowFrame !== null) {
    return
  }

  albumGradientFlowStartedAt = performance.now() - albumGradientFlowElapsedMs
  albumGradientFlowFrame = requestAnimationFrame(runAlbumGradientFlow)
}

function syncAlbumGradientFlow(): void {
  if (shouldRunAlbumGradientFlow()) {
    startAlbumGradientFlow()
    return
  }

  updateAlbumGradientFlowPosition()
  writeAlbumGradientFlowPosition()
  stopAlbumGradientFlow()
}

const activeAlbumGradientStyle = computed<CSSProperties>(() => ({
  backgroundImage: activeAlbumGradient.value ?? 'none',
}))

const previousAlbumGradientStyle = computed<CSSProperties>(() => ({
  backgroundImage: previousAlbumGradient.value ?? 'none',
}))

const hasActiveAlbumGradient = computed(() => activeAlbumGradient.value !== null)

// --- Queue popover ---
const isQueueOpen = ref(false)
const queueButtonRef = ref<HTMLElement | null>(null)
const queuePopoverRef = ref<HTMLElement | null>(null)

function toggleQueue(): void {
  isQueueOpen.value = !isQueueOpen.value
}

function closeQueue(): void {
  isQueueOpen.value = false
}

// --- Mode menu ---
const isModeMenuOpen = ref(false)
const modeButtonRef = ref<HTMLElement | null>(null)
const modeMenuRef = ref<HTMLElement | null>(null)

function toggleModeMenu(): void {
  isModeMenuOpen.value = !isModeMenuOpen.value
}

function closeModeMenu(): void {
  isModeMenuOpen.value = false
}

function handleSelectMode(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  closeModeMenu()
}

// --- Outside click ---
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return

  if (isQueueOpen.value) {
    if (queueButtonRef.value?.contains(target)) return
    if (queuePopoverRef.value?.contains(target)) return
    closeQueue()
  }

  if (isModeMenuOpen.value) {
    if (modeButtonRef.value?.contains(target)) return
    if (modeMenuRef.value?.contains(target)) return
    closeModeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionQuery.addEventListener('change', syncAlbumGradientFlow)
  writeAlbumGradientFlowPosition()
  syncAlbumGradientFlow()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  reducedMotionQuery?.removeEventListener('change', syncAlbumGradientFlow)
  reducedMotionQuery = null
  stopAlbumGradientFlow()
  if (albumGradientTimer) {
    clearTimeout(albumGradientTimer)
    albumGradientTimer = null
  }
})

watch(
  albumGradient,
  (nextGradient) => {
    if (nextGradient === activeAlbumGradient.value) {
      return
    }

    updateAlbumGradientFlowPosition()

    if (albumGradientTimer) {
      clearTimeout(albumGradientTimer)
      albumGradientTimer = null
    }

    previousAlbumGradient.value = activeAlbumGradient.value
    activeAlbumGradient.value = nextGradient
    isAlbumGradientCrossfading.value = true
    writeAlbumGradientFlowPosition()
    syncAlbumGradientFlow()

    albumGradientTimer = setTimeout(() => {
      previousAlbumGradient.value = null
      isAlbumGradientCrossfading.value = false
      albumGradientTimer = null
    }, 420)
  },
  { immediate: true },
)

watch(
  () => playback.state.isPlaying,
  (isPlaying) => {
    if (isPlaying) {
      albumGradientFlowStartedAt = performance.now() - albumGradientFlowElapsedMs
      syncAlbumGradientFlow()
      return
    }

    albumGradientFlowElapsedMs = performance.now() - albumGradientFlowStartedAt
    syncAlbumGradientFlow()
  },
)

// --- Mode icon ---
const playbackModeIconClass = computed(() => {
  switch (playback.state.playbackMode) {
    case 'repeat-all':
      return 'i-lucide-repeat'
    case 'repeat-one':
      return 'i-lucide-repeat-1'
    case 'shuffle':
      return 'i-lucide-shuffle'
    case 'album-shuffle':
      return 'i-lucide-disc-3'
    case 'sequential':
    default:
      return 'i-lucide-list-end'
  }
})

// --- Volume ---
const volumeIconClass = computed(() => {
  if (playback.state.isMuted) {
    return 'i-lucide-volume-x'
  }

  const volume = playback.state.volume

  if (volume <= 0) {
    return 'i-lucide-volume'
  }

  if (volume <= 0.33) {
    return 'i-lucide-volume'
  }

  if (volume <= 0.66) {
    return 'i-lucide-volume-1'
  }

  return 'i-lucide-volume-2'
})

const volumeSliderStyle = computed(() => {
  const percentage = `${Math.round(playback.state.volume * 100)}%`

  return {
    background: `linear-gradient(to right, var(--auralis-volume-fill) 0%, var(--auralis-volume-fill) ${percentage}, var(--auralis-progress-track) ${percentage}, var(--auralis-progress-track) 100%)`,
  }
})

// --- Transport ---
function handlePlayPause(): void {
  playback.togglePlayPause()
}

function handlePrev(): void {
  playback.playPrevious()
}

function handleNext(): void {
  playback.playNext()
}

function handleToggleMute(): void {
  playback.toggleMute()
}
</script>

<template>
  <footer
    ref="playerBarRef"
    class="player-bar"
    :class="{
      'player-bar--album-tinted': hasActiveAlbumGradient,
      'player-bar--album-playing': playback.state.isPlaying,
      'player-bar--album-crossfading': isAlbumGradientCrossfading,
    }"
  >
    <div
      v-if="previousAlbumGradient"
      class="player-bar-album-tint player-bar-album-tint-previous"
      aria-hidden="true"
      :style="previousAlbumGradientStyle"
    ></div>
    <div
      v-if="activeAlbumGradient"
      class="player-bar-album-tint player-bar-album-tint-current"
      aria-hidden="true"
      :style="activeAlbumGradientStyle"
    ></div>

    <div class="transport-controls">
      <button
        class="transport-control"
        type="button"
        aria-label="Previous track"
        @click="handlePrev"
      >
        <span class="h-4 w-4 i-lucide-skip-back" />
      </button>
      <button
        class="transport-control-primary"
        type="button"
        :aria-label="playback.state.isPlaying ? 'Pause' : 'Play'"
        @click="handlePlayPause"
      >
        <span
          class="h-5 w-5"
          :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        />
      </button>
      <button class="transport-control" type="button" aria-label="Next track" @click="handleNext">
        <span class="h-4 w-4 i-lucide-skip-forward" />
      </button>
    </div>

    <TrackProgressInfo />

    <div class="playback-actions">
      <button
        ref="queueButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isQueueOpen }"
        type="button"
        aria-label="Playback queue"
        :aria-expanded="isQueueOpen"
        @click="toggleQueue"
      >
        <span class="playbar-action-icon h-4 w-4 i-lucide-list-music" />
      </button>

      <div ref="queuePopoverRef" class="contents">
        <PlaybackQueuePopover v-if="isQueueOpen" :anchor-ref="queueButtonRef" @close="closeQueue" />
      </div>

      <button
        ref="modeButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isModeMenuOpen }"
        type="button"
        aria-label="Playback mode"
        :aria-expanded="isModeMenuOpen"
        @click="toggleModeMenu"
      >
        <span class="playbar-action-icon h-4 w-4" :class="playbackModeIconClass" />
      </button>

      <div ref="modeMenuRef" class="contents">
        <PlaybackModeMenu
          v-if="isModeMenuOpen"
          :current-mode="playback.state.playbackMode"
          @select="handleSelectMode"
          @close="closeModeMenu"
        />
      </div>

      <div class="volume-control-group">
        <button
          class="player-control"
          type="button"
          :aria-label="playback.state.isMuted ? 'Unmute' : 'Mute'"
          @click="handleToggleMute"
        >
          <span class="playbar-action-icon h-4 w-4" :class="volumeIconClass" />
        </button>
        <input
          type="range"
          class="volume-slider"
          min="0"
          max="1"
          step="0.01"
          :value="playback.state.volume"
          :style="volumeSliderStyle"
          aria-label="Volume"
          @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </footer>
</template>
