<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { useTrackLyrics } from '@renderer/features/lyrics/composables/useTrackLyrics'
import { useFullscreenLyricsViewport } from '@renderer/features/lyrics/composables/useFullscreenLyricsViewport'
import type { LyricLine } from '@renderer/features/lyrics/types'
import FluidArtworkBackground from '@renderer/features/playback/components/FluidArtworkBackground.vue'
import { usePlaybackProgressInteraction } from '@renderer/features/playback/composables/usePlaybackProgressInteraction'

const skipPreviousIconUrl = new URL(
  '../../features/playback/assets/skip-previous-rounded.svg',
  import.meta.url,
).href
const skipNextIconUrl = new URL(
  '../../features/playback/assets/skip-next-rounded.svg',
  import.meta.url,
).href
const playIconUrl = new URL('../../features/playback/assets/play.svg', import.meta.url).href

const playback = usePlayback()
const { t } = useI18n()
const { isFullscreenPlayerOpen, closeFullscreenPlayer } = useFullscreenPlayer()
const {
  status: lyricsStatus,
  rawLyrics,
  parsedLines,
  activeIndex,
  isPrelude,
  showPrelude,
  preludeLitDotCount,
} = useTrackLyrics()

const imgError = ref(false)
const progressFillRef = ref<HTMLElement | null>(null)
const lyricsScrollRef = ref<HTMLElement | null>(null)
const lyricsTrackRef = ref<HTMLElement | null>(null)

const artworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
const artworkUrl = computed(() => getArtworkUrl(artworkCacheKey.value))
const title = computed(() => playback.state.currentTrack?.title || 'Unknown Title')
const subtitle = computed(() =>
  playback.state.currentTrack ? formatPlaybackSubtitle(playback.state.currentTrack) : 'No track',
)

const currentTimeLabel = computed(() => formatTime(playback.state.currentTime))
const remainingTimeLabel = computed(() => {
  const remaining = Math.max(0, playback.state.duration - playback.state.currentTime)
  return playback.state.duration ? `-${formatTime(remaining)}` : '-0:00'
})

const fullscreenLyricLines = computed<LyricLine[]>(() => {
  if (lyricsStatus.value === 'plain' && rawLyrics.value) {
    return rawLyrics.value
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line, index) => ({
        id: `plain-${index}`,
        timeSeconds: index,
        text: line,
      }))
  }

  return lyricsStatus.value === 'lrc' ? parsedLines.value : []
})

const volumeIconClass = computed(() => {
  if (playback.state.isMuted) return 'i-lucide-volume-x'
  if (playback.state.volume <= 0) return 'i-lucide-volume'
  if (playback.state.volume <= 0.33) return 'i-lucide-volume'
  if (playback.state.volume <= 0.66) return 'i-lucide-volume-1'
  return 'i-lucide-volume-2'
})

const volumeFillStyle = computed(() => ({
  clipPath: `inset(0 ${(1 - playback.state.volume) * 100}% 0 0 round 999px)`,
}))

const repeatButtonLabel = computed(() => {
  if (playback.state.playbackMode === 'repeat-all') return t('fullscreen.repeatEnableOne')
  if (playback.state.playbackMode === 'repeat-one') return t('fullscreen.repeatDisable')
  return t('fullscreen.repeatEnableAll')
})

const repeatIconClass = computed(() =>
  playback.state.playbackMode === 'repeat-one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat',
)

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function renderProgressRatio(ratio: number): void {
  const fill = progressFillRef.value
  if (!fill) return
  fill.style.clipPath = `inset(0 ${(1 - ratio) * 100}% 0 0 round 999px)`
}

const {
  valueNow: progressValueNow,
  onPointerDown: handleProgressPointerDown,
  onPointerMove: handleProgressPointerMove,
  onPointerUp: handleProgressPointerUp,
  onPointerCancel: handleProgressPointerCancel,
  onKeydown: handleProgressKeydown,
} = usePlaybackProgressInteraction({
  duration: computed(() => playback.state.duration),
  currentTime: computed(() => playback.state.currentTime),
  isPlaying: computed(() => playback.state.isPlaying),
  active: isFullscreenPlayerOpen,
  seekByRatio: playback.seekByRatio,
  seekTo: playback.seekTo,
  renderRatio: renderProgressRatio,
  resolveSeekStepSeconds: (shiftKey) => (shiftKey ? 10 : 5),
})

const {
  topPadding: lyricsTopPadding,
  bottomPadding: lyricsBottomPadding,
  pauseAutoFollow: pauseFullscreenLyricAutoFollow,
} = useFullscreenLyricsViewport({
  scrollRef: lyricsScrollRef,
  trackRef: lyricsTrackRef,
  currentTrackId: computed(() => playback.state.currentTrackId),
  lyricsStatus,
  lineCount: computed(() => fullscreenLyricLines.value.length),
  activeIndex,
  isPrelude,
  showPrelude,
  isOpen: isFullscreenPlayerOpen,
})

watch(
  () => playback.state.currentTrackId,
  () => {
    imgError.value = false
  },
)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeFullscreenPlayer()
  }
}

function handleVolumeInput(event: Event): void {
  playback.setVolume(Number((event.target as HTMLInputElement).value))
}

function handleShuffleClick(): void {
  playback.setPlaybackMode(playback.state.playbackMode === 'shuffle' ? 'sequential' : 'shuffle')
}

function handleRepeatClick(): void {
  if (playback.state.playbackMode === 'repeat-all') {
    playback.setPlaybackMode('repeat-one')
    return
  }
  if (playback.state.playbackMode === 'repeat-one') {
    playback.setPlaybackMode('sequential')
    return
  }
  playback.setPlaybackMode('repeat-all')
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fullscreen-player">
      <section
        v-if="isFullscreenPlayerOpen"
        class="fullscreen-player"
        :aria-label="t('fullscreen.overlayAria')"
      >
        <div class="fullscreen-drag-region" aria-hidden="true" />
        <FluidArtworkBackground
          :artwork-url="artworkUrl"
          :active="isFullscreenPlayerOpen"
          :playing="playback.state.isPlaying"
        />

        <div class="fullscreen-player-left">
          <div class="fullscreen-player-artwork">
            <img
              v-if="artworkUrl && !imgError"
              :src="artworkUrl"
              class="h-full w-full object-cover"
              @error="imgError = true"
            />
            <div v-else class="fullscreen-player-artwork-placeholder">
              <span class="i-lucide-music h-14 w-14" />
            </div>
          </div>

          <div class="fullscreen-player-meta-row">
            <div class="fullscreen-player-meta">
              <h1>{{ title }}</h1>
              <p>{{ subtitle }}</p>
            </div>
          </div>

          <div class="fullscreen-player-progress-group">
            <div
              class="fullscreen-player-progress"
              role="slider"
              tabindex="0"
              :aria-label="t('player.progress')"
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
              <div ref="progressFillRef" class="fullscreen-player-progress-fill"></div>
            </div>
            <div class="fullscreen-player-time-row">
              <span>{{ currentTimeLabel }}</span>
              <span>{{ remainingTimeLabel }}</span>
            </div>
          </div>

          <div class="fullscreen-player-control-stack">
            <div class="fullscreen-player-controls">
              <button
                type="button"
                :aria-label="t('player.modeOption.shuffle')"
                :class="{
                  'fullscreen-player-control-active': playback.state.playbackMode === 'shuffle',
                }"
                @click="handleShuffleClick"
              >
                <span class="i-lucide-shuffle h-4.5 w-4.5" />
              </button>
              <button
                class="fullscreen-player-skip"
                type="button"
                :aria-label="t('player.previous')"
                @click="playback.playPrevious"
              >
                <img
                  class="fullscreen-player-filled-icon fullscreen-player-filled-skip-icon"
                  :src="skipPreviousIconUrl"
                  alt=""
                  aria-hidden="true"
                />
              </button>
              <button
                class="fullscreen-player-play"
                type="button"
                :aria-label="playback.state.isPlaying ? t('player.pause') : t('player.play')"
                @click="playback.togglePlayPause"
              >
                <span
                  v-if="playback.state.isPlaying"
                  class="fullscreen-player-filled-icon"
                  :class="{ 'fullscreen-player-filled-pause': playback.state.isPlaying }"
                />
                <img
                  v-else
                  class="fullscreen-player-filled-icon fullscreen-player-filled-play"
                  :src="playIconUrl"
                  alt=""
                  aria-hidden="true"
                />
              </button>
              <button
                class="fullscreen-player-skip"
                type="button"
                :aria-label="t('player.next')"
                @click="playback.playNext"
              >
                <img
                  class="fullscreen-player-filled-icon fullscreen-player-filled-skip-icon"
                  :src="skipNextIconUrl"
                  alt=""
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                :aria-label="repeatButtonLabel"
                :class="{
                  'fullscreen-player-control-active':
                    playback.state.playbackMode === 'repeat-all' ||
                    playback.state.playbackMode === 'repeat-one',
                }"
                @click="handleRepeatClick"
              >
                <span class="h-4.5 w-4.5" :class="repeatIconClass" />
              </button>
            </div>

            <div class="fullscreen-player-volume">
              <button
                type="button"
                :aria-label="playback.state.isMuted ? t('player.unmute') : t('player.mute')"
                @click="playback.toggleMute"
              >
                <span class="h-5 w-5" :class="volumeIconClass" />
              </button>
              <div class="fullscreen-player-volume-track">
                <div class="fullscreen-player-volume-fill" :style="volumeFillStyle"></div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="playback.state.volume"
                  :aria-label="t('player.volume')"
                  @input="handleVolumeInput"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="fullscreen-player-lyrics">
          <div v-if="lyricsStatus === 'loading'" class="fullscreen-player-lyrics-empty">
            Loading lyrics...
          </div>
          <div
            v-else-if="fullscreenLyricLines.length > 0"
            ref="lyricsScrollRef"
            class="fullscreen-player-lyrics-scroll"
            aria-live="polite"
            tabindex="0"
            @wheel="pauseFullscreenLyricAutoFollow"
            @pointerdown="pauseFullscreenLyricAutoFollow"
            @touchstart="pauseFullscreenLyricAutoFollow"
            @keydown="pauseFullscreenLyricAutoFollow"
          >
            <div ref="lyricsTrackRef" class="fullscreen-player-lyrics-track">
              <div :style="{ height: `${lyricsTopPadding}px` }"></div>
              <div
                v-if="showPrelude"
                class="fullscreen-player-lyric-line fullscreen-player-prelude"
                :class="{
                  'fullscreen-player-lyric-active': isPrelude,
                  'fullscreen-player-lyric-upcoming': !isPrelude,
                }"
                :aria-label="t('fullscreen.lyricsStartingSoon')"
                data-lyric-prelude
              >
                <span
                  v-for="dot in 3"
                  :key="dot"
                  class="fullscreen-player-prelude-dot"
                  :class="{ 'fullscreen-player-prelude-dot-lit': dot <= preludeLitDotCount }"
                ></span>
              </div>
              <div
                v-for="(line, index) in fullscreenLyricLines"
                :key="line.id"
                v-memo="[activeIndex === index, line.text]"
                class="fullscreen-player-lyric-line"
                :class="{
                  'fullscreen-player-lyric-active':
                    lyricsStatus === 'lrc' ? activeIndex === index : index === 0,
                  'fullscreen-player-lyric-upcoming':
                    lyricsStatus === 'lrc' ? activeIndex !== index && line.text : index !== 0,
                  'fullscreen-player-lyric-empty': !line.text,
                }"
                :data-lyric-index="index"
              >
                {{ line.text || ' ' }}
              </div>
              <div :style="{ height: `${lyricsBottomPadding}px` }"></div>
            </div>
          </div>
          <div v-else class="fullscreen-player-lyrics-empty">{{ t('player.lyricsEmpty') }}</div>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fullscreen-player {
  --auralis-text: rgba(246, 242, 234, 0.94);
  --auralis-text-muted: rgba(246, 242, 234, 0.62);
  --auralis-text-disabled: rgba(246, 242, 234, 0.28);
  --auralis-progress-track: rgba(246, 242, 234, 0.24);
  --auralis-progress-fill: #e1ddd6;
  --auralis-volume-fill: #e1ddd6;
  --auralis-artwork-placeholder-bg: rgba(246, 242, 234, 0.12);
  --fullscreen-lyrics-left-bleed: clamp(32px, 2.6vw, 56px);

  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-columns: minmax(420px, 43vw) minmax(0, 1fr);
  gap: clamp(46px, 6vw, 112px);
  padding: clamp(64px, 10vh, 110px) clamp(70px, 10vw, 176px);
  color: var(--auralis-text);
  background: #15181d;
  overflow: hidden;
}

.fullscreen-drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 140px;
  height: 36px;
  -webkit-app-region: drag;
  z-index: 101;
}

.fullscreen-player-left,
.fullscreen-player-lyrics {
  position: relative;
  z-index: 1;
}

.fullscreen-player-left {
  display: flex;
  min-width: 0;
  width: min(32vw, 600px);
  flex-direction: column;
  justify-content: center;
  justify-self: end;
  transform: translateX(calc(-1 * clamp(104px, 8vw, 176px)));
}

.fullscreen-player-artwork {
  width: min(32vw, 600px);
  max-width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 10px;
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow: 0 30px 80px rgba(31, 35, 40, 0.18);
}

.fullscreen-player-artwork-placeholder {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-disabled);
}

.fullscreen-player-meta-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 22px;
}

.fullscreen-player-meta {
  flex: 1;
  min-width: 0;
}

.fullscreen-player-meta h1 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(18px, 1.45vw, 25px);
  font-weight: 800;
  line-height: 1.18;
}

.fullscreen-player-meta p {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text-muted);
  font-size: clamp(14px, 1.1vw, 19px);
  font-weight: 700;
}

.fullscreen-player-progress-group {
  margin-top: 22px;
}

.fullscreen-player-progress {
  position: relative;
  height: 5px;
  cursor: pointer;
  border-radius: 999px;
  background: var(--auralis-progress-track);
  touch-action: none;
}

.fullscreen-player-progress-fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--auralis-progress-fill);
  clip-path: inset(0 100% 0 0 round 999px);
  will-change: clip-path;
}

.fullscreen-player-time-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--auralis-text-muted);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fullscreen-player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 2vw, 30px);
  margin-top: 18px;
}

.fullscreen-player-control-stack {
  transform: translateY(-16px);
}

.fullscreen-player-controls button,
.fullscreen-player-volume button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-muted);
  transition: color 140ms ease;
}

.fullscreen-player-controls button:hover,
.fullscreen-player-volume button:hover {
  color: var(--auralis-text);
}

.fullscreen-player-control-active {
  color: var(--auralis-text) !important;
}

.fullscreen-player-skip {
  height: 48px;
  width: 48px;
}

.fullscreen-player-play {
  height: 62px;
  width: 62px;
}

.fullscreen-player-filled-icon {
  position: relative;
  display: inline-block;
  color: currentColor;
  opacity: 0.94;
  transition:
    opacity 140ms ease,
    color 140ms ease;
}

.fullscreen-player-filled-play {
  display: block;
  width: 56px;
  height: 56px;
  object-fit: contain;
  transform: translateX(3px);
}

.fullscreen-player-play:hover .fullscreen-player-filled-play {
  opacity: 0.62;
}

.fullscreen-player-filled-pause {
  width: 30px;
  height: 34px;
  color: var(--auralis-text);
}

.fullscreen-player-play:hover .fullscreen-player-filled-pause {
  color: var(--auralis-text-muted);
}

.fullscreen-player-filled-pause::before,
.fullscreen-player-filled-pause::after {
  content: '';
  position: absolute;
  top: 0;
  width: 10px;
  height: 34px;
  border-radius: 3px;
  background: currentColor;
}

.fullscreen-player-filled-pause::before {
  left: 2px;
}

.fullscreen-player-filled-pause::after {
  right: 2px;
}

.fullscreen-player-filled-skip-icon {
  display: block;
  width: 38px;
  height: 32px;
  object-fit: contain;
}

.fullscreen-player-skip:hover .fullscreen-player-filled-skip-icon {
  opacity: 0.62;
}

.fullscreen-player-volume {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
  width: 100%;
}

.fullscreen-player-volume-track {
  position: relative;
  height: 5px;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: var(--auralis-progress-track);
}

.fullscreen-player-volume-fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--auralis-volume-fill);
  clip-path: inset(0 20% 0 0 round 999px);
  pointer-events: none;
  will-change: clip-path;
}

.fullscreen-player-volume input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  appearance: none;
  border-radius: 999px;
  background: transparent;
}

.fullscreen-player-volume input::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 999px;
  background: transparent;
}

.fullscreen-player-volume input::-webkit-slider-thumb {
  width: 0;
  height: 0;
  margin-top: 0;
  -webkit-appearance: none;
  appearance: none;
  border: 0;
  background: transparent;
}

.fullscreen-player-volume input::-moz-range-track {
  height: 5px;
  border-radius: 999px;
  background: transparent;
}

.fullscreen-player-volume input::-moz-range-thumb {
  width: 0;
  height: 0;
  border: 0;
  background: transparent;
}

.fullscreen-player-lyrics {
  min-height: 0;
  display: flex;
  align-items: stretch;
  padding: 4vh 0;
  overflow: visible;
  transform: translateX(calc(-1 * clamp(52px, 5.6vw, 124px)));
}

.fullscreen-player-lyrics-scroll {
  box-sizing: border-box;
  width: calc(min(900px, 100%) + var(--fullscreen-lyrics-left-bleed));
  height: 100%;
  margin-left: calc(-1 * var(--fullscreen-lyrics-left-bleed));
  padding-left: var(--fullscreen-lyrics-left-bleed);
  overflow: auto;
  contain: layout style;
  overscroll-behavior: contain;
  scrollbar-width: none;
  will-change: scroll-position;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 7%,
    #000 90%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0, #000 7%, #000 90%, transparent 100%);
}

.fullscreen-player-lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.fullscreen-player-lyrics-track {
  box-sizing: border-box;
  min-height: 100%;
  padding-right: 18.6992%;
  will-change: transform;
}

.fullscreen-player-lyric-line {
  overflow-wrap: anywhere;
  font-size: clamp(22px, 2.25vw, 39px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0;
  transform-origin: left center;
  transition:
    transform 420ms cubic-bezier(0.22, 0.72, 0.18, 1),
    opacity 300ms ease,
    filter 300ms ease;
}

.fullscreen-player-prelude {
  display: flex;
  align-items: center;
  gap: 0.22em;
  min-height: 1.2em;
}

.fullscreen-player-prelude-dot {
  width: 0.2em;
  height: 0.2em;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.2;
  transform: scale(0.78);
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 0.72, 0.18, 1);
}

.fullscreen-player-prelude-dot-lit {
  box-shadow:
    0 0 0.18em currentColor,
    0 0 0.42em currentColor,
    0 0 0.72em rgba(255, 255, 255, 0.42);
  opacity: 1;
  transform: scale(1);
}

.fullscreen-player-lyric-line + .fullscreen-player-lyric-line {
  margin-top: clamp(26px, 4vh, 52px);
}

.fullscreen-player-lyric-active {
  color: var(--auralis-text);
  filter: blur(0);
  opacity: 1;
  transform: scale(1.23);
}

.fullscreen-player-lyric-upcoming {
  color: var(--auralis-text);
  filter: blur(3px);
  opacity: 0.34;
  transform: scale(1);
}

.fullscreen-player-lyric-empty {
  min-height: 1.2em;
}

.fullscreen-player-lyrics-empty {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-muted);
  font-size: clamp(21px, 2.15vw, 34px);
  font-weight: 800;
  opacity: 0.42;
  text-align: center;
}

.fullscreen-player-enter-active,
.fullscreen-player-leave-active {
  transition: opacity 180ms ease;
}

.fullscreen-player-enter-from,
.fullscreen-player-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .fullscreen-player {
    grid-template-columns: 1fr;
    gap: 28px;
    overflow-y: auto;
    padding: 56px 28px 40px;
  }

  .fullscreen-player-left {
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    justify-self: center;
    width: 100%;
    transform: none;
  }

  .fullscreen-player-artwork {
    width: min(62vw, 320px);
  }

  .fullscreen-player-lyrics {
    height: 52vh;
    transform: none;
  }

  .fullscreen-player-meta-row {
    width: min(62vw, 320px);
    text-align: left;
  }
}
</style>
