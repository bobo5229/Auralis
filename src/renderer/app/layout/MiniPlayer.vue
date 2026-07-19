<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import FluidArtworkBackground from '@renderer/features/playback/components/FluidArtworkBackground.vue'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { PlaybackMode, PlaybackTrack } from '@renderer/features/playback/types'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { subscribeVisualFrame } from '@renderer/features/playback/utils/visualFrameScheduler'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { auralis } from '@renderer/shared/ipc/client'
import { getDefaultMiniPlayerBodySize } from '@shared/constants/miniPlayer'
import type { MiniPlayerBodySize, MiniPlayerPopoverDirection } from '@shared/ipc/contracts'

type MiniPopover = 'queue' | 'mode' | 'volume' | null

const playback = usePlayback()
const activePopover = ref<MiniPopover>(null)
const popoverDirection = ref<MiniPlayerPopoverDirection>('below')
const imageErrorIds = ref<Set<number>>(new Set())
const isDraggingProgress = ref(false)
const draggingProgressRatio = ref<number | null>(null)
const progressFillRef = ref<HTMLElement | null>(null)
let unsubscribeMiniPlayerState: (() => void) | undefined
let progressFrameUnsubscribe: (() => void) | null = null
let progressAnchorTime = 0
let progressAnchorAt = 0

const miniWindow = auralis.window
const bodySize = ref<MiniPlayerBodySize>(getDefaultMiniPlayerBodySize())
const currentTrack = computed(() => playback.state.currentTrack)
const currentArtworkCacheKey = computed(() => currentTrack.value?.artworkCacheKey ?? null)
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey)
const artworkUrl = computed(() => getArtworkUrl(currentArtworkCacheKey.value))
const progressRatio = computed(() => {
  if (!playback.state.duration) return 0
  if (draggingProgressRatio.value !== null) return draggingProgressRatio.value
  return Math.min(1, Math.max(0, playback.state.currentTime / playback.state.duration))
})
const progressValueNow = computed(() => Math.round(progressRatio.value * 100))
const displayCurrentTime = computed(() => {
  if (draggingProgressRatio.value !== null && playback.state.duration > 0) {
    return draggingProgressRatio.value * playback.state.duration
  }
  return playback.state.currentTime
})
const currentTimeLabel = computed(() => formatDuration(displayCurrentTime.value) || '0:00')
const durationLabel = computed(() => formatDuration(playback.state.duration) || '0:00')
const volumeStyle = computed(() => ({ '--mini-volume': `${playback.state.volume * 100}%` }))
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
const popoverStyle = computed(
  () =>
    ({
      width: `${bodySize.value.width}px`,
    }) as CSSProperties,
)

function applyBodyFromState(body: MiniPlayerBodySize | undefined): void {
  if (!body?.coverSize || !body.width || !body.height) return
  bodySize.value = {
    coverSize: body.coverSize,
    width: body.width,
    height: body.height,
  }
}

const modeIcon = computed(() => {
  const icons: Record<PlaybackMode, string> = {
    sequential: 'i-lucide-list-end',
    'repeat-all': 'i-lucide-repeat',
    'repeat-one': 'i-lucide-repeat-1',
    shuffle: 'i-lucide-shuffle',
    'album-shuffle': 'i-lucide-disc-3',
  }
  return icons[playback.state.playbackMode]
})

const volumeIcon = computed(() => {
  if (playback.state.isMuted) return 'i-lucide-volume-x'
  if (playback.state.volume <= 0.33) return 'i-lucide-volume'
  if (playback.state.volume <= 0.66) return 'i-lucide-volume-1'
  return 'i-lucide-volume-2'
})

const modes: Array<{ id: PlaybackMode; label: string; icon: string }> = [
  { id: 'sequential', label: '顺序播放', icon: 'i-lucide-list-end' },
  { id: 'repeat-all', label: '列表循环', icon: 'i-lucide-repeat' },
  { id: 'repeat-one', label: '单曲循环', icon: 'i-lucide-repeat-1' },
  { id: 'shuffle', label: '随机播放', icon: 'i-lucide-shuffle' },
  { id: 'album-shuffle', label: '专辑随机', icon: 'i-lucide-disc-3' },
]

function artworkFailed(trackId: number): boolean {
  return imageErrorIds.value.has(trackId)
}

function handleArtworkError(trackId: number): void {
  imageErrorIds.value = new Set(imageErrorIds.value).add(trackId)
}

async function setPopover(next: MiniPopover): Promise<void> {
  activePopover.value = next
  const height = next === 'queue' ? 300 : next === 'mode' ? 220 : next === 'volume' ? 92 : 0
  const result = await miniWindow.setMiniPlayerPopover({
    open: next !== null,
    direction: popoverDirection.value,
    height,
  })
  if (result?.popover.direction) popoverDirection.value = result.popover.direction
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

function renderVisualProgress(now: number): void {
  const fill = progressFillRef.value
  if (!fill) return

  let ratio = draggingProgressRatio.value
  if (ratio === null) {
    const elapsed = playback.state.isPlaying ? Math.max(0, now - progressAnchorAt) / 1000 : 0
    const visualTime = Math.min(playback.state.duration, progressAnchorTime + elapsed)
    ratio =
      playback.state.duration > 0
        ? Math.min(1, Math.max(0, visualTime / playback.state.duration))
        : 0
  }

  fill.style.transform = `scaleX(${ratio})`
  fill.parentElement?.style.setProperty('--auralis-progress-value', ratio.toString())
}

function syncProgressAnchor(): void {
  progressAnchorTime = playback.state.currentTime
  progressAnchorAt = performance.now()
  renderVisualProgress(progressAnchorAt)
}

function syncProgressFrameSubscription(): void {
  const shouldAnimate = Boolean(currentTrack.value && playback.state.isPlaying)
  if (shouldAnimate) {
    if (!progressFrameUnsubscribe) {
      progressFrameUnsubscribe = subscribeVisualFrame(renderVisualProgress)
    }
  } else {
    progressFrameUnsubscribe?.()
    progressFrameUnsubscribe = null
  }
  syncProgressAnchor()
}

watch(
  () => playback.state.currentTrackId,
  () => nextTick(syncProgressFrameSubscription),
)

watch(
  () => [playback.state.currentTime, playback.state.duration, playback.state.isPlaying],
  syncProgressFrameSubscription,
)

function progressRatioFromEvent(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function updateDraggingProgressFromPointer(event: PointerEvent): void {
  if (!playback.state.duration) return
  const target = event.currentTarget as HTMLElement
  draggingProgressRatio.value = progressRatioFromEvent(event, target)
}

function handleProgressPointerDown(event: PointerEvent): void {
  if (!playback.state.duration) return
  const target = event.currentTarget as HTMLElement
  isDraggingProgress.value = true
  target.setPointerCapture(event.pointerId)
  event.preventDefault()
  updateDraggingProgressFromPointer(event)
}

function handleProgressPointerMove(event: PointerEvent): void {
  if (!isDraggingProgress.value) return
  updateDraggingProgressFromPointer(event)
}

function handleProgressPointerUp(event: PointerEvent): void {
  if (!isDraggingProgress.value) return

  updateDraggingProgressFromPointer(event)
  if (draggingProgressRatio.value !== null) playback.seekByRatio(draggingProgressRatio.value)

  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  isDraggingProgress.value = false
  draggingProgressRatio.value = null
}

function handleProgressPointerCancel(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  isDraggingProgress.value = false
  draggingProgressRatio.value = null
}

function handleProgressKeydown(event: KeyboardEvent): void {
  if (!playback.state.duration) return
  const delta = event.shiftKey ? 10 : 5
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime - delta)
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime + delta)
  }
}

async function playQueueTrack(track: PlaybackTrack): Promise<void> {
  await playback.playTrackFromQueue(playback.state.queue, track.id)
}

function restoreMainWindow(): void {
  void miniWindow.restoreFromMiniPlayer()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePopover()
}

onMounted(() => {
  document.documentElement.classList.add('mini-player-root')
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  document.addEventListener('keydown', handleKeydown)
  void miniWindow.getMiniPlayerState().then((state) => {
    popoverDirection.value = state.popover.direction
    applyBodyFromState(state.body)
  })
  unsubscribeMiniPlayerState = miniWindow.onMiniPlayerStateChanged((state) => {
    popoverDirection.value = state.popover.direction
    applyBodyFromState(state.body)
  })
  syncProgressFrameSubscription()
})

onUnmounted(() => {
  document.documentElement.classList.remove('mini-player-root')
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  document.removeEventListener('keydown', handleKeydown)
  unsubscribeMiniPlayerState?.()
  progressFrameUnsubscribe?.()
  progressFrameUnsubscribe = null
})
</script>

<template>
  <main
    class="mini-player-canvas"
    :class="`mini-player-canvas--${popoverDirection}`"
    :style="canvasStyle"
  >
    <section v-if="activePopover" class="mini-popover" data-mini-interactive :style="popoverStyle">
      <div
        v-if="activePopover === 'queue'"
        class="mini-queue-panel"
        role="dialog"
        aria-label="播放队列"
      >
        <div class="mini-panel-heading">
          <span>播放队列</span>
          <span>{{ playback.state.queue.length }} 首</span>
        </div>
        <div v-if="playback.state.queue.length === 0" class="mini-empty">暂无播放队列</div>
        <div v-else class="mini-queue-list scrollbar-none">
          <button
            v-for="track in playback.state.queue"
            :key="track.id"
            class="mini-queue-item"
            :class="{ 'mini-queue-item--active': track.id === playback.state.currentTrackId }"
            type="button"
            :aria-label="`播放 ${track.title || '未知歌曲'}`"
            @click="playQueueTrack(track)"
          >
            <div class="mini-queue-cover">
              <img
                v-if="getArtworkUrl(track.artworkCacheKey) && !artworkFailed(track.id)"
                :src="getArtworkUrl(track.artworkCacheKey)!"
                alt=""
                draggable="false"
                @error="handleArtworkError(track.id)"
              />
              <span v-else class="h-4 w-4 i-lucide-music" />
            </div>
            <span class="mini-queue-copy">
              <b>{{ track.title || '未知歌曲' }}</b>
              <small>{{ formatPlaybackSubtitle(track) }}</small>
            </span>
            <span
              v-if="track.id === playback.state.currentTrackId"
              class="h-4 w-4 i-lucide-volume-2 mini-queue-now"
            />
          </button>
        </div>
      </div>

      <div
        v-else-if="activePopover === 'mode'"
        class="mini-mode-panel"
        role="menu"
        aria-label="播放模式"
      >
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="mini-mode-option"
          :class="{ 'mini-mode-option--active': mode.id === playback.state.playbackMode }"
          type="button"
          role="menuitemradio"
          :aria-checked="mode.id === playback.state.playbackMode"
          @click="selectPlaybackMode(mode.id)"
        >
          <span class="h-4 w-4" :class="mode.icon" />
          <span>{{ mode.label }}</span>
          <span
            v-if="mode.id === playback.state.playbackMode"
            class="ml-auto h-4 w-4 i-lucide-check"
          />
        </button>
      </div>

      <div v-else class="mini-volume-panel" role="dialog" aria-label="音量">
        <div class="mini-panel-heading">
          <span>音量</span>
          <span>{{ Math.round(playback.state.volume * 100) }}%</span>
        </div>
        <div class="mini-volume-control">
          <button
            class="mini-icon-button"
            type="button"
            aria-label="静音"
            data-tooltip="静音"
            @click="playback.toggleMute()"
          >
            <span class="h-4 w-4" :class="volumeIcon" />
          </button>
          <input
            :value="playback.state.volume"
            class="mini-volume-slider"
            :style="volumeStyle"
            type="range"
            min="0"
            max="1"
            step="0.01"
            aria-label="音量"
            @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </section>

    <!-- Vertical listening plaque: cover stage → meta → progress → transport → utilities -->
    <section
      class="mini-player"
      :class="{ 'mini-player--playing': playback.state.isPlaying }"
      :style="miniPlayerStyle"
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
        <header class="mini-chrome" data-mini-interactive>
          <div class="mini-window-actions">
            <button
              class="mini-chrome-button"
              type="button"
              aria-label="最小化"
              data-tooltip="最小化"
              @click="auralis.window.minimize()"
            >
              <span class="h-3.5 w-3.5 i-lucide-minus" />
            </button>
            <button
              class="mini-chrome-button"
              type="button"
              aria-label="恢复主界面"
              data-tooltip="恢复主界面"
              @click="restoreMainWindow"
            >
              <span class="h-3.5 w-3.5 i-lucide-panel-top-open" />
            </button>
            <button
              class="mini-chrome-button mini-chrome-button--close"
              type="button"
              aria-label="关闭 Auralis"
              data-tooltip="关闭 Auralis"
              @click="auralis.window.close()"
            >
              <span class="h-3.5 w-3.5 i-lucide-x" />
            </button>
          </div>
        </header>

        <div class="mini-cover-stage">
          <div
            class="mini-cover"
            :class="{ 'mini-cover--playing': playback.state.isPlaying && currentTrack }"
            data-mini-interactive
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

        <div class="mini-meta" data-mini-interactive>
          <strong class="mini-title">{{ currentTrack?.title || 'Auralis' }}</strong>
          <span class="mini-subtitle">
            {{ currentTrack ? formatPlaybackSubtitle(currentTrack) : '尚未播放' }}
          </span>
        </div>

        <div class="mini-progress-block" data-mini-interactive>
          <div
            class="mini-progress track-progress"
            role="slider"
            tabindex="0"
            aria-label="播放进度"
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
            aria-label="上一首"
            data-tooltip="上一首"
            @click="playback.playPrevious()"
          >
            <span class="mini-skip-glyph mini-skip-glyph--previous" aria-hidden="true" />
          </button>
          <button
            class="mini-play-button"
            type="button"
            :aria-label="playback.state.isPlaying ? '暂停' : '播放'"
            :data-tooltip="playback.state.isPlaying ? '暂停' : '播放'"
            @click="playback.togglePlayPause()"
          >
            <span
              class="h-6 w-6"
              :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            />
          </button>
          <button
            class="mini-icon-button mini-icon-button--lg"
            type="button"
            aria-label="下一首"
            data-tooltip="下一首"
            @click="playback.playNext()"
          >
            <span class="mini-skip-glyph" aria-hidden="true" />
          </button>
        </div>

        <div class="mini-actions" data-mini-interactive>
          <button
            class="mini-icon-button"
            :class="{ 'mini-icon-button--active': activePopover === 'queue' }"
            type="button"
            aria-label="播放队列"
            data-tooltip="播放队列"
            data-mini-popover-trigger="queue"
            @click="togglePopover('queue')"
          >
            <span class="h-4 w-4 i-lucide-list-music" />
          </button>
          <button
            class="mini-icon-button"
            :class="{ 'mini-icon-button--active': activePopover === 'mode' }"
            type="button"
            aria-label="播放模式"
            data-tooltip="播放模式"
            data-mini-popover-trigger="mode"
            @click="togglePopover('mode')"
          >
            <span class="h-4 w-4" :class="modeIcon" />
          </button>
          <button
            class="mini-icon-button"
            :class="{ 'mini-icon-button--active': activePopover === 'volume' }"
            type="button"
            aria-label="音量"
            data-tooltip="音量"
            data-mini-popover-trigger="volume"
            @click="togglePopover('volume')"
          >
            <span class="h-4 w-4" :class="volumeIcon" />
          </button>
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
  background: transparent !important;
}

.mini-player-canvas {
  display: flex;
  gap: 10px;
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

.mini-player,
.mini-popover {
  pointer-events: auto;
  border: 1px solid
    color-mix(in srgb, var(--auralis-border-subtle, rgb(127 127 127 / 0.28)) 80%, transparent);
  background: color-mix(in srgb, var(--auralis-surface-floating, #1c1e22) 94%, black);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.06) inset,
    0 22px 56px rgb(0 0 0 / 0.36);
}

/* ── Vertical plaque shell ─────────────────────────────── */
.mini-player {
  position: relative;
  isolation: isolate;
  border-radius: 24px;
  overflow: hidden;
  color: var(--auralis-text-primary, #f5f5f5);
}

.mini-player-background {
  position: absolute;
  inset: 0;
  z-index: 0;
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
}

/*
 * Stack:
 *  chrome (overlay)
 *  cover stage (flex)
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
  padding: 10px 16px 16px;
  box-sizing: border-box;
}

.mini-chrome,
.mini-cover,
.mini-meta,
.mini-progress-block,
.mini-transport,
.mini-actions,
.mini-popover {
  -webkit-app-region: no-drag;
}

/* ── Chrome ────────────────────────────────────────────── */
.mini-chrome {
  display: flex;
  justify-content: flex-end;
  flex: none;
  margin: 0 -4px 6px 0;
}

.mini-window-actions {
  display: flex;
  gap: 1px;
  padding: 2px;
  border-radius: 10px;
  background: rgb(0 0 0 / 0.22);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.05) inset;
}

.mini-chrome-button {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--auralis-text-faint, #9a9aa0);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.14s ease,
    background 0.14s ease;
}

.mini-chrome-button:hover {
  color: var(--auralis-text-primary, #fff);
  background: rgb(255 255 255 / 0.12);
}

.mini-chrome-button--close:hover {
  color: #fff;
  background: #c94343;
}

.mini-chrome-button:active {
  transform: scale(0.96);
}

/* ── Cover stage (signature) ─────────────────────────────
 * Cover size is fixed by native window metrics (--mini-cover-size).
 * The window grows/shrinks with the cover so the sleeve never looks tiny.
 */
.mini-cover-stage {
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  height: var(--mini-cover-size, 288px);
  margin-bottom: 12px;
}

.mini-cover {
  width: var(--mini-cover-size, 288px);
  height: var(--mini-cover-size, 288px);
  aspect-ratio: 1 / 1;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-surface-raised, #34363a) 80%, black);
  color: var(--auralis-text-faint, #a0a0a5);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.1) inset,
    0 16px 36px rgb(0 0 0 / 0.35);
  transition: box-shadow 0.3s ease;
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
  gap: 5px;
  min-width: 0;
  text-align: center;
  padding: 0 4px 10px;
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
  gap: 7px;
  padding: 0 2px 12px;
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
  gap: 14px;
  padding-bottom: 12px;
}

.mini-actions {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin: 0 auto;
  padding: 3px;
  border-radius: 12px;
  background: rgb(0 0 0 / 0.22);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06) inset;
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
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: #121214;
  background: var(--auralis-text-primary, #f4f4f5);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.28);
}

.mini-player--playing .mini-play-button {
  background: var(--auralis-active-album-accent);
  color: #121214;
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--auralis-active-album-accent) 20%, transparent),
    0 10px 24px rgb(0 0 0 / 0.32);
}

.mini-play-button:hover {
  filter: brightness(1.05);
}

/* Tooltips — prefer above on lower controls to stay in window */
.mini-icon-button[data-tooltip]::after,
.mini-play-button[data-tooltip]::after,
.mini-chrome-button[data-tooltip]::after {
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
.mini-play-button[data-tooltip]:hover::after,
.mini-chrome-button[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%);
}

.mini-chrome-button[data-tooltip]::after {
  bottom: auto;
  top: calc(100% + 7px);
  transform: translateX(-50%) translateY(-2px);
}

.mini-chrome-button[data-tooltip]:hover::after {
  transform: translateX(-50%);
}

.mini-window-actions .mini-chrome-button:last-child[data-tooltip]::after {
  right: 0;
  left: auto;
  transform: translateY(-2px);
}

.mini-window-actions .mini-chrome-button:last-child[data-tooltip]:hover::after {
  transform: translateY(0);
}

/* ── Popovers ──────────────────────────────────────────── */
.mini-popover {
  max-height: 300px;
  border-radius: 18px;
  overflow: hidden;
  backdrop-filter: blur(18px);
}

.mini-panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 13px 14px 10px;
  color: var(--auralis-text-secondary, #c4c4c8);
  font-size: 11px;
}

.mini-panel-heading span:first-child {
  color: var(--auralis-text-primary, #f5f5f5);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.mini-empty {
  padding: 28px;
  color: var(--auralis-text-faint, #949499);
  text-align: center;
  font-size: 12px;
}

.mini-queue-list {
  max-height: 240px;
  overflow: auto;
  padding: 0 8px 8px;
}

.mini-queue-item,
.mini-mode-option {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 10px;
  padding: 7px;
  color: var(--auralis-text-secondary, #c7c7cc);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.mini-queue-item:hover,
.mini-mode-option:hover,
.mini-queue-item--active,
.mini-mode-option--active {
  color: var(--auralis-text-primary, #fff);
  background: rgb(255 255 255 / 0.08);
}

.mini-queue-cover {
  display: grid;
  flex: none;
  width: 36px;
  height: 36px;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--auralis-surface-raised, #34363a);
  color: var(--auralis-text-faint, #a0a0a5);
}

.mini-queue-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mini-queue-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.mini-queue-copy b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 650;
}

.mini-queue-copy small {
  overflow: hidden;
  color: var(--auralis-text-secondary, #ababaf);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.mini-queue-item--active .mini-queue-copy b,
.mini-queue-now {
  color: var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator, #8ab4f8));
}

.mini-mode-panel {
  padding: 8px;
}

.mini-mode-option {
  min-height: 36px;
  font-size: 12px;
}

.mini-volume-panel {
  padding: 4px 14px 15px;
}

.mini-volume-control {
  display: flex;
  gap: 10px;
  align-items: center;
}

.mini-volume-slider {
  flex: 1;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator, #8ab4f8)) 0
      var(--mini-volume),
    var(--auralis-progress-track, rgb(255 255 255 / 0.18)) var(--mini-volume) 100%
  );
  outline: none;
}

.mini-volume-slider::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  appearance: none;
  border-radius: 50%;
  background: var(--auralis-text-primary, #fff);
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .mini-icon-button,
  .mini-play-button,
  .mini-chrome-button,
  .mini-cover,
  .mini-icon-button::after,
  .mini-play-button::after,
  .mini-chrome-button::after {
    transition: none;
  }

  .mini-progress .track-progress-fill::after {
    animation: none;
  }
}
</style>
