<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlaybackMode } from '@renderer/features/playback/types'
import FluidArtworkBackground from '@renderer/features/playback/components/FluidArtworkBackground.vue'
import { usePlaybackQueue } from '@renderer/features/playback/composables/usePlaybackQueue'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { resolveMiniPopoverStyle, type MiniPopover } from './miniPlayerPopoverContract'

const props = defineProps<{
  active: Exclude<MiniPopover, null>
  artworkUrl: string | null
  isPlaying: boolean
  playbackMode: PlaybackMode
  volume: number
  isMuted: boolean
  bodyWidth: number
  regionHeight: number
}>()

const emit = defineEmits<{
  selectMode: [mode: PlaybackMode]
  setVolume: [volume: number]
  toggleMute: []
}>()

const { t } = useI18n()
const {
  currentTrack,
  currentIndex,
  upcomingTracks,
  isQueueEmpty,
  totalCount,
  playTrack,
  isActive,
} = usePlaybackQueue()
const queueScrollRef = ref<HTMLElement | null>(null)
const imageErrorIds = ref<Set<number>>(new Set())

const surfaceStyle = computed<CSSProperties>(() =>
  resolveMiniPopoverStyle(props.active, props.bodyWidth, props.regionHeight),
)
const volumeStyle = computed(() => ({ '--mini-volume': `${props.volume * 100}%` }))
const volumeIcon = computed(() => {
  if (props.isMuted) return 'i-ion-volume-mute'
  if (props.volume <= 0.33) return 'i-ion-volume-low'
  if (props.volume <= 0.66) return 'i-ion-volume-medium'
  return 'i-ion-volume-high'
})
const modes = computed<Array<{ id: PlaybackMode; label: string; icon: string }>>(() => [
  { id: 'sequential', label: t('player.modeOption.sequential'), icon: 'i-ion-play-skip-forward' },
  { id: 'repeat-all', label: t('player.modeOption.repeat-all'), icon: 'i-ion-repeat' },
  { id: 'repeat-one', label: t('player.modeOption.repeat-one'), icon: 'i-ion-sync' },
  { id: 'shuffle', label: t('player.modeOption.shuffle'), icon: 'i-ion-shuffle' },
  { id: 'album-shuffle', label: t('player.modeOption.album-shuffle'), icon: 'i-ion-disc' },
])

function artworkFailed(trackId: number): boolean {
  return imageErrorIds.value.has(trackId)
}

function handleArtworkError(trackId: number): void {
  imageErrorIds.value = new Set(imageErrorIds.value).add(trackId)
}

watch(currentIndex, () => {
  nextTick(() => queueScrollRef.value?.scrollTo({ top: 0 }))
})
</script>

<template>
  <section class="mini-popover" data-mini-interactive :style="surfaceStyle">
    <FluidArtworkBackground
      v-if="artworkUrl"
      :artwork-url="artworkUrl"
      :active="true"
      :playing="isPlaying"
      class="mini-popover-background"
    />
    <div class="mini-popover-scrim" aria-hidden="true" />

    <template v-if="active === 'queue'">
      <div class="mini-queue-panel" role="dialog" :aria-label="t('player.queue')">
        <div class="mini-panel-heading">
          <span>{{ t('player.queue') }}</span>
          <span>{{ t('player.queueCount', { count: totalCount }) }}</span>
        </div>
        <div v-if="isQueueEmpty" class="mini-empty">{{ t('player.queueEmpty') }}</div>
        <template v-else>
          <div class="mini-queue-section-label">{{ t('player.nowPlaying') }}</div>
          <div
            v-if="currentTrack"
            class="mini-queue-item mini-queue-item--active mini-queue-item--current"
          >
            <div class="mini-queue-cover">
              <img
                v-if="
                  getArtworkUrl(currentTrack.artworkCacheKey) && !artworkFailed(currentTrack.id)
                "
                :src="getArtworkUrl(currentTrack.artworkCacheKey)!"
                alt=""
                draggable="false"
                decoding="async"
                @error="handleArtworkError(currentTrack.id)"
              />
              <span v-else class="h-4 w-4 i-lucide-music" />
            </div>
            <span class="mini-queue-copy">
              <b>{{ currentTrack.title || t('player.unknownTrack') }}</b>
              <small>{{ formatPlaybackSubtitle(currentTrack) }}</small>
            </span>
            <span class="h-4 w-4 i-lucide-volume-2 mini-queue-now" />
          </div>

          <div v-if="upcomingTracks.length > 0" class="mini-queue-section-label">
            {{ t('player.upNext') }}
          </div>
          <div
            v-if="upcomingTracks.length > 0"
            ref="queueScrollRef"
            class="mini-queue-list scrollbar-none"
          >
            <button
              v-for="track in upcomingTracks"
              :key="track.id"
              class="mini-queue-item"
              :class="{ 'mini-queue-item--active': isActive(track.id) }"
              type="button"
              :aria-label="
                t('player.playTrack', { title: track.title || t('player.unknownTrack') })
              "
              @click="playTrack(track.id)"
            >
              <div class="mini-queue-cover">
                <img
                  v-if="getArtworkUrl(track.artworkCacheKey) && !artworkFailed(track.id)"
                  :src="getArtworkUrl(track.artworkCacheKey)!"
                  alt=""
                  draggable="false"
                  loading="lazy"
                  decoding="async"
                  @error="handleArtworkError(track.id)"
                />
                <span v-else class="h-4 w-4 i-lucide-music" />
              </div>
              <span class="mini-queue-copy">
                <b>{{ track.title || t('player.unknownTrack') }}</b>
                <small>{{ formatPlaybackSubtitle(track) }}</small>
              </span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <div
      v-else-if="active === 'mode'"
      class="mini-mode-panel"
      role="menu"
      :aria-label="t('player.mode')"
    >
      <button
        v-for="mode in modes"
        :key="mode.id"
        class="mini-mode-option"
        :class="{ 'mini-mode-option--active': mode.id === playbackMode }"
        type="button"
        role="menuitemradio"
        :aria-checked="mode.id === playbackMode"
        @click="emit('selectMode', mode.id)"
      >
        <span class="h-4 w-4" :class="mode.icon" />
        <span>{{ mode.label }}</span>
        <span v-if="mode.id === playbackMode" class="ml-auto h-4 w-4 i-ion-checkmark" />
      </button>
    </div>

    <div v-else class="mini-volume-panel" role="dialog" :aria-label="t('player.volume')">
      <output class="mini-volume-value"> {{ Math.round(volume * 100) }}% </output>
      <input
        :value="volume"
        class="mini-volume-slider"
        :style="volumeStyle"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :aria-label="t('player.volume')"
        @input="emit('setVolume', Number(($event.target as HTMLInputElement).value))"
      />
      <button
        class="mini-volume-button"
        type="button"
        :aria-label="isMuted ? t('player.unmute') : t('player.mute')"
        :data-tooltip="isMuted ? t('player.unmute') : t('player.mute')"
        @click="emit('toggleMute')"
      >
        <span class="h-4 w-4" :class="volumeIcon" />
      </button>
    </div>
  </section>
</template>

<style scoped src="./miniPlayerPopover.css"></style>
