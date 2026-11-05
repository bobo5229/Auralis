<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PlayingIndicator from '@renderer/features/appearance/components/PreferredPlayingIndicator.vue'
import {
  formatPlaybackClock,
  PLAYBACK_CLOCK_EMPTY,
} from '@renderer/features/playback/utils/formatPlaybackClock'

const props = withDefaults(
  defineProps<{
    information: { id: number; title: string; artist: string; album: string }
    focused?: boolean
    identity?: string
    isPlaying: boolean
    currentTime: number
    duration: number
    albumAvailable?: boolean
  }>(),
  { focused: false, identity: undefined, albumAvailable: false },
)
const emit = defineEmits<{ togglePlayback: []; locateAlbum: [] }>()
const { t } = useI18n()
const expanded = ref(false)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

function clearCollapseTimer(): void {
  if (collapseTimer !== null) clearTimeout(collapseTimer)
  collapseTimer = null
}

watch(
  [() => props.focused, () => props.identity, () => props.information.id],
  () => {
    clearCollapseTimer()
    expanded.value = props.focused
    if (props.focused) {
      collapseTimer = setTimeout(() => {
        collapseTimer = null
        expanded.value = false
      }, 4000)
    }
  },
  { immediate: true },
)

function toggleInformation(): void {
  clearCollapseTimer()
  expanded.value = !expanded.value
}
onBeforeUnmount(clearCollapseTimer)

const showDetails = computed(() => !props.focused || expanded.value)
const progress = computed(() => {
  if (
    !Number.isFinite(props.duration) ||
    props.duration <= 0 ||
    !Number.isFinite(props.currentTime)
  )
    return 0
  return Math.min(1, Math.max(0, props.currentTime / props.duration))
})
const currentClock = computed(() => formatPlaybackClock(props.currentTime))
const durationClock = computed(() =>
  props.duration > 0 ? formatPlaybackClock(props.duration) : PLAYBACK_CLOCK_EMPTY,
)
const wavePath = [
  'M 2 6.2 C 18 6.4, 22 4.8, 39 5.1',
  'C 55 5.4, 61 7, 78 6.4 C 96 5.6, 102 4.4, 119 5',
  'C 135 5.7, 144 6.9, 160 6.1 C 178 5.2, 182 4.7, 198 5.4',
  'C 214 6.2, 226 6.7, 238 5.7',
].join(' ')
</script>

<template>
  <div
    class="cd-playback-info"
    :class="{
      'cd-playback-info--focused': focused,
      'cd-playback-info--expanded': focused && expanded,
    }"
  >
    <div class="cd-current-track-heading">
      <PlayingIndicator v-if="focused" class="cd-current-track-indicator" :playing="isPlaying" />
      <button
        v-else
        v-tooltip="t(isPlaying ? 'player.pause' : 'player.play')"
        type="button"
        class="cd-current-track-toggle"
        :aria-label="t(isPlaying ? 'player.pause' : 'player.play')"
        @click="emit('togglePlayback')"
      >
        <span
          :class="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        ></span>
      </button>
      <div class="cd-current-track-identity" role="status" aria-live="polite" aria-atomic="true">
        <Transition name="cd-current-track-fade">
          <div :key="information.id" class="cd-current-track-text">
            <span
              v-tooltip.overflow="information.title"
              class="cd-current-track-title"
              dir="auto"
              >{{ information.title }}</span
            >
            <span
              v-if="showDetails"
              v-tooltip.overflow="information.artist"
              class="cd-current-track-artist"
              :aria-hidden="!information.artist"
              dir="auto"
              >{{ information.artist }}</span
            >
          </div>
        </Transition>
      </div>
    </div>
    <template v-if="showDetails">
      <span
        v-if="focused && information.album"
        v-tooltip.overflow="information.album"
        class="cd-current-track-album"
        dir="auto"
        >{{ information.album }}</span
      >
      <button
        v-else-if="information.album"
        v-tooltip.fast="information.album"
        type="button"
        class="cd-current-track-album cd-current-track-album-link"
        :disabled="!albumAvailable"
        @click="emit('locateAlbum')"
      >
        <span class="cd-current-track-album-name" dir="auto">{{ information.album }}</span>
        <span class="i-lucide-arrow-up-right h-3 w-3 shrink-0" aria-hidden="true"></span>
      </button>
      <div class="cd-current-track-timeline">
        <span v-if="!focused" class="cd-current-track-time" dir="ltr">{{ currentClock }}</span>
        <svg
          class="cd-current-track-progress"
          :viewBox="focused ? '1.15 3.4 237.7 4.6' : '0 0 240 12'"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            :d="wavePath"
            fill="none"
            stroke="var(--cd-border-row)"
            stroke-width="1.4"
            stroke-linecap="round"
          />
          <path
            :d="wavePath"
            pathLength="100"
            :stroke-dasharray="`${progress * 100} 100`"
            fill="none"
            stroke="var(--cd-progress-fill)"
            stroke-width="1.7"
            stroke-linecap="round"
          />
        </svg>
        <span v-if="!focused" class="cd-current-track-time" dir="ltr">{{ durationClock }}</span>
      </div>
    </template>
    <button
      v-if="focused"
      v-tooltip="t('playback.nowPlaying')"
      type="button"
      class="cd-current-track-handle"
      :aria-label="t('playback.nowPlaying')"
      :aria-expanded="expanded"
      @click="toggleInformation"
    >
      <span class="cd-current-track-chevron i-lucide-chevron-up h-4 w-4" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.cd-playback-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-family: var(--cd-font-display);
  color: var(--cd-text-browsing);
  text-align: right;
  pointer-events: none;
}
.cd-current-track-heading {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cd-current-track-identity {
  display: grid;
  min-width: 0;
}
.cd-current-track-text {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cd-current-track-title,
.cd-current-track-artist,
.cd-current-track-album,
.cd-current-track-album-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cd-current-track-title,
.cd-current-track-artist,
.cd-current-track-album {
  pointer-events: auto;
}
.cd-current-track-title {
  font-size: var(--cd-type-playback-size);
  line-height: var(--cd-type-playback-line-height);
}
.cd-current-track-artist {
  min-height: var(--cd-type-playback-artist-line-height);
  font-size: var(--cd-type-playback-artist-size);
  line-height: var(--cd-type-playback-artist-line-height);
  color: var(--cd-text-muted);
}
.cd-current-track-album {
  font-size: var(--cd-type-playback-artist-size);
  line-height: var(--cd-type-playback-artist-line-height);
  color: var(--cd-text-album);
  font-style: italic;
  font-synthesis: none;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
button:hover:not(:disabled) {
  color: var(--cd-text);
}
button:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 2px;
}
.cd-current-track-toggle {
  width: 24px;
  height: 24px;
}
.cd-current-track-album-link {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  width: 100%;
  font-size: var(--cd-type-playback-artist-size);
  font-style: italic;
  line-height: var(--cd-type-playback-artist-line-height);
  color: var(--cd-text-album);
}
.cd-current-track-album-link:disabled {
  cursor: default;
}
.cd-current-track-timeline {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 16px;
}
.cd-current-track-time {
  font-family: var(--cd-font-number);
  font-size: var(--cd-type-time-size);
  line-height: var(--cd-type-time-line-height);
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--cd-text-muted);
}
.cd-current-track-progress {
  width: 100%;
  min-width: 0;
  height: 12px;
  overflow: visible;
}
.cd-playback-info--focused {
  --cd-focused-playback-info-width: min(
    356px,
    max(0px, calc(31cqw - 24px)),
    max(0px, calc(32cqw - 84px))
  );
  position: absolute;
  left: 0;
  bottom: 32px;
  z-index: 7;
  box-sizing: border-box;
  justify-content: center;
  width: calc(var(--cd-focused-playback-info-width) + 48px);
  height: 38px;
  padding: 8px 32px 8px 12px;
  border: 1px solid var(--cd-border-row);
  border-left: 0;
  overflow: hidden;
  transition: height 180ms ease;
}
.cd-playback-info--expanded {
  height: 94px;
}
.cd-playback-info--focused .cd-current-track-title {
  font-size: var(--cd-type-focus-song-size);
  line-height: var(--cd-type-focus-song-line-height);
}
.cd-playback-info--focused .cd-current-track-artist {
  min-height: var(--cd-type-focus-artist-line-height);
  font-size: var(--cd-type-focus-artist-size);
  line-height: var(--cd-type-focus-artist-line-height);
}
.cd-playback-info--focused .cd-current-track-heading {
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 6px;
  text-align: left;
}
.cd-playback-info--focused .cd-current-track-album {
  padding-left: 20px;
  text-align: left;
}
.cd-playback-info--focused .cd-current-track-timeline {
  display: block;
  height: 5px;
  padding-left: 20px;
}
.cd-playback-info--focused .cd-current-track-progress {
  display: block;
  height: 5px;
}
.cd-current-track-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 24px;
  border-radius: 0;
  color: var(--cd-text-muted);
}
.cd-current-track-chevron {
  transition: transform 180ms ease;
}
.cd-playback-info--expanded .cd-current-track-chevron {
  transform: rotate(180deg);
}
.cd-current-track-fade-enter-active,
.cd-current-track-fade-leave-active {
  transition: opacity 180ms ease;
}
.cd-current-track-fade-enter-from,
.cd-current-track-fade-leave-to {
  opacity: 0;
}
@container (max-width: 600px) {
  .cd-playback-info--focused {
    --cd-focused-playback-info-width: min(
      276px,
      max(0px, calc(31cqw - 24px)),
      max(0px, calc(32cqw - 84px))
    );
  }
}
:where([data-reduced-motion='true']) .cd-playback-info,
:where([data-reduced-motion='true']) .cd-current-track-chevron,
:where([data-reduced-motion='true']) .cd-current-track-fade-enter-active,
:where([data-reduced-motion='true']) .cd-current-track-fade-leave-active {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .cd-playback-info,
  .cd-current-track-chevron,
  .cd-current-track-fade-enter-active,
  .cd-current-track-fade-leave-active {
    transition: none;
  }
}
</style>
