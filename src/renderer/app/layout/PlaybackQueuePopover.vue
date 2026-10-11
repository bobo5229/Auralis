<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlaybackQueue } from '@renderer/features/playback/composables/usePlaybackQueue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'
import type { PlaybackTrack } from '@renderer/features/playback/types'

const emit = defineEmits<{ close: [] }>()
const element = ref<HTMLElement | null>(null)

const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()

defineExpose({ element })

const { currentTrack, currentIndex, upcomingTracks, isQueueEmpty, playTrack, isActive } =
  usePlaybackQueue()

const scrollRef = ref<HTMLElement | null>(null)
const artworkErrorIds = ref<Set<number>>(new Set())

function onArtworkError(trackId: number): void {
  const next = new Set(artworkErrorIds.value)
  next.add(trackId)
  artworkErrorIds.value = next
}

function formatSubtitle(track: PlaybackTrack): string {
  const artist = track.artist ? songValues(track.artist) : null
  const parts = [artist, songText(track.album)].filter(Boolean)
  return parts.length > 0 ? parts.join(' - ') : t('player.unknownArtist')
}

watch(currentIndex, () => {
  nextTick(() => {
    scrollRef.value?.scrollTo({ top: 0 })
  })
})

let restoreOnClose = false
useOverlayFocusTrap({
  isOpen: true,
  container: element,
  initialFocus: () =>
    element.value?.querySelector<HTMLElement>('.queue-item-active button') ?? undefined,
  onEscape: () => {
    restoreOnClose = true
    emit('close')
  },
  restoreFocus: (captured) => {
    if (restoreOnClose) resolveRestorablePlayerTrigger(captured)?.focus()
  },
})
</script>

<template>
  <div
    ref="element"
    class="player-overlay queue-popover"
    role="dialog"
    tabindex="-1"
    :aria-label="t('player.queue')"
  >
    <div class="queue-popover-header">
      <span class="queue-popover-title">{{ t('player.queue') }}</span>
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
            :alt="songText(currentTrack.title) || t('player.unknownTrack')"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable="false"
            @error="onArtworkError(currentTrack.id)"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="h-5 w-5 i-ph-music-notes text-[var(--auralis-text-faint)]" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="queue-item-title">
            {{ songText(currentTrack.title) || t('player.unknownTrack') }}
          </div>
          <div class="queue-item-subtitle">
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
          :aria-label="
            t('player.playTrack', { title: songText(track.title) || t('player.unknownTrack') })
          "
          @click="playTrack(track.id)"
        >
          <div class="queue-item-cover">
            <img
              v-if="getArtworkUrl(track.artworkCacheKey) && !artworkErrorIds.has(track.id)"
              :src="getArtworkUrl(track.artworkCacheKey)!"
              :alt="songText(track.title) || t('player.unknownTrack')"
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              draggable="false"
              @error="onArtworkError(track.id)"
            />
            <div v-else class="flex h-full w-full items-center justify-center">
              <span class="h-5 w-5 i-ph-music-notes text-[var(--auralis-text-faint)]" />
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="queue-item-title">
              {{ songText(track.title) || t('player.unknownTrack') }}
            </div>
            <div class="queue-item-subtitle">{{ formatSubtitle(track) }}</div>
          </div>
        </button>
      </div>
    </template>
  </div>
</template>
