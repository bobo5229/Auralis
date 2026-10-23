<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { usePlaybackMetadataDisplay } from '@renderer/features/playback/composables/usePlaybackMetadataDisplay'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'
import { useDisplayedTrackLyrics } from '@renderer/features/lyrics/composables/useDisplayedTrackLyrics'
import { useLyricLineSeek } from '@renderer/features/lyrics/composables/useLyricLineSeek'
import {
  FULLSCREEN_LYRICS_FADE_TOP_RATIO,
  FULLSCREEN_LYRICS_FADE_BOTTOM_RATIO,
  FULLSCREEN_LYRICS_ACTIVE_SCALE,
  useFullscreenLyricsViewport,
} from '@renderer/features/lyrics/composables/useFullscreenLyricsViewport'
import { useFullscreenLyricsTypography } from '@renderer/features/lyrics/composables/useFullscreenLyricsTypography'
import type { LyricLine } from '@renderer/features/lyrics/types'
import FullscreenArtworkBackground from '@renderer/features/playback/components/FullscreenArtworkBackground.vue'
import FullscreenBackgroundControls from '@renderer/features/playback/components/FullscreenBackgroundControls.vue'
import FullscreenLyricsContextMenu from '@renderer/features/lyrics/components/FullscreenLyricsContextMenu.vue'
import FullscreenPlaybackModeControl from './FullscreenPlaybackModeControl.vue'
import { useFullscreenBackground } from '@renderer/features/playback/composables/useFullscreenBackground'
import { usePlaybackProgressInteraction } from '@renderer/features/playback/composables/usePlaybackProgressInteraction'
import { useReducedMotion } from '@renderer/features/lyrics/composables/useReducedMotion'
import { useLyricsScrollPreset } from '@renderer/features/lyrics/lyricsScrollPreset'
import { useLyricsCountdownPreference } from '@renderer/features/lyrics/lyricsCountdownPreference'
import LyricsFractureDots from '@renderer/features/lyrics/components/LyricsFractureDots.vue'
import { resolveRestorablePlayerTrigger } from '../utils/playerOverlayFocus'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import {
  animateFullscreenPlayerTransition,
  type FullscreenPlayerTransitionSnapshot,
} from '@renderer/shared/animation/motion'

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
const { lyricsScript, lyricsPersistFailed, setLyricsScript } = useChineseTextDisplay()
const { songText, playbackSubtitle } = usePlaybackMetadataDisplay()
const { isFullscreenPlayerOpen, closeFullscreenPlayer } = useFullscreenPlayer()
const {
  status: lyricsStatus,
  rawLyrics,
  parsedLines,
  activeIndex,
  isPrelude,
  showPrelude,
  preludeLitDotCount,
  preludeElapsed,
} = useDisplayedTrackLyrics()

const imgError = ref(false)
const overlayRef = ref<HTMLElement | null>(null)
// Space can activate :focus-visible after a pointer click; reserve the lyrics ring for Tab navigation.
const keyboardNavigation = ref(false)
const artworkRef = ref<HTMLElement | null>(null)
// Park the GPU backgrounds between visits; controls and lyrics still leave with the section.
const backgroundTarget = shallowRef<HTMLElement | null>(null)
const deferBackgroundInitialization = ref(false)
const exitButtonRef = ref<HTMLButtonElement | null>(null)
const backgroundControlsRef = ref<InstanceType<typeof FullscreenBackgroundControls> | null>(null)
const modeControlRef = ref<InstanceType<typeof FullscreenPlaybackModeControl> | null>(null)
const lyricsContextMenuOpen = ref(false)
const lyricsContextMenuAnchor = ref({ clientX: 0, clientY: 0 })
const { backgroundMotionPaused } = useFullscreenBackground()
const reducedMotion = useReducedMotion()
const { preset: lyricsScrollPreset } = useLyricsScrollPreset()
const { effect: countdownEffect } = useLyricsCountdownPreference()
const { preference: lyricsTypography, style: lyricsTypographyStyle } =
  useFullscreenLyricsTypography()
let activeTransition: ReturnType<typeof animateFullscreenPlayerTransition> | undefined
let interruptedTransition: FullscreenPlayerTransitionSnapshot | undefined
let backgroundReleaseFrame = 0
let lyricsLayoutRefreshFrame = 0
let keyboardContextMenuPending = false
let keyboardContextMenuFallbackTimer: ReturnType<typeof setTimeout> | null = null

function releaseBackgroundInitialization(): void {
  cancelAnimationFrame(backgroundReleaseFrame)
  // Let the completed artwork transition reach the compositor before starting a
  // cold context; changing a flag in its completion microtask is still too early.
  backgroundReleaseFrame = requestAnimationFrame(() => {
    backgroundReleaseFrame = requestAnimationFrame(() => {
      backgroundReleaseFrame = 0
      deferBackgroundInitialization.value = false
    })
  })
}

watch(
  isFullscreenPlayerOpen,
  () => {
    // Post-render background watchers can run before Transition's enter hook.
    // Block cold preparation synchronously with the open/close state change.
    cancelAnimationFrame(backgroundReleaseFrame)
    backgroundReleaseFrame = 0
    deferBackgroundInitialization.value = true
  },
  { flush: 'sync' },
)

function runTransition(element: Element, done: () => void, entering: boolean): void {
  const interrupted = activeTransition?.cancel() ?? interruptedTransition
  cancelAnimationFrame(backgroundReleaseFrame)
  backgroundReleaseFrame = 0
  // Context creation is synchronous even with parallel shader compilation. Keep
  // cold GPU preparation outside both artwork transitions; reuse ready canvases.
  deferBackgroundInitialization.value = true
  ;(element as HTMLElement).inert = !entering
  activeTransition = animateFullscreenPlayerTransition({
    overlay: element as HTMLElement,
    artwork: (element as HTMLElement).querySelector<HTMLElement>('.fullscreen-player-artwork'),
    source: document.querySelector<HTMLElement>('[data-player-bar-artwork]'),
    entering,
    reducedMotion: reducedMotion.matches.value,
    interrupted,
    onComplete: () => {
      activeTransition = undefined
      interruptedTransition = undefined
      done()
      releaseBackgroundInitialization()
      if (entering && wholeLineLyrics.value) {
        void nextTick(() => refreshFullscreenLyrics('auto'))
      }
    },
  })
  interruptedTransition = undefined
}

function handleEnter(element: Element, done: () => void): void {
  backgroundTarget.value = element as HTMLElement
  runTransition(element, done, true)
}

function handleLeave(element: Element, done: () => void): void {
  runTransition(element, done, false)
}

function handleAfterLeave(element: Element): void {
  if (backgroundTarget.value === element) backgroundTarget.value = null
}

function handleTransitionCancelled(): void {
  interruptedTransition = activeTransition?.cancel()
  activeTransition = undefined
  releaseBackgroundInitialization()
}

watch(reducedMotion.matches, () => activeTransition?.finish())
let returnFocusTarget: HTMLElement | null = null
const progressFillRef = ref<HTMLElement | null>(null)
const lyricsScrollRef = ref<HTMLElement | null>(null)
const lyricsTrackRef = ref<HTMLElement | null>(null)

const artworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
watch(artworkCacheKey, () => activeTransition?.finish())
const artworkUrl = computed(() => getArtworkUrl(artworkCacheKey.value))
const title = computed(
  () => songText(playback.state.currentTrack?.title) || t('player.unknownTrack'),
)
const subtitle = computed(() =>
  playback.state.currentTrack
    ? playbackSubtitle(playback.state.currentTrack)
    : t('player.unknownTrack'),
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

const lyricsContextMenuEnabled = computed(
  () =>
    isFullscreenPlayerOpen.value &&
    (lyricsStatus.value === 'lrc' || lyricsStatus.value === 'plain') &&
    fullscreenLyricLines.value.length > 0,
)

function focusLyricsScroll(): void {
  void nextTick(() => lyricsScrollRef.value?.focus({ preventScroll: true }))
}

function closeLyricsContextMenuWithoutFocus(): void {
  lyricsContextMenuOpen.value = false
  clearKeyboardContextMenuFallback()
}

function closeLyricsContextMenu(
  reason: 'escape' | 'tab' | 'outside' | 'focusout' | 'scroll' | 'position-error',
): void {
  if (!lyricsContextMenuOpen.value) return
  lyricsContextMenuOpen.value = false
  clearKeyboardContextMenuFallback()
  if (reason === 'escape' || reason === 'position-error') focusLyricsScroll()
}

function selectLyricsScript(script: ChineseScript): void {
  setLyricsScript(script)
  closeLyricsContextMenuWithoutFocus()
  focusLyricsScroll()
}

function openLyricsContextMenu(clientX: number, clientY: number): boolean {
  if (!lyricsContextMenuEnabled.value || !lyricsScrollRef.value) return false
  modeControlRef.value?.close(false)
  backgroundControlsRef.value?.close(false)
  lyricsContextMenuAnchor.value = { clientX, clientY }
  lyricsContextMenuOpen.value = true
  return true
}

function getLyricsKeyboardAnchor(): { clientX: number; clientY: number } | null {
  const rect = lyricsScrollRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return {
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
  }
}

function clearKeyboardContextMenuFallback(): void {
  keyboardContextMenuPending = false
  if (keyboardContextMenuFallbackTimer) clearTimeout(keyboardContextMenuFallbackTimer)
  keyboardContextMenuFallbackTimer = null
}

function markKeyboardContextMenuPending(): void {
  clearKeyboardContextMenuFallback()
  keyboardContextMenuPending = true
  keyboardContextMenuFallbackTimer = setTimeout(clearKeyboardContextMenuFallback, 750)
}

function handleLyricsContextMenu(event: MouseEvent): void {
  if (!lyricsContextMenuEnabled.value) return
  event.preventDefault()
  event.stopPropagation()

  if (event.clientX === 0 && event.clientY === 0) {
    if (keyboardContextMenuPending && lyricsContextMenuOpen.value) {
      clearKeyboardContextMenuFallback()
      return
    }
    clearKeyboardContextMenuFallback()
    const anchor = getLyricsKeyboardAnchor()
    if (anchor) openLyricsContextMenu(anchor.clientX, anchor.clientY)
    return
  }

  clearKeyboardContextMenuFallback()
  openLyricsContextMenu(event.clientX, event.clientY)
}

function handleLyricsContainerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    if (!lyricsContextMenuEnabled.value) return
    event.preventDefault()
    event.stopPropagation()
    const anchor = getLyricsKeyboardAnchor()
    if (anchor && openLyricsContextMenu(anchor.clientX, anchor.clientY))
      markKeyboardContextMenuPending()
    return
  }
  handleFullscreenLyricsKeydown(event)
}

function handleLyricsWheel(event: WheelEvent): void {
  closeLyricsContextMenuWithoutFocus()
  handleFullscreenLyricsWheel(event)
}

function handleLyricsTouchMove(): void {
  closeLyricsContextMenuWithoutFocus()
  pauseFullscreenLyricAutoFollow()
}

watch(
  () => [playback.state.currentTrackId, lyricsStatus.value, fullscreenLyricLines.value],
  () => closeLyricsContextMenuWithoutFocus(),
  { flush: 'post' },
)

const wholeLineLyrics = computed(() => lyricsStatus.value === 'lrc')

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
  fill.style.transform = `translateX(${(ratio - 1) * 100}%)`
}

const {
  valueNow: progressValueNow,
  ratio: progressRatio,
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
  maxVisualFps: 30,
  resolveSeekStepSeconds: (shiftKey) => (shiftKey ? 10 : 5),
})

const {
  topPadding: lyricsTopPadding,
  bottomPadding: lyricsBottomPadding,
  pauseAutoFollow: pauseFullscreenLyricAutoFollow,
  onWheel: handleFullscreenLyricsWheel,
  onKeydown: handleFullscreenLyricsKeydown,
  refresh: refreshFullscreenLyrics,
  renderedLines: renderedLyricLines,
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
  reducedMotion: reducedMotion.matches,
  scrollPreset: lyricsScrollPreset,
  wholeLineMode: wholeLineLyrics,
  lines: fullscreenLyricLines,
  artworkRef,
})

const lyricsMaskStyle = computed(() => ({
  ...lyricsTypographyStyle.value,
  '--fullscreen-lyrics-fade-top': `${FULLSCREEN_LYRICS_FADE_TOP_RATIO * 100}%`,
  '--fullscreen-lyrics-fade-bottom': `${(1 - FULLSCREEN_LYRICS_FADE_BOTTOM_RATIO) * 100}%`,
  '--fullscreen-lyric-active-scale': FULLSCREEN_LYRICS_ACTIVE_SCALE,
}))

const { activate: seekToLyricLine, onKeydown: handleLyricLineKeydown } = useLyricLineSeek({
  lines: () => fullscreenLyricLines.value,
  enabled: () => lyricsStatus.value === 'lrc',
  onSeek: () => {
    void nextTick(() => refreshFullscreenLyrics('smooth'))
  },
})

function cancelLyricsLayoutRefresh(): void {
  if (!lyricsLayoutRefreshFrame) return
  cancelAnimationFrame(lyricsLayoutRefreshFrame)
  lyricsLayoutRefreshFrame = 0
}

function scheduleLyricsLayoutRefresh(): void {
  cancelLyricsLayoutRefresh()
  if (!isFullscreenPlayerOpen.value) return
  lyricsLayoutRefreshFrame = requestAnimationFrame(() => {
    lyricsLayoutRefreshFrame = 0
    if (!isFullscreenPlayerOpen.value) return
    refreshFullscreenLyrics('auto', true)
  })
}

watch(
  () => [
    lyricsTypography.value.fontSizePercent,
    lyricsTypography.value.fontWeight,
    lyricsTypography.value.lineGapPercent,
    fullscreenLyricLines.value,
  ],
  scheduleLyricsLayoutRefresh,
  { flush: 'post' },
)

watch(
  isFullscreenPlayerOpen,
  (isOpen) => {
    if (!isOpen) {
      cancelLyricsLayoutRefresh()
      closeLyricsContextMenuWithoutFocus()
    }
  },
  { flush: 'sync' },
)

watch(
  () => playback.state.currentTrackId,
  () => {
    imgError.value = false
  },
)

watch(
  isFullscreenPlayerOpen,
  (isOpen) => {
    keyboardNavigation.value = false
    if (isOpen) {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && !overlayRef.value?.contains(activeElement)) {
        returnFocusTarget = activeElement
      }
    }
  },
  { flush: 'sync', immediate: true },
)

useOverlayFocusTrap({
  isOpen: isFullscreenPlayerOpen,
  container: overlayRef,
  initialFocus: () => exitButtonRef.value ?? undefined,
  onEscape: () => {
    if (lyricsContextMenuOpen.value) {
      closeLyricsContextMenu('escape')
      return
    }
    if (modeControlRef.value?.close()) return
    if (!backgroundControlsRef.value?.close()) closeFullscreenPlayer()
  },
  restoreFocus: () => {
    resolveRestorablePlayerTrigger(returnFocusTarget)?.focus({ preventScroll: true })
    returnFocusTarget = null
  },
})

function handleVolumeInput(event: Event): void {
  playback.setVolume(Number((event.target as HTMLInputElement).value))
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

onBeforeUnmount(() => {
  activeTransition?.cancel()
  cancelAnimationFrame(backgroundReleaseFrame)
  cancelLyricsLayoutRefresh()
  clearKeyboardContextMenuFallback()
  reducedMotion.dispose()
})
</script>

<template>
  <Teleport to="body">
    <FullscreenArtworkBackground
      :target="backgroundTarget"
      :artwork-url="artworkUrl"
      :active="isFullscreenPlayerOpen"
      :motion-paused="backgroundMotionPaused"
      :playing="playback.state.isPlaying"
      :defer-initialization="deferBackgroundInitialization"
    />
    <Transition
      :css="false"
      @enter="handleEnter"
      @leave="handleLeave"
      @after-leave="handleAfterLeave"
      @enter-cancelled="handleTransitionCancelled"
      @leave-cancelled="handleTransitionCancelled"
    >
      <section
        v-if="isFullscreenPlayerOpen"
        ref="overlayRef"
        class="fullscreen-player"
        :class="{
          'fullscreen-player--keyboard-navigation': keyboardNavigation,
        }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="t('fullscreen.overlayAria')"
        @keydown.capture="keyboardNavigation ||= $event.key === 'Tab'"
        @pointerdown.capture="keyboardNavigation = false"
      >
        <div class="fullscreen-drag-region" aria-hidden="true" />
        <button
          ref="exitButtonRef"
          v-tooltip.fast="t('fullscreen.exit')"
          class="fullscreen-player-exit"
          type="button"
          :aria-label="t('fullscreen.exit')"
          @click="closeFullscreenPlayer"
        >
          <span class="i-lucide-chevron-down h-6 w-6" aria-hidden="true" />
        </button>
        <FullscreenBackgroundControls ref="backgroundControlsRef" />

        <div class="fullscreen-player-left">
          <div class="fullscreen-player-artwork-slot">
            <div ref="artworkRef" class="fullscreen-player-artwork">
              <img
                v-if="artworkUrl && !imgError"
                :src="artworkUrl"
                alt=""
                class="h-full w-full object-cover"
                decoding="async"
                @error="imgError = true"
              />
              <div v-else class="fullscreen-player-artwork-placeholder">
                <span class="i-lucide-music h-14 w-14" />
              </div>
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
              :aria-valuenow="Math.round(progressRatio * playback.state.duration)"
              :aria-valuetext="`${progressValueNow}%`"
              @pointerdown="handleProgressPointerDown"
              @pointermove="handleProgressPointerMove"
              @pointerup="handleProgressPointerUp"
              @pointercancel="handleProgressPointerCancel"
              @keydown="handleProgressKeydown"
            >
              <div class="fullscreen-player-progress-track">
                <div ref="progressFillRef" class="fullscreen-player-progress-fill"></div>
              </div>
            </div>
            <div class="fullscreen-player-time-row">
              <span>{{ currentTimeLabel }}</span>
              <span>{{ remainingTimeLabel }}</span>
            </div>
          </div>

          <div class="fullscreen-player-control-stack">
            <div class="fullscreen-player-controls">
              <FullscreenPlaybackModeControl ref="modeControlRef" />
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
            {{ t('player.lyricsLoading') }}
          </div>
          <div
            v-else-if="fullscreenLyricLines.length > 0"
            ref="lyricsScrollRef"
            class="fullscreen-player-lyrics-scroll"
            :class="{
              'fullscreen-player-lyrics-plain': lyricsStatus === 'plain',
              'fullscreen-player-lyrics-whole': wholeLineLyrics,
            }"
            :style="lyricsMaskStyle"
            aria-live="polite"
            tabindex="0"
            :aria-haspopup="lyricsContextMenuEnabled ? 'menu' : undefined"
            :aria-expanded="lyricsContextMenuOpen"
            :aria-controls="lyricsContextMenuOpen ? 'fullscreen-lyrics-context-menu' : undefined"
            @contextmenu="handleLyricsContextMenu"
            @wheel="handleLyricsWheel"
            @touchmove="handleLyricsTouchMove"
            @keydown="handleLyricsContainerKeydown"
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
                <LyricsFractureDots
                  v-if="countdownEffect === 'fracture'"
                  :elapsed="preludeElapsed"
                />
                <template v-else>
                  <span
                    v-for="dot in 3"
                    :key="dot"
                    class="fullscreen-player-prelude-dot"
                    :class="{ 'fullscreen-player-prelude-dot-lit': dot <= preludeLitDotCount }"
                  ></span>
                </template>
              </div>
              <div
                v-for="{ line, index } in renderedLyricLines"
                :key="line.id"
                v-memo="[lyricsStatus, activeIndex === index, activeIndex < index, line.text]"
                class="fullscreen-player-lyric-line"
                :class="{
                  'fullscreen-player-lyric-active': lyricsStatus === 'lrc' && activeIndex === index,
                  'fullscreen-player-lyric-upcoming':
                    lyricsStatus === 'lrc' && activeIndex !== index && line.text,
                  'fullscreen-player-lyric-future': lyricsStatus === 'lrc' && index > activeIndex,
                  'fullscreen-player-lyric-empty': !line.text,
                  'fullscreen-player-lyric-seekable': lyricsStatus === 'lrc',
                }"
                :role="lyricsStatus === 'lrc' ? 'button' : undefined"
                :tabindex="lyricsStatus === 'lrc' ? 0 : undefined"
                :aria-label="
                  lyricsStatus === 'lrc'
                    ? line.text
                      ? t('player.lyricsSeekToLine', { text: line.text })
                      : t('player.lyricsSeekToTime', { seconds: Math.floor(line.timeSeconds) })
                    : undefined
                "
                :data-lyric-index="index"
                @click.stop="seekToLyricLine(index)"
                @keydown="handleLyricLineKeydown($event, index)"
              >
                <span class="fullscreen-player-lyric-material">
                  <span class="fullscreen-player-lyric-fill">{{ line.text || ' ' }}</span>
                </span>
              </div>
              <div :style="{ height: `${lyricsBottomPadding}px` }"></div>
            </div>
          </div>
          <div v-else class="fullscreen-player-lyrics-empty">{{ t('player.lyricsEmpty') }}</div>
          <div
            v-if="lyricsPersistFailed && lyricsContextMenuEnabled"
            class="fullscreen-lyrics-script-persist-status"
            role="status"
          >
            {{ t('fullscreen.lyricsContextMenu.persistFailed') }}
          </div>
        </div>
        <FullscreenLyricsContextMenu
          :open="lyricsContextMenuOpen"
          :anchor="lyricsContextMenuAnchor"
          :current-script="lyricsScript"
          @select="selectLyricsScript"
          @close="closeLyricsContextMenu"
        />
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
  --auralis-progress-fill: var(--auralis-fullscreen-slider-fill);
  --auralis-volume-fill: var(--auralis-fullscreen-slider-fill);
  --auralis-artwork-placeholder-bg: rgba(246, 242, 234, 0.12);
  --fullscreen-lyrics-left-bleed: clamp(32px, 2.6vw, 56px);
  --auralis-fullscreen-bg: #15181d;
  --auralis-fullscreen-lyrics-glow: rgba(255, 255, 255, 0.42);
  --fullscreen-padding-block: clamp(64px, 10vh, 110px);
  --fullscreen-content-width: min(32vw, 600px);

  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-columns: var(--fullscreen-content-width) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(80px, 8vw, 160px);
  padding: var(--fullscreen-padding-block) clamp(48px, 8vw, 176px);
  color: var(--auralis-text);
  background: var(--auralis-fullscreen-bg);
  overflow-x: hidden;
  overflow-y: auto;
}

.fullscreen-player-exit {
  position: fixed;
  top: 12px;
  right: 24px;
  z-index: 102;
  display: inline-flex;
  width: 44px;
  height: 44px;
  background: transparent;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  -webkit-app-region: no-drag;
}

.fullscreen-player-exit:hover {
  color: var(--auralis-text);
}

.fullscreen-player :is(button, input, [tabindex]):focus-visible {
  outline: 2px solid var(--auralis-text);
  outline-offset: 4px;
}

/* The scroll mask also clips outlines, so draw keyboard focus on its unmasked parent. */
.fullscreen-player--keyboard-navigation
  .fullscreen-player-lyrics:has(.fullscreen-player-lyrics-scroll:focus-visible) {
  outline: 2px solid var(--auralis-text);
  outline-offset: 4px;
}

.fullscreen-player .fullscreen-player-lyrics-scroll:focus-visible {
  outline: none;
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

.fullscreen-lyrics-script-persist-status {
  position: absolute;
  right: 0;
  bottom: 10px;
  z-index: 3;
  max-width: min(100%, 34rem);
  padding: 7px 11px;
  border: 1px solid var(--auralis-fullscreen-controls-border);
  border-radius: 9px;
  color: var(--auralis-fullscreen-controls-text);
  background: color-mix(in srgb, var(--auralis-fullscreen-controls-bg) 92%, transparent);
  box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  pointer-events: none;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.fullscreen-player-left {
  display: flex;
  min-width: 0;
  min-height: 0;
  width: var(--fullscreen-content-width);
  flex-direction: column;
  justify-content: center;
}

.fullscreen-player-artwork-slot {
  /* Flex reserves the actual metadata/control height before shrinking the square cover. */
  width: 100%;
  aspect-ratio: 1;
  min-height: 120px;
  flex: 0 1 auto;
  container-type: size;
  display: flex;
  align-items: flex-end;
}

.fullscreen-player-artwork {
  width: min(100cqw, 100cqh);
  max-width: 100%;
  flex-shrink: 0;
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
  margin-top: 18px;
  flex-shrink: 0;
  width: 100%;
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
  line-height: 1.4;
}

.fullscreen-player-progress-group {
  margin-top: 4px;
  width: 100%;
  flex-shrink: 0;
}

.fullscreen-player-progress {
  position: relative;
  display: flex;
  align-items: center;
  height: 44px;
  cursor: default;
  border-radius: 8px;
  touch-action: none;
}

.fullscreen-player-progress-track {
  position: relative;
  width: 100%;
  height: 5px;
  cursor: pointer;
  border-radius: 999px;
  background: var(--auralis-progress-track);
  overflow: hidden;
  contain: layout paint;
}

.fullscreen-player-progress-track::before {
  content: '';
  position: absolute;
  inset: -3px 0;
  cursor: pointer;
}

.fullscreen-player-progress-fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--auralis-progress-fill);
  transform: translateX(-100%);
  will-change: transform;
}

.fullscreen-player-time-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 0;
  color: var(--auralis-text-muted);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fullscreen-player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 1vw, 20px);
  margin-top: 8px;
}

.fullscreen-player-control-stack {
  width: 100%;
  flex-shrink: 0;
}

.fullscreen-player-controls button,
.fullscreen-player-volume button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  flex-shrink: 0;
  border-radius: 8px;
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
  opacity: 1;
  color: var(--auralis-fullscreen-pause-fill);
}

.fullscreen-player-play:hover .fullscreen-player-filled-pause {
  color: var(--auralis-text);
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
  margin-top: 8px;
  width: 100%;
}

.fullscreen-player-volume-track {
  position: relative;
  height: 44px;
  flex: 1;
  border-radius: 8px;
}

.fullscreen-player-volume-track::before {
  content: '';
  position: absolute;
  top: calc(50% - 2.5px);
  left: 0;
  right: 0;
  height: 5px;
  border-radius: 999px;
  background: var(--auralis-progress-track);
}

.fullscreen-player-volume-fill {
  position: absolute;
  top: calc(50% - 2.5px);
  left: 0;
  right: 0;
  height: 5px;
  border-radius: 999px;
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
}

.fullscreen-player-lyrics-scroll {
  --fullscreen-lyrics-font-size: calc(
    clamp(22px, 2.25vw, 39px) * var(--fullscreen-lyrics-font-scale, 1)
  );
  --fullscreen-lyrics-line-gap: calc(
    clamp(26px, 4vh, 52px) * var(--fullscreen-lyrics-gap-scale, 1)
  );
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
    #000 var(--fullscreen-lyrics-fade-top),
    #000 var(--fullscreen-lyrics-fade-bottom),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--fullscreen-lyrics-fade-top),
    #000 var(--fullscreen-lyrics-fade-bottom),
    transparent 100%
  );
}

.fullscreen-player-lyrics-scroll.fullscreen-player-lyrics-whole {
  -webkit-mask-image: none;
  mask-image: none;
}

.fullscreen-player-lyrics:has(.fullscreen-player-lyrics-whole) {
  padding-top: 0;
}

.fullscreen-player-lyrics-whole {
  /* Reserve room above the aligned ink for its fine edge and highlight. */
  margin-top: -4px;
  height: calc(100% + 4px);
  overflow: clip;
}

.fullscreen-player-lyrics-whole .fullscreen-player-lyrics-track {
  position: relative;
  min-height: 0;
  padding-right: 0;
  visibility: hidden;
}

.fullscreen-player-lyrics-whole .fullscreen-player-lyric-line {
  position: relative;
  min-height: 0;
  font-size: var(--fullscreen-lyrics-font-size);
  transform: none;
  transition: none;
}

.fullscreen-player-lyrics-whole .fullscreen-player-lyric-line .fullscreen-player-lyric-material {
  /* One maximum-size line layout is shared by all states; only its painted scale changes. */
  display: block;
  position: absolute;
  inset: 0 0 auto;
  font-size: calc(var(--fullscreen-lyrics-font-size) * var(--fullscreen-lyric-active-scale));
  transform-origin: left top;
}

.fullscreen-player-lyrics-whole .fullscreen-player-lyric-line + .fullscreen-player-lyric-line {
  margin-top: calc(var(--fullscreen-lyrics-line-gap) * var(--fullscreen-whole-fit-scale, 1));
}

.fullscreen-player-lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.fullscreen-player-lyrics-track {
  box-sizing: border-box;
  min-height: 100%;
  /* Reserve exactly the extra width used by the active line's scale. */
  padding-right: calc(100% - 100% / var(--fullscreen-lyric-active-scale));
  will-change: transform;
}

.fullscreen-player-lyric-line {
  overflow-wrap: anywhere;
  font-size: var(--fullscreen-lyrics-font-size);
  font-weight: var(--fullscreen-lyrics-font-weight, 800);
  line-height: 1.2;
  letter-spacing: 0;
  transform-origin: left center;
  transition:
    transform 420ms cubic-bezier(0.22, 0.72, 0.18, 1),
    opacity 300ms ease,
    filter 300ms ease;
}

.fullscreen-player-lyric-seekable {
  cursor: pointer;
  border-radius: 6px;
}

.fullscreen-player-prelude {
  --lyrics-countdown-dot-size: 0.2em;
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
    0 0 0.72em var(--auralis-fullscreen-lyrics-glow);
  opacity: 1;
  transform: scale(1);
}

.fullscreen-player-lyric-line + .fullscreen-player-lyric-line {
  margin-top: var(--fullscreen-lyrics-line-gap);
}

.fullscreen-player-lyric-active {
  color: var(--auralis-text);
  filter: blur(0);
  opacity: 1;
  transform: scale(var(--fullscreen-lyric-active-scale));
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

.fullscreen-player-lyrics-plain .fullscreen-player-lyric-line {
  color: var(--auralis-text);
  filter: none;
  opacity: 1;
  transform: none;
  transition: none;
}

.fullscreen-player-lyrics-plain .fullscreen-player-lyrics-track {
  padding-right: 0;
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
  text-align: center;
}

@media (max-width: 900px) {
  .fullscreen-player {
    --fullscreen-content-width: min(62vw, 320px);
    grid-template-columns: 1fr;
    grid-template-rows: max-content max-content;
    align-content: start;
    gap: 28px;
    overflow-y: auto;
    padding: 56px 28px 40px;
  }

  .fullscreen-player-left {
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    justify-self: center;
    width: var(--fullscreen-content-width);
  }

  .fullscreen-player-artwork-slot {
    flex-shrink: 0;
  }

  .fullscreen-player-lyrics {
    height: 52vh;
  }

  .fullscreen-player-meta-row {
    text-align: left;
  }

  /* The whole-sentence view keeps the cover/lyric alignment at the supported minimum width. */
  .fullscreen-player:has(.fullscreen-player-lyrics-whole) {
    --fullscreen-content-width: min(32vw, 320px);

    grid-template-columns: var(--fullscreen-content-width) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
    gap: clamp(32px, 5vw, 72px);
  }

  .fullscreen-player:has(.fullscreen-player-lyrics-whole) .fullscreen-player-left {
    align-items: stretch;
    justify-content: center;
    justify-self: auto;
    text-align: left;
  }

  .fullscreen-player:has(.fullscreen-player-lyrics-whole) .fullscreen-player-artwork-slot {
    flex-shrink: 1;
  }

  .fullscreen-player:has(.fullscreen-player-lyrics-whole) .fullscreen-player-lyrics {
    height: auto;
  }
}

:where([data-reduced-motion='true']) .fullscreen-player-lyrics-track {
  will-change: auto;
}

:where([data-reduced-motion='true']) .fullscreen-player-lyric-line,
:where([data-reduced-motion='true']) .fullscreen-player-prelude-dot {
  transition: none;
}

:where([data-reduced-motion='true']) .fullscreen-player-lyric-active,
:where([data-reduced-motion='true']) .fullscreen-player-prelude-dot {
  transform: none;
}
</style>
