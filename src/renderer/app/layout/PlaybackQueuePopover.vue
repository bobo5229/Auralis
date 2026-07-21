<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlaybackQueue } from '@renderer/features/playback/composables/usePlaybackQueue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { PlaybackTrack } from '@renderer/features/playback/types'

const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLElement | null>(null)

defineExpose({ element })

const {
  currentTrack,
  currentIndex,
  upcomingTracks,
  isQueueEmpty,
  totalCount,
  playTrack,
  isActive,
} = usePlaybackQueue()

const scrollRef = ref<HTMLElement | null>(null)
const artworkErrorIds = ref<Set<number>>(new Set())

function onArtworkError(trackId: number): void {
  const next = new Set(artworkErrorIds.value)
  next.add(trackId)
  artworkErrorIds.value = next
}

function formatMultiArtist(artist: string): string {
  const parts = artist.split(/\s*;\s*/).filter(Boolean)
  if (parts.length <= 1) return artist
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
}

function formatSubtitle(track: PlaybackTrack): string {
  const artist = track.artist ? formatMultiArtist(track.artist) : null
  const parts = [artist, track.album].filter(Boolean)
  return parts.length > 0 ? parts.join(' - ') : 'Unknown Artist'
}

watch(currentIndex, () => {
  nextTick(() => {
    scrollRef.value?.scrollTo({ top: 0 })
  })
})

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="element" class="queue-popover" role="dialog" aria-label="Playback queue">
    <div class="queue-popover-header">
      <span class="queue-popover-title">播放队列</span>
      <span v-if="!isQueueEmpty" class="queue-popover-count">{{ totalCount }} 首</span>
    </div>

    <div v-if="isQueueEmpty" class="queue-empty">暂无播放队列</div>

    <template v-else>
      <!-- Now playing -->
      <div class="queue-popover-section-label">正在播放</div>
      <div
        v-if="currentTrack"
        class="queue-item queue-item-active"
        :class="{ 'queue-item-active': isActive(currentTrack.id) }"
      >
        <div class="queue-item-cover">
          <img
            v-if="
              getArtworkUrl(currentTrack.artworkCacheKey) && !artworkErrorIds.has(currentTrack.id)
            "
            :src="getArtworkUrl(currentTrack.artworkCacheKey)!"
            :alt="currentTrack.title || 'Unknown Title'"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable="false"
            @error="onArtworkError(currentTrack.id)"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="h-5 w-5 i-lucide-music text-[var(--auralis-text-faint)]" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div
            class="queue-item-title"
            :style="{ color: 'var(--auralis-song-row-now-playing-title)' }"
          >
            {{ currentTrack.title || 'Unknown Title' }}
          </div>
          <div
            class="queue-item-subtitle"
            :style="{ color: 'var(--auralis-song-row-now-playing-artist)' }"
          >
            {{ formatSubtitle(currentTrack) }}
          </div>
        </div>
      </div>

      <!-- Upcoming -->
      <div v-if="upcomingTracks.length > 0" class="queue-popover-section-label">接下来</div>
      <div
        v-if="upcomingTracks.length > 0"
        ref="scrollRef"
        class="queue-popover-scroll scrollbar-none"
      >
        <button
          v-for="track in upcomingTracks"
          :key="track.id"
          class="queue-item"
          :class="{ 'queue-item-active': isActive(track.id) }"
          type="button"
          :aria-label="`Play ${track.title || 'Unknown Title'}`"
          @click="playTrack(track.id)"
        >
          <div class="queue-item-cover">
            <img
              v-if="getArtworkUrl(track.artworkCacheKey) && !artworkErrorIds.has(track.id)"
              :src="getArtworkUrl(track.artworkCacheKey)!"
              :alt="track.title || 'Unknown Title'"
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              draggable="false"
              @error="onArtworkError(track.id)"
            />
            <div v-else class="flex h-full w-full items-center justify-center">
              <span class="h-5 w-5 i-lucide-music text-[var(--auralis-text-faint)]" />
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="queue-item-title">{{ track.title || 'Unknown Title' }}</div>
            <div class="queue-item-subtitle">{{ formatSubtitle(track) }}</div>
          </div>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.queue-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator, #8ab4f8) 72%, white);
  outline-offset: -2px;
}
</style>
