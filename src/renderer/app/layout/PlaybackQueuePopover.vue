<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { PlaybackTrack } from '@renderer/features/playback/types'

const emit = defineEmits<{ close: [] }>()

const playback = usePlayback()
const element = ref<HTMLElement | null>(null)

defineExpose({ element })

const currentTrack = computed(() => playback.state.currentTrack)
const queue = computed(() => playback.state.queue)
const currentIndex = computed(() => playback.state.currentIndex)

const upcomingTracks = computed(() => {
  if (currentIndex.value < 0) return []
  return queue.value.slice(currentIndex.value + 1, currentIndex.value + 101)
})

const isQueueEmpty = computed(() => !currentTrack.value || queue.value.length === 0)
const totalCount = computed(() => queue.value.length)

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

async function playTrack(trackId: number): Promise<void> {
  await playback.playTrackFromQueue(playback.state.queue, trackId)
}

function isActive(trackId: number): boolean {
  return trackId === playback.state.currentTrackId
}

watch(
  () => playback.state.currentIndex,
  () => {
    nextTick(() => {
      scrollRef.value?.scrollTo({ top: 0 })
    })
  },
)

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
