<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import FluidArtworkBackground from '@renderer/features/playback/components/FluidArtworkBackground.vue'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlaybackQueue } from '@renderer/features/playback/composables/usePlaybackQueue'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { subscribeVisualFrame } from '@renderer/features/playback/utils/visualFrameScheduler'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { auralis } from '@renderer/shared/ipc/client'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import { getDefaultMiniPlayerBodySize } from '@shared/constants/miniPlayer'
import type { MiniPlayerBodySize, MiniPlayerPopoverDirection } from '@shared/ipc/contracts'

type MiniPopover = 'queue' | 'mode' | 'volume' | null

const MINI_POPOVER_GAP = 10
const MINI_POPOVER_SURFACE_HEIGHTS: Record<Exclude<MiniPopover, null>, number> = {
  queue: 300,
  mode: 220,
  volume: 220,
}
const MINI_VOLUME_POPOVER_WIDTH = 92

/** Accent-metal light pose — reshuffled after each play-button hover ends. */
interface MetalLightPose {
  hiX: number
  hiY: number
  hiW: number
  hiH: number
  loX: number
  loY: number
  loW: number
  loH: number
  bodyAngle: number
  hoverHiX: number
  hoverHiY: number
  hoverLoX: number
  hoverLoY: number
  sweepAngle: number
  sweepFrom: number
  sweepTo: number
}

const playback = usePlayback()
const {
  currentTrack: queueCurrentTrack,
  currentIndex: queueCurrentIndex,
  upcomingTracks,
  isQueueEmpty,
  totalCount: queueTotalCount,
  playTrack: playQueueTrack,
  isActive: isQueueTrackActive,
} = usePlaybackQueue()
const activePopover = ref<MiniPopover>(null)
const popoverDirection = ref<MiniPlayerPopoverDirection>('below')
const popoverRegionHeight = ref(0)
const imageErrorIds = ref<Set<number>>(new Set())
const queueScrollRef = ref<HTMLElement | null>(null)
const isDraggingProgress = ref(false)
const draggingProgressRatio = ref<number | null>(null)
const progressFillRef = ref<HTMLElement | null>(null)
const metalLight = ref<MetalLightPose>(createMetalLightPose())
let unsubscribeMiniPlayerState: (() => void) | undefined
let progressFrameUnsubscribe: (() => void) | null = null
let progressAnchorTime = 0
let progressAnchorAt = 0

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function createMetalLightPose(previous?: MetalLightPose | null): MetalLightPose {
  // Highlight stays in the upper half; dark sits roughly opposite for volume.
  let hiX = randomRange(14, 70)
  let hiY = randomRange(8, 40)
  let loX = randomRange(40, 90)
  let loY = randomRange(52, 90)

  if (previous) {
    // Nudge away from last pose so the change is noticeable.
    if (Math.abs(hiX - previous.hiX) < 12) hiX = ((previous.hiX + randomRange(28, 48)) % 70) + 12
    if (Math.abs(hiY - previous.hiY) < 10) hiY = ((previous.hiY + randomRange(14, 28)) % 32) + 8
    if (Math.abs(loX - previous.loX) < 12) loX = ((previous.loX + randomRange(24, 42)) % 50) + 40
    if (Math.abs(loY - previous.loY) < 10) loY = ((previous.loY + randomRange(12, 24)) % 38) + 52
  }

  if (Math.abs(loX - hiX) < 18) loX = Math.min(90, Math.max(40, hiX + (hiX < 50 ? 28 : -28)))
  if (Math.abs(loY - hiY) < 22) loY = Math.min(90, hiY + randomRange(36, 52))

  const bodyAngle = randomRange(118, 208)
  const hoverHiX = Math.min(78, Math.max(10, hiX + randomRange(-8, 12)))
  const hoverHiY = Math.min(48, Math.max(6, hiY + randomRange(-10, 6)))
  const hoverLoX = Math.min(94, Math.max(36, loX + randomRange(-8, 8)))
  const hoverLoY = Math.min(94, Math.max(48, loY + randomRange(-6, 10)))

  return {
    hiX,
    hiY,
    hiW: randomRange(105, 140),
    hiH: randomRange(78, 105),
    loX,
    loY,
    loW: randomRange(78, 110),
    loH: randomRange(68, 95),
    bodyAngle,
    hoverHiX,
    hoverHiY,
    hoverLoX,
    hoverLoY,
    sweepAngle: randomRange(98, 148),
    sweepFrom: randomRange(115, 145),
    sweepTo: randomRange(-40, -10),
  }
}

/** After hover ends: new highlight / dark / body angles for the next rest + hover. */
function reshuffleMetalLight(): void {
  metalLight.value = createMetalLightPose(metalLight.value)
}

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
      '--mini-popover-gap': `${MINI_POPOVER_GAP}px`,
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
const popoverStyle = computed(() => {
  const surfaceHeight = Math.max(0, popoverRegionHeight.value - MINI_POPOVER_GAP)
  const isModePopover = activePopover.value === 'mode'
  const isVolumePopover = activePopover.value === 'volume'
  return {
    width: `${
      isModePopover
        ? bodySize.value.width / 2
        : isVolumePopover
          ? MINI_VOLUME_POPOVER_WIDTH
          : bodySize.value.width
    }px`,
    maxHeight: `${surfaceHeight}px`,
    ...(isModePopover ? { alignSelf: 'center' } : {}),
    ...(isVolumePopover ? { alignSelf: 'flex-end' } : {}),
    ...(activePopover.value === 'queue' || isVolumePopover ? { height: `${surfaceHeight}px` } : {}),
  } as CSSProperties
})

const playButtonMetalStyle = computed(
  () =>
    ({
      '--metal-hi-x': `${metalLight.value.hiX}%`,
      '--metal-hi-y': `${metalLight.value.hiY}%`,
      '--metal-hi-w': `${metalLight.value.hiW}%`,
      '--metal-hi-h': `${metalLight.value.hiH}%`,
      '--metal-lo-x': `${metalLight.value.loX}%`,
      '--metal-lo-y': `${metalLight.value.loY}%`,
      '--metal-lo-w': `${metalLight.value.loW}%`,
      '--metal-lo-h': `${metalLight.value.loH}%`,
      '--metal-body-angle': `${metalLight.value.bodyAngle}deg`,
      '--metal-hi-hover-x': `${metalLight.value.hoverHiX}%`,
      '--metal-hi-hover-y': `${metalLight.value.hoverHiY}%`,
      '--metal-lo-hover-x': `${metalLight.value.hoverLoX}%`,
      '--metal-lo-hover-y': `${metalLight.value.hoverLoY}%`,
      '--metal-sweep-angle': `${metalLight.value.sweepAngle}deg`,
      '--metal-sweep-from': `${metalLight.value.sweepFrom}%`,
      '--metal-sweep-to': `${metalLight.value.sweepTo}%`,
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

/** Dock bar short labels (serif text buttons). Full names live in the mode popover. */
const modeDockLabel = computed(() => {
  const labels: Record<PlaybackMode, string> = {
    sequential: '顺序',
    'repeat-all': '循环',
    'repeat-one': '单曲',
    shuffle: '随机',
    'album-shuffle': '专辑',
  }
  return labels[playback.state.playbackMode]
})

const volumeDockLabel = computed(() => (playback.state.isMuted ? '静音' : '音量'))

/** Volume panel still uses ion glyphs for mute / level affordance. */
const volumeIcon = computed(() => {
  if (playback.state.isMuted) return 'i-ion-volume-mute'
  if (playback.state.volume <= 0.33) return 'i-ion-volume-low'
  if (playback.state.volume <= 0.66) return 'i-ion-volume-medium'
  return 'i-ion-volume-high'
})

const modes: Array<{ id: PlaybackMode; label: string; icon: string }> = [
  { id: 'sequential', label: '顺序播放', icon: 'i-ion-play-skip-forward' },
  { id: 'repeat-all', label: '列表循环', icon: 'i-ion-repeat' },
  { id: 'repeat-one', label: '单曲循环', icon: 'i-ion-sync' },
  { id: 'shuffle', label: '随机播放', icon: 'i-ion-shuffle' },
  { id: 'album-shuffle', label: '专辑随机', icon: 'i-ion-disc' },
]

function artworkFailed(trackId: number): boolean {
  return imageErrorIds.value.has(trackId)
}

function handleArtworkError(trackId: number): void {
  imageErrorIds.value = new Set(imageErrorIds.value).add(trackId)
}

async function setPopover(next: MiniPopover): Promise<void> {
  activePopover.value = next
  const surfaceHeight = next ? MINI_POPOVER_SURFACE_HEIGHTS[next] : 0
  const regionHeight = next ? surfaceHeight + MINI_POPOVER_GAP : 0
  popoverRegionHeight.value = regionHeight
  const result = await miniWindow.setMiniPlayerPopover({
    open: next !== null,
    direction: popoverDirection.value,
    height: regionHeight,
  })
  if (result?.popover.direction) {
    popoverDirection.value = result.popover.direction
    popoverRegionHeight.value = result.popover.height
  }
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

function restoreMainWindow(): void {
  void miniWindow.restoreFromMiniPlayer()
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
    popoverRegionHeight.value = state.popover.height
    applyBodyFromState(state.body)
  })
  unsubscribeMiniPlayerState = miniWindow.onMiniPlayerStateChanged((state) => {
    popoverDirection.value = state.popover.direction
    popoverRegionHeight.value = state.popover.height
    applyBodyFromState(state.body)
  })
  syncProgressFrameSubscription()
})

watch(queueCurrentIndex, () => {
  nextTick(() => {
    queueScrollRef.value?.scrollTo({ top: 0 })
  })
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
      <FluidArtworkBackground
        v-if="artworkUrl"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="mini-popover-background"
      />
      <div class="mini-popover-scrim" aria-hidden="true" />

      <template v-if="activePopover === 'queue'">
        <div class="mini-queue-panel" role="dialog" aria-label="播放队列">
          <div class="mini-panel-heading">
            <span>播放队列</span>
            <span>{{ queueTotalCount }} 首</span>
          </div>
          <div v-if="isQueueEmpty" class="mini-empty">暂无播放队列</div>
          <template v-else>
            <div class="mini-queue-section-label">正在播放</div>
            <div
              v-if="queueCurrentTrack"
              class="mini-queue-item mini-queue-item--active mini-queue-item--current"
            >
              <div class="mini-queue-cover">
                <img
                  v-if="
                    getArtworkUrl(queueCurrentTrack.artworkCacheKey) &&
                    !artworkFailed(queueCurrentTrack.id)
                  "
                  :src="getArtworkUrl(queueCurrentTrack.artworkCacheKey)!"
                  alt=""
                  draggable="false"
                  @error="handleArtworkError(queueCurrentTrack.id)"
                />
                <span v-else class="h-4 w-4 i-lucide-music" />
              </div>
              <span class="mini-queue-copy">
                <b>{{ queueCurrentTrack.title || '未知歌曲' }}</b>
                <small>{{ formatPlaybackSubtitle(queueCurrentTrack) }}</small>
              </span>
              <span class="h-4 w-4 i-lucide-volume-2 mini-queue-now" />
            </div>

            <div v-if="upcomingTracks.length > 0" class="mini-queue-section-label">接下来</div>
            <div
              v-if="upcomingTracks.length > 0"
              ref="queueScrollRef"
              class="mini-queue-list scrollbar-none"
            >
              <button
                v-for="track in upcomingTracks"
                :key="track.id"
                class="mini-queue-item"
                :class="{ 'mini-queue-item--active': isQueueTrackActive(track.id) }"
                type="button"
                :aria-label="`播放 ${track.title || '未知歌曲'}`"
                @click="playQueueTrack(track.id)"
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
              </button>
            </div>
          </template>
        </div>
      </template>

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
            class="ml-auto h-4 w-4 i-ion-checkmark"
          />
        </button>
      </div>

      <div v-else class="mini-volume-panel" role="dialog" aria-label="音量">
        <output class="mini-volume-value"> {{ Math.round(playback.state.volume * 100) }}% </output>
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
        <button
          class="mini-icon-button mini-volume-button"
          type="button"
          :aria-label="playback.state.isMuted ? '取消静音' : '静音'"
          :data-tooltip="playback.state.isMuted ? '取消静音' : '静音'"
          @click="playback.toggleMute()"
        >
          <span class="h-4 w-4" :class="volumeIcon" />
        </button>
      </div>
    </section>

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
            :style="playButtonMetalStyle"
            :aria-label="playback.state.isPlaying ? '暂停' : '播放'"
            :data-tooltip="playback.state.isPlaying ? '暂停' : '播放'"
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
            aria-label="下一首"
            data-tooltip="下一首"
            @click="playback.playNext()"
          >
            <span class="mini-skip-glyph" aria-hidden="true" />
          </button>
        </div>

        <!-- Control Center–style media bar: full content width, three equal text cells -->
        <div class="mini-actions-dock" data-mini-interactive>
          <LiquidGlassPanel class="mini-actions-glass" :radius="18">
            <div class="mini-actions" role="toolbar" aria-label="迷你播放工具">
              <button
                class="mini-actions-button"
                :class="{ 'mini-actions-button--active': activePopover === 'queue' }"
                type="button"
                aria-label="播放队列"
                data-tooltip="播放队列"
                data-mini-popover-trigger="queue"
                @click="togglePopover('queue')"
              >
                <span class="mini-actions-label">队列</span>
              </button>
              <button
                class="mini-actions-button"
                :class="{ 'mini-actions-button--active': activePopover === 'mode' }"
                type="button"
                :aria-label="`播放模式：${modeDockLabel}`"
                data-tooltip="播放模式"
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
                data-tooltip="音量"
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
.mini-player,
.mini-popover {
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

.mini-player-background,
.mini-popover-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Cover-forward scrim: light over art, denser toward controls */
.mini-player-scrim,
.mini-popover-scrim {
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
.mini-subtitle,
.mini-mode-option,
.mini-volume-value {
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

/* ── Popovers ──────────────────────────────────────────── */
.mini-popover {
  box-sizing: border-box;
  max-height: 300px;
  border-radius: 24px;
}

.mini-queue-panel,
.mini-mode-panel,
.mini-volume-panel {
  position: relative;
  z-index: 2;
}

.mini-queue-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
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
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 8px 8px;
}

.mini-queue-section-label {
  flex: none;
  padding: 4px 15px 5px;
  color: var(--auralis-text-faint, #949499);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
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

.mini-queue-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--auralis-active-album-accent) 72%, white);
  outline-offset: -2px;
}

.mini-queue-item--current {
  width: calc(100% - 16px);
  margin: 0 8px;
  flex: none;
  cursor: default;
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
  display: flex;
  box-sizing: border-box;
  height: 100%;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 12px;
}

.mini-volume-value {
  flex: none;
  color: var(--auralis-text-secondary, rgb(255 255 255 / 0.72));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.mini-volume-slider {
  flex: 1;
  width: 4px;
  min-height: 0;
  appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  border-radius: 999px;
  background: linear-gradient(
    to top,
    var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator, #8ab4f8)) 0
      var(--mini-volume),
    var(--auralis-progress-track, rgb(255 255 255 / 0.18)) var(--mini-volume) 100%
  );
  outline: none;
}

.mini-volume-slider:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--auralis-active-album-accent) 42%, transparent);
}

.mini-volume-slider::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  appearance: none;
  border-radius: 50%;
  background: var(--auralis-text-primary, #fff);
  cursor: pointer;
}

.mini-volume-button {
  flex: none;
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
