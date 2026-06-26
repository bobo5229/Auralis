<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'

const playback = usePlayback()
const imgError = ref(false)
const isDraggingProgress = ref(false)
const draggingProgressRatio = ref<number | null>(null)

const progressRatio = computed(() => {
  if (!playback.state.duration) {
    return 0
  }

  if (draggingProgressRatio.value !== null) {
    return draggingProgressRatio.value
  }

  return Math.min(1, Math.max(0, playback.state.currentTime / playback.state.duration))
})

const progressPercent = computed(() => `${progressRatio.value * 100}%`)
const progressValueNow = computed(() => Math.round(progressRatio.value * 100))

watch(
  () => playback.state.currentTrackId,
  () => {
    imgError.value = false
  },
)

function handleCoverClick(): void {
  // Reserved for future full-screen player navigation
}

function getProgressRatioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  return Math.min(1, Math.max(0, ratio))
}

function seekProgressFromPointer(event: PointerEvent): void {
  if (!playback.state.duration) return

  const target = event.currentTarget as HTMLElement
  const ratio = getProgressRatioFromPointer(event, target)
  draggingProgressRatio.value = ratio
  playback.seekByRatio(ratio)
}

function handleProgressPointerDown(event: PointerEvent): void {
  if (!playback.state.duration) return

  const target = event.currentTarget as HTMLElement
  isDraggingProgress.value = true
  target.setPointerCapture(event.pointerId)
  event.preventDefault()
  seekProgressFromPointer(event)
}

function handleProgressPointerMove(event: PointerEvent): void {
  if (!isDraggingProgress.value) return

  seekProgressFromPointer(event)
}

function handleProgressPointerUp(event: PointerEvent): void {
  if (!isDraggingProgress.value) return

  seekProgressFromPointer(event)
  const target = event.currentTarget as HTMLElement

  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }

  isDraggingProgress.value = false
  draggingProgressRatio.value = null
}

function handleProgressPointerCancel(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement

  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }

  isDraggingProgress.value = false
  draggingProgressRatio.value = null
}

function handleProgressKeydown(event: KeyboardEvent): void {
  if (!playback.state.duration) return

  const seekStepSeconds = event.shiftKey ? 10 : 5

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime - seekStepSeconds)
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime + seekStepSeconds)
  }
}
</script>

<template>
  <div class="track-info-card">
    <!-- Empty state -->
    <div v-if="!playback.state.currentTrack" class="flex flex-col items-center gap-1.5">
      <span class="text-sm font-semibold tracking-wide text-[var(--auralis-text-faint)]">
        Auralis
      </span>
      <div class="track-progress opacity-30">
        <div class="track-progress-fill" style="width: 0%"></div>
      </div>
    </div>

    <!-- Track state -->
    <div v-else>
      <div class="track-info-row">
        <div
          class="track-cover cursor-pointer"
          role="button"
          tabindex="0"
          @click="handleCoverClick"
        >
          <img
            v-if="getArtworkUrl(playback.state.currentTrack.artworkCacheKey) && !imgError"
            :src="getArtworkUrl(playback.state.currentTrack.artworkCacheKey)"
            class="h-full w-full rounded-[inherit] object-cover"
            @error="imgError = true"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="i-lucide-music text-[var(--auralis-text-disabled)]"></span>
          </div>
        </div>
        <div class="track-text">
          <div class="track-title">{{ playback.state.currentTrack.title || 'Unknown Title' }}</div>
          <div class="track-subtitle">
            {{ formatPlaybackSubtitle(playback.state.currentTrack) }}
          </div>
        </div>
      </div>
      <div
        class="track-progress"
        role="slider"
        tabindex="0"
        aria-label="Playback progress"
        aria-valuemin="0"
        :aria-valuemax="Math.round(playback.state.duration)"
        :aria-valuenow="Math.round(playback.state.currentTime)"
        :aria-valuetext="`${progressValueNow}%`"
        @pointerdown="handleProgressPointerDown"
        @pointermove="handleProgressPointerMove"
        @pointerup="handleProgressPointerUp"
        @pointercancel="handleProgressPointerCancel"
        @keydown="handleProgressKeydown"
      >
        <div
          class="track-progress-fill"
          :style="{
            width: progressPercent,
          }"
        ></div>
      </div>
    </div>
  </div>
</template>
