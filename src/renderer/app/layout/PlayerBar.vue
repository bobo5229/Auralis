<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'

const playback = usePlayback()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey)

const activeAlbumTint = ref<string | null>(null)
const previousAlbumTint = ref<string | null>(null)
const playerBarRef = ref<HTMLElement | null>(null)
const displacementImageRef = ref<SVGFEImageElement | null>(null)
let playerBarResizeObserver: ResizeObserver | null = null
let albumTintTimer: ReturnType<typeof setTimeout> | null = null

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

function roundedRectDistance(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): number {
  const qx = Math.abs(x) - halfWidth + radius
  const qy = Math.abs(y) - halfHeight + radius

  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

function updateLiquidGlassMap(): void {
  const playerBar = playerBarRef.value
  const displacementImage = displacementImageRef.value
  if (!playerBar || !displacementImage) return

  const bounds = playerBar.getBoundingClientRect()
  const renderScale = 0.5
  const width = Math.max(1, Math.round(bounds.width * renderScale))
  const height = Math.max(1, Math.round(bounds.height * renderScale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return

  canvas.width = width
  canvas.height = height

  const pixels = context.createImageData(width, height)
  const halfWidth = width / 2
  const halfHeight = height / 2
  const radius = Math.min(halfHeight * 0.72, 18)
  const rimWidth = Math.max(5, height * 0.16)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localX = x - halfWidth
      const localY = y - halfHeight
      const distance = roundedRectDistance(localX, localY, halfWidth - 1, halfHeight - 1, radius)
      const inwardDistance = Math.max(0, -distance)
      const rim = 1 - smoothstep(0, rimWidth, inwardDistance)
      const centerPull = rim * rim
      const normalizedX = localX / Math.max(1, halfWidth)
      const normalizedY = localY / Math.max(1, halfHeight)
      const vectorLength = Math.max(0.001, Math.hypot(normalizedX, normalizedY))
      const pixelIndex = (y * width + x) * 4

      pixels.data[pixelIndex] = clamp(128 + (normalizedX / vectorLength) * centerPull * 118, 0, 255)
      pixels.data[pixelIndex + 1] = clamp(
        128 + (normalizedY / vectorLength) * centerPull * 118,
        0,
        255,
      )
      pixels.data[pixelIndex + 2] = 128
      pixels.data[pixelIndex + 3] = 255
    }
  }

  context.putImageData(pixels, 0, 0)
  displacementImage.setAttribute('href', canvas.toDataURL('image/png'))
}

function formatAlbumColor(color: { r: number; g: number; b: number }): string {
  return `rgb(${color.r} ${color.g} ${color.b} / var(--auralis-playbar-album-alpha))`
}

const albumTint = computed(() => {
  const primaryColor = albumPalette.value?.accents[0]?.rgb
  if (!primaryColor || !playback.state.currentTrack) {
    return null
  }

  return formatAlbumColor(primaryColor)
})

const activeAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: activeAlbumTint.value ?? 'transparent',
}))

const previousAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: previousAlbumTint.value ?? 'transparent',
}))

const hasActiveAlbumTint = computed(() => activeAlbumTint.value !== null)
const playerBarStyle = computed(
  () =>
    ({
      '--auralis-active-album-tint': activeAlbumTint.value ?? 'transparent',
    }) as CSSProperties,
)

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
  void nextTick(() => {
    updateLiquidGlassMap()
    if (playerBarRef.value) {
      playerBarResizeObserver = new ResizeObserver(updateLiquidGlassMap)
      playerBarResizeObserver.observe(playerBarRef.value)
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  playerBarResizeObserver?.disconnect()
  playerBarResizeObserver = null
  if (albumTintTimer) {
    clearTimeout(albumTintTimer)
    albumTintTimer = null
  }
})

watch(
  albumTint,
  (nextTint) => {
    if (nextTint === activeAlbumTint.value) {
      return
    }

    if (albumTintTimer) {
      clearTimeout(albumTintTimer)
      albumTintTimer = null
    }

    previousAlbumTint.value = activeAlbumTint.value
    activeAlbumTint.value = nextTint

    albumTintTimer = setTimeout(() => {
      previousAlbumTint.value = null
      albumTintTimer = null
    }, 420)
  },
  { immediate: true },
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
    :class="{ 'player-bar--album-tinted': hasActiveAlbumTint }"
    :style="playerBarStyle"
  >
    <svg class="player-bar-liquid-filter" aria-hidden="true">
      <defs>
        <filter
          id="auralis-player-liquid-refraction"
          x="0"
          y="0"
          width="100%"
          height="100%"
          color-interpolation-filters="sRGB"
        >
          <feImage ref="displacementImageRef" width="100%" height="100%" result="displacement" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="displacement"
            scale="24"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
    <div class="player-bar-liquid-optics" aria-hidden="true"></div>
    <div
      class="player-bar-liquid-dispersion player-bar-liquid-dispersion-red"
      aria-hidden="true"
    ></div>
    <div
      class="player-bar-liquid-dispersion player-bar-liquid-dispersion-blue"
      aria-hidden="true"
    ></div>

    <div
      v-if="previousAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-previous"
      aria-hidden="true"
      :style="previousAlbumTintStyle"
    ></div>
    <div
      v-if="activeAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-current"
      aria-hidden="true"
      :style="activeAlbumTintStyle"
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
