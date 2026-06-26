<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'

const playback = usePlayback()

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
  const target = event.target as Node

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
})

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
    background: `linear-gradient(to right, #2C4A6E 0%, #2C4A6E ${percentage}, var(--auralis-progress-track) ${percentage}, var(--auralis-progress-track) 100%)`,
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
  <footer class="player-bar">
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
        <span class="h-4 w-4 i-lucide-list-music" />
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
        <span class="h-4 w-4" :class="playbackModeIconClass" />
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
          <span class="h-4 w-4 text-[var(--auralis-text-muted)]" :class="volumeIconClass" />
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
