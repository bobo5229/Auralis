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
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey)

const activeAlbumTint = ref<string | null>(null)
const previousAlbumTint = ref<string | null>(null)
let albumTintTimer: ReturnType<typeof setTimeout> | null = null

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
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
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
    class="player-bar"
    :class="{ 'player-bar--album-tinted': hasActiveAlbumTint }"
    :style="playerBarStyle"
  >
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
