<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import FluidArtworkBackground from '@renderer/features/playback/components/FluidArtworkBackground.vue'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlaybackProgressInteraction } from '@renderer/features/playback/composables/usePlaybackProgressInteraction'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import MiniPlayerPopover from './miniPlayer/MiniPlayerPopover.vue'
import {
  getMiniPopoverRegionHeight,
  MINI_POPOVER_GAP_PX,
  type MiniPopover,
} from './miniPlayer/miniPlayerPopoverContract'
import { useMiniPlayerMetalLight } from './miniPlayer/useMiniPlayerMetalLight'
import { useMiniPlayerWindowSync } from './miniPlayer/useMiniPlayerWindowSync'

const playback = usePlayback()
const { t } = useI18n()
const activePopover = ref<MiniPopover>(null)
const imageErrorIds = ref<Set<number>>(new Set())
const progressFillRef = ref<HTMLElement | null>(null)
const isMiniPlayerActive = ref(false)
const {
  bodySize,
  popoverDirection,
  popoverRegionHeight,
  start: startMiniPlayerWindowSync,
  stop: stopMiniPlayerWindowSync,
  setPopover: syncPopoverWindow,
  restoreMainWindow,
} = useMiniPlayerWindowSync()
const { style: playButtonMetalStyle, reshuffle: reshuffleMetalLight } = useMiniPlayerMetalLight()
const currentTrack = computed(() => playback.state.currentTrack)
const currentArtworkCacheKey = computed(() => currentTrack.value?.artworkCacheKey ?? null)
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey)
const artworkUrl = computed(() => getArtworkUrl(currentArtworkCacheKey.value))

function renderProgressRatio(ratio: number): void {
  const fill = progressFillRef.value
  if (!fill) return
  fill.style.transform = `scaleX(${ratio})`
  fill.parentElement?.style.setProperty('--auralis-progress-value', ratio.toString())
}

const {
  draggingRatio: draggingProgressRatio,
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
  active: isMiniPlayerActive,
  seekByRatio: playback.seekByRatio,
  seekTo: playback.seekTo,
  renderRatio: renderProgressRatio,
  resolveSeekStepSeconds: (shiftKey) => (shiftKey ? 10 : 5),
})

const displayCurrentTime = computed(() => {
  if (draggingProgressRatio.value !== null && playback.state.duration > 0) {
    return draggingProgressRatio.value * playback.state.duration
  }
  return playback.state.currentTime
})
const currentTimeLabel = computed(() => formatDuration(displayCurrentTime.value) || '0:00')
const durationLabel = computed(() => formatDuration(playback.state.duration) || '0:00')
const albumAccentColor = computed(() => {
  const primaryColor = albumPalette.value.accents[0]?.rgb
  if (!primaryColor || !currentTrack.value) return null
  return `rgb(${primaryColor.r} ${primaryColor.g} ${primaryColor.b})`
})
const canvasStyle = computed(
  () =>
    ({
      width: `${bodySize.value.width}px`,
      minHeight: `${bodySize.value.height}px`,
      '--mini-popover-gap': `${MINI_POPOVER_GAP_PX}px`,
      '--auralis-active-album-accent':
        albumAccentColor.value ?? 'var(--auralis-sidebar-active-indicator)',
    }) as CSSProperties,
)
const miniPlayerStyle = computed(
  () =>
    ({
      width: `${bodySize.value.width}px`,
      height: `${bodySize.value.height}px`,
      '--mini-cover-size': `${bodySize.value.coverSize}px`,
      '--auralis-active-album-accent':
        albumAccentColor.value ?? 'var(--auralis-sidebar-active-indicator)',
    }) as CSSProperties,
)

/** Dock bar short labels (serif text buttons). Full names live in the mode popover. */
const modeDockLabel = computed(() => {
  const labels: Record<PlaybackMode, string> = {
    sequential: t('player.modeDock.sequential'),
    'repeat-all': t('player.modeDock.repeat-all'),
    'repeat-one': t('player.modeDock.repeat-one'),
    shuffle: t('player.modeDock.shuffle'),
    'album-shuffle': t('player.modeDock.album-shuffle'),
  }
  return labels[playback.state.playbackMode]
})

const volumeDockLabel = computed(() =>
  playback.state.isMuted ? t('player.mute') : t('player.volume'),
)

function artworkFailed(trackId: number): boolean {
  return imageErrorIds.value.has(trackId)
}

function handleArtworkError(trackId: number): void {
  imageErrorIds.value = new Set(imageErrorIds.value).add(trackId)
}

async function setPopover(next: MiniPopover): Promise<void> {
  activePopover.value = next
  const regionHeight = getMiniPopoverRegionHeight(next)
  popoverRegionHeight.value = regionHeight
  await syncPopoverWindow(next !== null, regionHeight)
}

function togglePopover(popover: Exclude<MiniPopover, null>): void {
  void setPopover(activePopover.value === popover ? null : popover)
}

function selectPlaybackMode(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  closePopover()
}

function closePopover(): void {
  if (!activePopover.value) return
  void setPopover(null)
}

function handleOutsidePointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!(target instanceof Element)) {
    closePopover()
    return
  }

  if (target.closest('.mini-popover')) return

  const trigger = target.closest<HTMLElement>('[data-mini-popover-trigger]')
  if (trigger?.dataset.miniPopoverTrigger === activePopover.value) return

  closePopover()
}

/** Direction A: no window chrome — double-click sleeve / plaque to return. */
function handleRestoreGesture(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (
    target.closest(
      'button, input, [role="slider"], a, .mini-actions-dock, .mini-transport, .mini-progress-block, .mini-popover',
    )
  ) {
    return
  }
  restoreMainWindow()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePopover()
}

onMounted(() => {
  isMiniPlayerActive.value = true
  document.documentElement.classList.add('mini-player-root')
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  document.addEventListener('keydown', handleKeydown)
  startMiniPlayerWindowSync()
})

onUnmounted(() => {
  isMiniPlayerActive.value = false
  document.documentElement.classList.remove('mini-player-root')
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  document.removeEventListener('keydown', handleKeydown)
  stopMiniPlayerWindowSync()
})
</script>

<template>
  <main
    class="mini-player-canvas"
    :class="`mini-player-canvas--${popoverDirection}`"
    :style="canvasStyle"
  >
    <MiniPlayerPopover
      v-if="activePopover"
      :active="activePopover"
      :artwork-url="artworkUrl"
      :is-playing="playback.state.isPlaying"
      :playback-mode="playback.state.playbackMode"
      :volume="playback.state.volume"
      :is-muted="playback.state.isMuted"
      :body-width="bodySize.width"
      :region-height="popoverRegionHeight"
      @select-mode="selectPlaybackMode"
      @set-volume="playback.setVolume"
      @toggle-mute="playback.toggleMute"
    />

    <!-- Vertical listening plaque (zero chrome): solid surface + fluid art scrim -->
    <section
      class="mini-player"
      :class="{ 'mini-player--playing': playback.state.isPlaying }"
      :style="miniPlayerStyle"
      @dblclick="handleRestoreGesture"
    >
      <FluidArtworkBackground
        v-if="artworkUrl"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="mini-player-background"
      />
      <div class="mini-player-scrim" aria-hidden="true" />
      <div class="mini-drag-region" aria-hidden="true" />

      <div class="mini-body">
        <div
          class="mini-cover-stage"
          :title="t('miniPlayer.doubleClickRestore')"
          data-mini-interactive
        >
          <div
            class="mini-cover"
            :class="{ 'mini-cover--playing': playback.state.isPlaying && currentTrack }"
            role="button"
            tabindex="0"
            :aria-label="t('miniPlayer.doubleClickRestore')"
            data-mini-interactive
            @dblclick.stop="restoreMainWindow"
            @keydown.enter.prevent="restoreMainWindow"
          >
            <img
              v-if="
                currentTrack &&
                getArtworkUrl(currentTrack.artworkCacheKey) &&
                !artworkFailed(currentTrack.id)
              "
              :src="getArtworkUrl(currentTrack.artworkCacheKey)!"
              alt=""
              draggable="false"
              @error="handleArtworkError(currentTrack.id)"
            />
            <span v-else class="h-8 w-8 i-lucide-music mini-cover-fallback" />
          </div>
        </div>

        <div class="mini-meta" data-mini-interactive :title="t('miniPlayer.doubleClickRestore')">
          <strong class="mini-title">{{ currentTrack?.title || 'Auralis' }}</strong>
          <span class="mini-subtitle">
            {{
              currentTrack ? formatPlaybackSubtitle(currentTrack) : t('miniPlayer.nothingPlaying')
            }}
          </span>
        </div>

        <div class="mini-progress-block" data-mini-interactive>
          <div
            class="mini-progress track-progress"
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
            <div ref="progressFillRef" class="track-progress-fill" />
          </div>
          <div class="mini-time-row">
            <span>{{ currentTimeLabel }}</span>
            <span>{{ durationLabel }}</span>
          </div>
        </div>

        <div class="mini-transport" data-mini-interactive>
          <button
            class="mini-icon-button mini-icon-button--lg"
            type="button"
            :aria-label="t('player.previous')"
            :data-tooltip="t('player.previous')"
            @click="playback.playPrevious()"
          >
            <span class="mini-skip-glyph mini-skip-glyph--previous" aria-hidden="true" />
          </button>
          <button
            class="mini-play-button"
            type="button"
            :style="playButtonMetalStyle"
            :aria-label="playback.state.isPlaying ? t('player.pause') : t('player.play')"
            :data-tooltip="playback.state.isPlaying ? t('player.pause') : t('player.play')"
            @click="playback.togglePlayPause()"
            @mouseleave="reshuffleMetalLight"
          >
            <span
              class="h-6 w-6"
              :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            />
          </button>
          <button
            class="mini-icon-button mini-icon-button--lg"
            type="button"
            :aria-label="t('player.next')"
            :data-tooltip="t('player.next')"
            @click="playback.playNext()"
          >
            <span class="mini-skip-glyph" aria-hidden="true" />
          </button>
        </div>

        <!-- Control Center–style media bar: full content width, three equal text cells -->
        <div class="mini-actions-dock" data-mini-interactive>
          <LiquidGlassPanel class="mini-actions-glass" :radius="18">
            <div class="mini-actions" role="toolbar" :aria-label="t('miniPlayer.toolbarAria')">
              <button
                class="mini-actions-button"
                :class="{ 'mini-actions-button--active': activePopover === 'queue' }"
                type="button"
                :aria-label="t('player.queue')"
                :data-tooltip="t('player.queue')"
                data-mini-popover-trigger="queue"
                @click="togglePopover('queue')"
              >
                <span class="mini-actions-label">{{ t('miniPlayer.queueShort') }}</span>
              </button>
              <button
                class="mini-actions-button"
                :class="{ 'mini-actions-button--active': activePopover === 'mode' }"
                type="button"
                :aria-label="t('miniPlayer.modeAria', { mode: modeDockLabel })"
                :data-tooltip="t('player.mode')"
                data-mini-popover-trigger="mode"
                @click="togglePopover('mode')"
              >
                <span class="mini-actions-label">{{ modeDockLabel }}</span>
              </button>
              <button
                class="mini-actions-button"
                :class="{ 'mini-actions-button--active': activePopover === 'volume' }"
                type="button"
                :aria-label="volumeDockLabel"
                :data-tooltip="t('player.volume')"
                data-mini-popover-trigger="volume"
                @click="togglePopover('volume')"
              >
                <span class="mini-actions-label">{{ volumeDockLabel }}</span>
              </button>
            </div>
          </LiquidGlassPanel>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* ── Root / canvas ─────────────────────────────────────── */
:global(.mini-player-root),
:global(.mini-player-root body),
:global(.mini-player-root #app) {
  width: 100%;
  min-height: 100%;
  overflow: hidden;
  /* Must stay fully clear so rounded corners don't reveal a rectangular plate */
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.mini-player-canvas {
  display: flex;
  gap: var(--mini-popover-gap, 10px);
  pointer-events: none;
}

.mini-player-canvas--above {
  flex-direction: column;
  justify-content: flex-end;
}

.mini-player-canvas--below {
  flex-direction: column-reverse;
  justify-content: flex-end;
}

/*
 * Plaque + popover shell (pre–liquid-glass surface)
 * Solid floating surface + fluid artwork scrim. Dock island keeps its own glass.
 * Outer drop shadow omitted: window size == plaque size, so outer shadow only
 * fills square corner wedges (reads as a second rectangular container).
 * OS window shadow is disabled in mini mode.
 */
.mini-player {
  pointer-events: auto;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  color: var(--auralis-text-primary, #f5f5f5);
  border: 1px solid
    color-mix(in srgb, var(--auralis-border-subtle, rgb(127 127 127 / 0.28)) 80%, transparent);
  background: color-mix(in srgb, var(--auralis-surface-floating, #1c1e22) 94%, black);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.06) inset;
}

/* ── Vertical plaque shell ─────────────────────────────── */
.mini-player {
  border-radius: 24px;
}

.mini-player-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Cover-forward scrim: light over art, denser toward controls */
.mini-player-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgb(8 10 14 / 0.18) 0%,
      rgb(8 10 14 / 0.08) 38%,
      rgb(8 10 14 / 0.72) 100%
    ),
    radial-gradient(ellipse 90% 55% at 50% 18%, rgb(0 0 0 / 0.05), transparent 70%);
}

.mini-drag-region {
  position: absolute;
  inset: 0;
  z-index: 2;
  -webkit-app-region: drag;
  cursor: pointer;
}

/*
 * Stack (zero window chrome):
 *  cover stage
 *  meta
 *  progress + times
 *  transport
 *  utilities
 */
.mini-body {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Horizontal pad must match MINI_PAD_X in shared/constants/miniPlayer.ts */
  /* Extra top pad replaces the old title-bar row — keeps sleeve from kissing the edge */
  /* Bottom pad: air under Control Center dock (sync MINI_CHROME_HEIGHT if changed) */
  padding: 22px 28px 32px;
  box-sizing: border-box;
}

.mini-cover,
.mini-cover-stage,
.mini-meta,
.mini-progress-block,
.mini-transport,
.mini-actions-dock {
  -webkit-app-region: no-drag;
}

/* ── Cover stage (signature) ─────────────────────────────
 * Cover size is fixed by native window metrics (--mini-cover-size).
 * Side padding + stage gap keep the sleeve from filling the plaque edge-to-edge.
 * Double-click sleeve / meta returns to the main window (no title-bar controls).
 */
.mini-cover-stage {
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  height: var(--mini-cover-size, 248px);
  margin-bottom: 18px;
}

.mini-cover {
  width: var(--mini-cover-size, 248px);
  height: var(--mini-cover-size, 248px);
  aspect-ratio: 1 / 1;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-surface-raised, #34363a) 80%, black);
  color: var(--auralis-text-faint, #a0a0a5);
  cursor: pointer;
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.1) inset,
    0 14px 32px rgb(0 0 0 / 0.32);
  transition: box-shadow 0.3s ease;
}

.mini-cover:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--auralis-active-album-accent) 70%, white);
  outline-offset: 3px;
}

.mini-cover--playing {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--auralis-active-album-accent) 78%, white),
    0 0 0 7px color-mix(in srgb, var(--auralis-active-album-accent) 16%, transparent),
    0 18px 40px rgb(0 0 0 / 0.38);
}

.mini-cover img {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  object-position: center;
  display: block;
}

.mini-cover-fallback {
  opacity: 0.65;
}

/* ── Meta ──────────────────────────────────────────────── */
.mini-meta {
  flex: none;
  display: grid;
  gap: 6px;
  min-width: 0;
  text-align: center;
  padding: 0 2px 12px;
}

.mini-title,
.mini-subtitle {
  font-family:
    'Auralis Desktop Lyrics SC', 'Songti SC', 'STSong', 'Noto Serif SC', 'Times New Roman', serif;
}

.mini-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.25;
}

.mini-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text-secondary, #b5b5ba);
  font-size: 12px;
  line-height: 1.3;
}

/* ── Progress + times ──────────────────────────────────── */
.mini-progress-block {
  flex: none;
  display: grid;
  gap: 8px;
  padding: 0 2px 14px;
}

.mini-progress {
  width: 100%;
  outline: none;
}

.mini-progress .track-progress-fill {
  width: 100%;
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
}

.mini-time-row {
  display: flex;
  justify-content: space-between;
  color: var(--auralis-text-faint, #9a9aa0);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* ── Transport ─────────────────────────────────────────── */
.mini-transport {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding-bottom: 12px;
}

/*
 * Control Center–style media bar (scheme A):
 * full content width, rounded module, three equal cells.
 */
.mini-actions-dock {
  flex: none;
  display: flex;
  width: 100%;
  padding: 0;
  -webkit-app-region: no-drag;
}

.mini-actions-glass {
  flex: none;
  display: block;
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  /* Fully clear fill — shape from rim + blur only, no RGB edge dispersion */
  background: transparent !important;
  border: 1px solid rgb(190 210 255 / 0.14);
  box-shadow:
    0 1px 1px rgb(0 6 18 / 0.22),
    0 4px 12px rgb(0 10 28 / 0.16),
    inset 0 1px 0 rgb(230 240 255 / 0.16),
    inset 0 -1px 0 rgb(0 8 24 / 0.22) !important;
}

/* Panel content must span the bar or the toolbar shrink-wraps to icon width */
.mini-actions-glass :deep(.liquid-glass-panel__content) {
  display: block;
  width: 100%;
  box-sizing: border-box;
}

/* Soften LiquidGlassPanel default frosted plate so fill stays clear */
.mini-actions-glass :deep(.liquid-glass-panel__highlight) {
  opacity: 0.35;
}

/* Kill LiquidGlassPanel's chromatic refraction rim (red/blue fringe) on this island only */
.mini-actions-glass :deep(.liquid-glass-panel__refraction) {
  display: none;
}

.mini-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  justify-items: stretch;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 4px 6px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

/* Serif text cells — equal thirds, no icon chrome */
.mini-actions-button {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
  height: 34px;
  margin: 0;
  place-items: center;
  border: 0;
  border-radius: 14px;
  justify-self: stretch;
  color: var(--auralis-text-secondary, #cacace);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.14s ease,
    box-shadow 0.18s ease;
}

.mini-actions-label {
  display: block;
  overflow: hidden;
  max-width: 100%;
  padding: 0 2px;
  font-family:
    'Auralis Desktop Lyrics SC', 'Songti SC', 'STSong', 'Noto Serif SC', 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Island hover: color only — no circular fill blob */
.mini-actions-button:hover {
  background: transparent;
  color: var(--auralis-text-primary, #fff);
  box-shadow: none;
}

.mini-actions-button--active,
.mini-actions-button--active:hover {
  background: transparent;
  color: var(--auralis-active-album-accent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--auralis-active-album-accent) 35%, transparent),
    0 0 12px color-mix(in srgb, var(--auralis-active-album-accent) 22%, transparent);
}

.mini-icon-button,
.mini-play-button {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  color: var(--auralis-text-secondary, #cacace);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.14s ease,
    background 0.14s ease,
    transform 0.12s ease,
    box-shadow 0.18s ease;
}

.mini-icon-button--lg {
  width: 40px;
  height: 40px;
}

.mini-skip-glyph {
  position: relative;
  display: block;
  width: 19px;
  height: 14px;
}

.mini-skip-glyph::before,
.mini-skip-glyph::after {
  position: absolute;
  top: 0;
  width: 10px;
  height: 14px;
  background: currentColor;
  clip-path: path(
    'M 1.65 0.35C 0.92 -0.12 0 0.4 0 1.28V 12.72C 0 13.6 0.92 14.12 1.65 13.65L 9.35 8.72C 10.22 8.16 10.22 5.84 9.35 5.28Z'
  );
  content: '';
}

.mini-skip-glyph::before {
  left: 0;
}

.mini-skip-glyph::after {
  right: 0;
}

.mini-skip-glyph--previous {
  transform: rotate(180deg);
}

.mini-icon-button:hover,
.mini-icon-button--active {
  color: var(--auralis-text-primary, #fff);
  background: rgb(255 255 255 / 0.12);
}

.mini-icon-button--active {
  color: var(--auralis-active-album-accent);
}

.mini-icon-button:active,
.mini-play-button:active {
  transform: scale(0.95);
}

.mini-play-button {
  isolation: isolate;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: #121214;
  background: var(--auralis-text-primary, #f4f4f5);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.28);
  overflow: visible;
  transition:
    color 0.14s ease,
    background 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.12s ease;
}

.mini-play-button > span {
  position: relative;
  z-index: 1;
}

/* Specular sweep layer (metallic reflection on hover when playing) */
.mini-play-button::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    var(--metal-sweep-angle, 118deg),
    transparent 28%,
    rgb(255 255 255 / 0.06) 40%,
    rgb(255 255 255 / 0.62) 50%,
    rgb(255 255 255 / 0.1) 60%,
    transparent 72%
  );
  background-size: 240% 240%;
  background-position: var(--metal-sweep-from, 130%) 45%;
  mix-blend-mode: soft-light;
  transition:
    opacity 0.2s ease,
    background-position 0.5s cubic-bezier(0.25, 0.8, 0.35, 1);
}

/*
 * Playing: accent-tinted metal (A).
 * Highlight / dark / body angle come from CSS vars, reshuffled on mouseleave.
 */
.mini-player--playing .mini-play-button {
  color: #121214;
  background:
    radial-gradient(
      ellipse var(--metal-hi-w, 125%) var(--metal-hi-h, 90%) at var(--metal-hi-x, 28%)
        var(--metal-hi-y, 16%),
      rgb(255 255 255 / 0.58),
      transparent 40%
    ),
    radial-gradient(
      ellipse var(--metal-lo-w, 95%) var(--metal-lo-h, 80%) at var(--metal-lo-x, 78%)
        var(--metal-lo-y, 78%),
      rgb(0 0 0 / 0.28),
      transparent 52%
    ),
    linear-gradient(
      var(--metal-body-angle, 155deg),
      color-mix(in srgb, var(--auralis-active-album-accent) 42%, white) 0%,
      var(--auralis-active-album-accent) 46%,
      color-mix(in srgb, var(--auralis-active-album-accent) 48%, black) 100%
    );
  box-shadow:
    0 1.5px 0 rgb(255 255 255 / 0.5) inset,
    0 -1.5px 0 rgb(0 0 0 / 0.28) inset,
    0 0 0 1px color-mix(in srgb, var(--auralis-active-album-accent) 35%, black) inset,
    0 0 0 4px color-mix(in srgb, var(--auralis-active-album-accent) 22%, transparent),
    0 10px 24px color-mix(in srgb, var(--auralis-active-album-accent) 28%, rgb(0 0 0 / 0.4));
  transition:
    color 0.14s ease,
    background 0.35s ease,
    box-shadow 0.22s ease,
    transform 0.12s ease;
}

.mini-player--playing .mini-play-button:hover {
  background:
    radial-gradient(
      ellipse calc(var(--metal-hi-w, 125%) + 8%) calc(var(--metal-hi-h, 90%) + 6%) at
        var(--metal-hi-hover-x, 32%) var(--metal-hi-hover-y, 12%),
      rgb(255 255 255 / 0.72),
      transparent 42%
    ),
    radial-gradient(
      ellipse var(--metal-lo-w, 95%) var(--metal-lo-h, 80%) at var(--metal-lo-hover-x, 80%)
        var(--metal-lo-hover-y, 80%),
      rgb(0 0 0 / 0.22),
      transparent 52%
    ),
    linear-gradient(
      var(--metal-body-angle, 155deg),
      color-mix(in srgb, var(--auralis-active-album-accent) 38%, white) 0%,
      color-mix(in srgb, var(--auralis-active-album-accent) 88%, white) 38%,
      var(--auralis-active-album-accent) 55%,
      color-mix(in srgb, var(--auralis-active-album-accent) 52%, black) 100%
    );
  box-shadow:
    0 2px 0 rgb(255 255 255 / 0.58) inset,
    0 -1px 0 rgb(0 0 0 / 0.22) inset,
    0 0 0 1px color-mix(in srgb, var(--auralis-active-album-accent) 30%, black) inset,
    0 0 0 5px color-mix(in srgb, var(--auralis-active-album-accent) 28%, transparent),
    0 12px 28px color-mix(in srgb, var(--auralis-active-album-accent) 32%, rgb(0 0 0 / 0.42));
}

.mini-player--playing .mini-play-button:hover::before {
  opacity: 1;
  background-position: var(--metal-sweep-to, -25%) 45%;
}

/* Idle (paused): mild lift only, keep solid face */
.mini-play-button:hover {
  filter: brightness(1.04);
}

.mini-player--playing .mini-play-button:hover {
  filter: none;
}

/* Tooltips — prefer above on lower controls to stay in window */
.mini-icon-button[data-tooltip]::after,
.mini-play-button[data-tooltip]::after {
  position: absolute;
  z-index: 20;
  bottom: calc(100% + 8px);
  left: 50%;
  top: auto;
  padding: 4px 7px;
  border-radius: 6px;
  color: white;
  background: rgb(0 0 0 / 0.82);
  content: attr(data-tooltip);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(2px);
  transition:
    opacity 0.14s,
    transform 0.14s;
}

.mini-icon-button[data-tooltip]:hover::after,
.mini-play-button[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%);
}

@media (prefers-reduced-motion: reduce) {
  .mini-icon-button,
  .mini-play-button,
  .mini-cover,
  .mini-icon-button::after,
  .mini-play-button::after {
    transition: none;
  }

  .mini-play-button::before {
    transition: opacity 0.15s ease;
  }

  .mini-player--playing .mini-play-button:hover::before {
    /* Static sheen — no sweep */
    background-position: 50% 45%;
  }

  .mini-progress .track-progress-fill::after {
    animation: none;
  }
}

@media (prefers-contrast: more) {
  /* High contrast: need a plate so icons stay legible */
  .mini-actions-glass {
    background: rgb(22 24 28 / 0.88) !important;
    border-color: rgb(255 255 255 / 0.28);
  }
}
</style>
