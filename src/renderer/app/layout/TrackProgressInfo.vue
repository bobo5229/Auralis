<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'

const playback = usePlayback()
const imgError = ref(false)

watch(
  () => playback.state.currentTrackId,
  () => {
    imgError.value = false
  },
)

function handleCoverClick(): void {
  // Reserved for future full-screen player navigation
}

function handleProgressClick(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  playback.seekByRatio(Math.min(1, Math.max(0, ratio)))
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
      <div class="track-progress" @click="handleProgressClick">
        <div
          class="track-progress-fill"
          :style="{
            width: `${playback.state.duration ? (playback.state.currentTime / playback.state.duration) * 100 : 0}%`,
          }"
        ></div>
      </div>
    </div>
  </div>
</template>
