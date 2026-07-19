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
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
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

/** Pointer-driven specular sheen for the liquid-glass plaque (no RGB refraction). */
function updateGlassLight(event: PointerEvent): void {
  const el = event.currentTarget
  if (!(el instanceof HTMLElement)) return
  const bounds = el.getBoundingClientRect()
  el.style.setProperty('--glass-pointer-x', `${event.clientX - bounds.left}px`)
  el.style.setProperty('--glass-pointer-y', `${event.clientY - bounds.top}px`)
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
    <section
      v-if="activePopover"
      class="mini-popover"
      data-mini-interactive
      :style="popoverStyle"
      @pointermove="updateGlassLight"
    >
      <div class="mini-glass-sheen" aria-hidden="true" />
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

    <!-- Vertical liquid-glass plaque (zero chrome, no edge dispersion) -->
    <section
      class="mini-player"
      :class="{ 'mini-player--playing': playback.state.isPlaying }"
      :style="miniPlayerStyle"
      @dblclick="handleRestoreGesture"
      @pointermove="updateGlassLight"
    >
      <FluidArtworkBackground
        v-if="artworkUrl"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="mini-player-background"
      />
      <div class="mini-player-scrim" aria-hidden="true" />
      <div class="mini-glass-sheen" aria-hidden="true" />
      <div class="mini-drag-region" aria-hidden="true" />

      <div class="mini-body">
        <div class="mini-cover-stage" title="双击返回主界面" data-mini-interactive>
          <div
            class="mini-cover"
            :class="{ 'mini-cover--playing': playback.state.isPlaying && currentTrack }"
            role="button"
            tabindex="0"
            aria-label="双击封面返回主界面"
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

        <div class="mini-meta" data-mini-interactive title="双击返回主界面">
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

        <!-- Liquid Glass floating island: queue / mode / volume -->
        <div class="mini-actions-dock" data-mini-interactive>
          <LiquidGlassPanel class="mini-actions-glass" :radius="999">
            <div class="mini-actions" role="toolbar" aria-label="迷你播放工具">
              <button
                class="mini-icon-button mini-actions-button"
                :class="{ 'mini-icon-button--active': activePopover === 'queue' }"
                type="button"
                aria-label="播放队列"
                data-tooltip="播放队列"
                data-mini-popover-trigger="queue"
                @click="togglePopover('queue')"
              >
                <span class="h-4 w-4 i-lucide-list-music" />
              </button>
              <span class="mini-actions-sep" aria-hidden="true" />
              <button
                class="mini-icon-button mini-actions-button"
                :class="{ 'mini-icon-button--active': activePopover === 'mode' }"
                type="button"
                aria-label="播放模式"
                data-tooltip="播放模式"
                data-mini-popover-trigger="mode"
                @click="togglePopover('mode')"
              >
                <span class="h-4 w-4" :class="modeIcon" />
              </button>
              <span class="mini-actions-sep" aria-hidden="true" />
              <button
                class="mini-icon-button mini-actions-button"
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

/*
 * Liquid Glass shell (plaque + popover)
 * Volumetric cool frost: multi-stop elevation, inset bevel, rim thickness.
 * No RGB chromatic refraction on edges.
 */
.mini-player,
.mini-popover {
  --glass-pointer-x: 28%;
  --glass-pointer-y: 14%;
  pointer-events: auto;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  color: var(--auralis-text-primary, #f5f5f5);
  /* Cool frost: blue-slate glass */
  border: 1px solid rgb(190 210 255 / 0.18);
  background: color-mix(in srgb, rgb(8 14 28) 52%, rgb(40 72 120 / 0.12));
  backdrop-filter: blur(30px) saturate(1.18) contrast(1.05);
  -webkit-backdrop-filter: blur(30px) saturate(1.18) contrast(1.05);
  /*
   * No outer (drop) box-shadow on the shell: the BrowserWindow is sized to this
   * element, so outer shadows only paint into the square corner wedges and read
   * as a second rectangular "container" behind the rounded plaque. Depth comes
   * from inset bevel only; OS window shadow is disabled in mini mode.
   */
  box-shadow:
    /* Inner bevel: top catch-light + floor AO (glass thickness) */
    inset 0 1px 0 rgb(230 240 255 / 0.32),
    inset 0 2px 0 rgb(190 215 255 / 0.1),
    inset 0 -1px 0 rgb(0 8 24 / 0.45),
    inset 0 -3px 10px rgb(0 8 24 / 0.22),
    inset 0 18px 36px rgb(170 200 255 / 0.05),
    inset 0 -28px 40px rgb(0 6 20 / 0.28),
    /* Side wall soft bevel */ inset 1.5px 0 0 rgb(200 220 255 / 0.1),
    inset -1.5px 0 0 rgb(0 10 28 / 0.22);
}

/* Inner rim / lip — second surface for thickness without RGB fringe */
.mini-player::before,
.mini-popover::before {
  content: '';
  position: absolute;
  inset: 1px;
  z-index: 4;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgb(210 225 255 / 0.08),
    inset 0 0 0 2px rgb(0 8 24 / 0.14);
  background:
    linear-gradient(
      180deg,
      rgb(220 235 255 / 0.12) 0%,
      transparent 16%,
      transparent 78%,
      rgb(0 8 24 / 0.18) 100%
    ),
    radial-gradient(ellipse 90% 42% at 50% -4%, rgb(200 220 255 / 0.14), transparent 55%);
  opacity: 0.95;
}

/* ── Vertical plaque shell ─────────────────────────────── */
.mini-player {
  border-radius: 26px;
}

.mini-player-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  /* Solid fluid wash — album mesh reads clearly under cool glass */
  opacity: 0.88;
}

/* Cool glass wash: stronger top→bottom volume for depth */
.mini-player-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgb(190 215 255 / 0.11) 0%,
      rgb(6 12 26 / 0.14) 32%,
      rgb(4 10 22 / 0.38) 72%,
      rgb(2 8 18 / 0.55) 100%
    ),
    radial-gradient(ellipse 110% 55% at 50% -8%, rgb(180 210 255 / 0.12), transparent 58%),
    radial-gradient(ellipse 90% 50% at 50% 108%, rgb(0 6 18 / 0.35), transparent 55%);
}

/* Specular follow-light — cool white only (no RGB fringe) */
.mini-glass-sheen {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0.72;
  mix-blend-mode: soft-light;
  background:
    radial-gradient(
      200px circle at var(--glass-pointer-x) var(--glass-pointer-y),
      rgb(230 240 255 / 0.28),
      transparent 62%
    ),
    linear-gradient(145deg, rgb(200 225 255 / 0.14), transparent 40%),
    linear-gradient(215deg, transparent 55%, rgb(0 10 28 / 0.12) 100%);
  transition: opacity 180ms ease;
}

.mini-drag-region {
  position: absolute;
  inset: 0;
  z-index: 2;
  -webkit-app-region: drag;
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
  padding: 22px 28px 20px;
  box-sizing: border-box;
}

.mini-popover > :not(.mini-glass-sheen) {
  position: relative;
  z-index: 1;
}

.mini-cover,
.mini-cover-stage,
.mini-meta,
.mini-progress-block,
.mini-transport,
.mini-actions-dock,
.mini-popover {
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
  /* Float the sleeve above the glass floor */
  box-shadow:
    0 0 0 1px rgb(220 235 255 / 0.2) inset,
    0 1px 0 rgb(255 255 255 / 0.14) inset,
    0 2px 4px rgb(0 6 18 / 0.35),
    0 10px 22px rgb(0 8 24 / 0.32),
    0 22px 48px rgb(0 8 24 / 0.4);
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
    0 2px 4px rgb(0 6 18 / 0.3),
    0 12px 28px rgb(0 8 24 / 0.34),
    0 24px 52px rgb(0 8 24 / 0.42);
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

/* ── Liquid Glass floating island (queue / mode / volume) ─ */
.mini-actions-dock {
  flex: none;
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 0 10px 2px;
  -webkit-app-region: no-drag;
}

.mini-actions-glass {
  flex: none;
  width: auto;
  max-width: 72%;
  /* Cool dock glass — raised pill with thickness, no RGB edge dispersion */
  background: color-mix(in srgb, rgb(8 14 28) 50%, rgb(48 80 128 / 0.1)) !important;
  border: 1px solid rgb(190 210 255 / 0.18);
  box-shadow:
    0 1px 1px rgb(0 6 18 / 0.35),
    0 6px 14px rgb(0 10 28 / 0.28),
    0 14px 32px rgb(0 8 24 / 0.36),
    inset 0 1px 0 rgb(230 240 255 / 0.28),
    inset 0 2px 0 rgb(190 215 255 / 0.08),
    inset 0 -1px 0 rgb(0 8 24 / 0.4),
    inset 0 -6px 12px rgb(0 8 24 / 0.18) !important;
}

/* Kill LiquidGlassPanel's chromatic refraction rim (red/blue fringe) on this island only */
.mini-actions-glass :deep(.liquid-glass-panel__refraction) {
  display: none;
}

.mini-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin: 0;
  padding: 5px 7px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.mini-actions-button {
  width: 36px;
  height: 36px;
  border-radius: 999px;
}

.mini-actions-sep {
  flex: none;
  width: 1px;
  height: 14px;
  margin: 0 2px;
  border-radius: 1px;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0),
    rgb(255 255 255 / 0.22) 35%,
    rgb(255 255 255 / 0.22) 65%,
    rgb(255 255 255 / 0)
  );
  opacity: 0.7;
}

.mini-actions-button.mini-icon-button:hover,
.mini-actions-button.mini-icon-button--active {
  background: rgb(255 255 255 / 0.14);
  box-shadow: none;
}

.mini-actions-button.mini-icon-button--active {
  color: var(--auralis-active-album-accent);
  box-shadow: none;
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
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.35) inset,
    0 2px 4px rgb(0 6 18 / 0.25),
    0 10px 24px rgb(0 8 24 / 0.35);
}

.mini-player--playing .mini-play-button {
  background: var(--auralis-active-album-accent);
  color: #121214;
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.28) inset,
    0 0 0 4px color-mix(in srgb, var(--auralis-active-album-accent) 20%, transparent),
    0 2px 4px rgb(0 6 18 / 0.22),
    0 12px 28px rgb(0 8 24 / 0.38);
}

.mini-play-button:hover {
  filter: brightness(1.05);
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

/* ── Popovers (same liquid glass family as plaque) ─────── */
.mini-popover {
  max-height: 300px;
  border-radius: 20px;
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
  .mini-cover,
  .mini-icon-button::after,
  .mini-play-button::after {
    transition: none;
  }

  .mini-glass-sheen {
    display: none;
  }

  .mini-progress .track-progress-fill::after {
    animation: none;
  }
}

@media (prefers-contrast: more) {
  .mini-player,
  .mini-popover {
    background: rgb(8 12 22 / 0.96);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .mini-player-background {
    opacity: 0.55;
  }

  .mini-glass-sheen {
    display: none;
  }

  .mini-actions-glass {
    background: rgb(10 16 28 / 0.94) !important;
    border-color: rgb(190 210 255 / 0.28);
  }
}
</style>
