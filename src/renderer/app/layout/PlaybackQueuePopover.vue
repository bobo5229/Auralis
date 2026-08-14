<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlaybackQueue } from '@renderer/features/playback/composables/usePlaybackQueue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import {
  getPlayerOverlayFocusables,
  resolvePlayerOverlayKeyAction,
  resolveQueueInitialFocusTarget,
} from '@renderer/app/utils/playerOverlayFocus'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'
import type { PlaybackTrack } from '@renderer/features/playback/types'

const props = defineProps<{ presentation: PlayerSurfacePresentation }>()
const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLElement | null>(null)

const { t } = useI18n()

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

function formatSubtitle(track: PlaybackTrack): string {
  const artist = track.artist ? formatArtist(track.artist) : null
  const parts = [artist, track.album].filter(Boolean)
  return parts.length > 0 ? parts.join(' - ') : t('player.unknownArtist')
}

watch(currentIndex, () => {
  nextTick(() => {
    scrollRef.value?.scrollTo({ top: 0 })
  })
})

function getActiveFocusIndex(focusables: HTMLElement[]): number {
  const active = document.activeElement
  return focusables.findIndex((item) => item === active)
}

function handleKeydown(event: KeyboardEvent): void {
  const root = element.value
  if (!root) return

  const focusables = getPlayerOverlayFocusables(root)
  const action = resolvePlayerOverlayKeyAction({
    key: event.key,
    shiftKey: event.shiftKey,
    kind: 'queue',
    focusableCount: focusables.length,
    activeIndex: getActiveFocusIndex(focusables),
  })

  if (action.type === 'dismiss') {
    event.preventDefault()
    emit('close')
    return
  }

  if (action.type === 'keep-root') {
    event.preventDefault()
    root.focus()
    return
  }

  if (action.type === 'cycle-focus') {
    event.preventDefault()
    focusables[action.nextIndex]?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // Initial focus enters the active track's play button, else the first
  // focusable item, else the dialog root itself so Tab never lands behind
  // the dialog (TECHDOC §8.1; empty / single-track queue fallback).
  const root = element.value
  if (root) {
    const focusables = getPlayerOverlayFocusables(root)
    resolveQueueInitialFocusTarget({ root, focusables }).focus()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    ref="element"
    class="player-overlay queue-popover"
    :data-player-presentation="props.presentation"
    role="dialog"
    tabindex="-1"
    :aria-label="t('player.queue')"
  >
    <div class="queue-popover-header">
      <span class="queue-popover-title">{{ t('player.queue') }}</span>
      <span v-if="!isQueueEmpty" class="queue-popover-count">{{
        t('player.queueCount', { count: totalCount })
      }}</span>
    </div>

    <div v-if="isQueueEmpty" class="queue-empty">{{ t('player.queueEmpty') }}</div>

    <template v-else>
      <!-- Now playing -->
      <div class="queue-popover-section-label">{{ t('player.nowPlaying') }}</div>
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

      <div v-if="upcomingTracks.length > 0" class="queue-popover-section-label">
        {{ t('player.upNext') }}
      </div>
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
          :aria-label="t('player.playTrack', { title: track.title || t('player.unknownTrack') })"
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
