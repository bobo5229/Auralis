<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'
import { useTrackLyrics } from '@renderer/features/lyrics/composables/useTrackLyrics'
import {
  ensureDesktopLyricsFontReady,
  formatDesktopLyricsText,
} from '@renderer/features/lyrics/utils/formatDesktopLyricsText'
import { auralis } from '@renderer/shared/ipc/client'
import type { DesktopLyricsPayload, DesktopLyricsStatus } from '@shared/types/desktopLyrics'

const playback = usePlayback()
const lyrics = useTrackLyrics()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey)

const activeAlbumTint = ref<string | null>(null)
const previousAlbumTint = ref<string | null>(null)
let albumTintTimer: ReturnType<typeof setTimeout> | null = null

function formatAlbumColor(color: { r: number; g: number; b: number }): string {
  return `rgb(${color.r} ${color.g} ${color.b} / var(--auralis-playbar-album-alpha))`
}

const albumTint = computed(() => {
  const primaryColor = albumPalette.value?.accents[0]?.rgb
  if (!primaryColor || !playback.state.currentTrack) {
    return null
  }

  return formatAlbumColor(primaryColor)
})

const activeAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: activeAlbumTint.value ?? 'transparent',
}))

const previousAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: previousAlbumTint.value ?? 'transparent',
}))

const albumAccentColor = computed(() => {
  const primaryColor = albumPalette.value?.accents[0]?.rgb
  if (!primaryColor || !playback.state.currentTrack) {
    return null
  }
  return `rgb(${primaryColor.r} ${primaryColor.g} ${primaryColor.b})`
})

const hasActiveAlbumTint = computed(() => activeAlbumTint.value !== null)
const playerBarStyle = computed(
  () =>
    ({
      '--auralis-active-album-tint': activeAlbumTint.value ?? 'transparent',
      '--auralis-active-album-accent':
        albumAccentColor.value ?? 'var(--auralis-sidebar-active-indicator)',
    }) as CSSProperties,
)

// --- Queue popover ---
const isQueueOpen = ref(false)
const queueButtonRef = ref<HTMLElement | null>(null)
const queuePopoverRef = ref<HTMLElement | null>(null)
const isDesktopLyricsVisible = ref(false)
const isDesktopLyricsMousePassthroughEnabled = ref(true)
const desktopLyricsToast = ref<string | null>(null)
let unsubscribeDesktopLyricsVisibility: (() => void) | null = null
let unsubscribeDesktopLyricsMousePassthrough: (() => void) | null = null
let desktopLyricsToastTimer: ReturnType<typeof setTimeout> | null = null
/** Last IPC payload fingerprint — skip identical line-level updates. */
let lastDesktopLyricsPayloadKey: string | null = null

function toggleQueue(): void {
  isQueueOpen.value = !isQueueOpen.value
}

function closeQueue(): void {
  isQueueOpen.value = false
}

function getPlainLyricLines(rawLyrics: string | null): string[] {
  return (rawLyrics ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildDesktopLyricsPayload(): DesktopLyricsPayload {
  const track = playback.state.currentTrack
  const status: DesktopLyricsStatus =
    lyrics.status.value === 'no-track' ? 'idle' : lyrics.status.value

  if (!track) {
    return {
      trackId: null,
      title: null,
      artist: null,
      currentLine: '',
      nextLine: '',
      status: 'idle',
      isPlaying: false,
    }
  }

  let currentLine = ''
  let nextLine = ''

  if (lyrics.status.value === 'loading') {
    currentLine = '歌词加载中'
  } else if (lyrics.status.value === 'empty') {
    currentLine = '暂无歌词'
  } else if (lyrics.status.value === 'plain') {
    const lines = getPlainLyricLines(lyrics.rawLyrics.value)
    currentLine = lines[0] ?? '暂无歌词'
    nextLine = lines[1] ?? ''
  } else if (lyrics.status.value === 'lrc') {
    const lines = lyrics.parsedLines.value.filter((line) => line.text.length > 0)
    const activeIndex = lines.findIndex(
      (line) => line.id === lyrics.parsedLines.value[lyrics.activeIndex.value]?.id,
    )

    if (activeIndex >= 0) {
      currentLine = lines[activeIndex]?.text ?? ''
      nextLine = lines[activeIndex + 1]?.text ?? ''
    } else {
      currentLine = lyrics.showPrelude.value ? '.'.repeat(lyrics.preludeLitDotCount.value) : ''
      nextLine = lines[0]?.text ?? ''
    }
  }

  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    currentLine: formatDesktopLyricsText(currentLine),
    nextLine: formatDesktopLyricsText(nextLine),
    status,
    isPlaying: playback.state.isPlaying,
  }
}

function getDesktopLyricsPayloadKey(payload: DesktopLyricsPayload): string {
  return [
    payload.trackId ?? '',
    payload.title ?? '',
    payload.artist ?? '',
    payload.currentLine,
    payload.nextLine,
    payload.status,
    payload.isPlaying ? '1' : '0',
  ].join('\0')
}

/**
 * Push desktop lyrics state to the secondary window.
 * Skips when the window is hidden (unless force) and when the line-level payload is unchanged.
 * Intentionally does not depend on currentTime ticks — activeIndex / prelude drive line changes.
 */
function syncDesktopLyrics(force = false): void {
  if (!force && !isDesktopLyricsVisible.value) return

  const payload = buildDesktopLyricsPayload()
  const key = getDesktopLyricsPayloadKey(payload)
  if (!force && key === lastDesktopLyricsPayloadKey) return

  lastDesktopLyricsPayloadKey = key
  void auralis.desktopLyrics.update(payload)
}

async function toggleDesktopLyrics(): Promise<void> {
  const result = await auralis.desktopLyrics.toggle()
  isDesktopLyricsVisible.value = result.visible
  showDesktopLyricsToast(result.visible ? '桌面歌词已开启' : '桌面歌词已关闭')
  if (result.visible) {
    syncDesktopLyrics(true)
  }
}

async function toggleDesktopLyricsMousePassthrough(event: MouseEvent): Promise<void> {
  event.preventDefault()
  const result = await auralis.desktopLyrics.toggleMousePassthrough()
  isDesktopLyricsMousePassthroughEnabled.value = result.enabled
  showDesktopLyricsToast(result.enabled ? '鼠标穿透已开启' : '鼠标穿透已关闭')
}

function showDesktopLyricsToast(message: string): void {
  desktopLyricsToast.value = message

  if (desktopLyricsToastTimer) {
    clearTimeout(desktopLyricsToastTimer)
  }

  desktopLyricsToastTimer = setTimeout(() => {
    desktopLyricsToast.value = null
    desktopLyricsToastTimer = null
  }, 1200)
}

// --- Mode menu ---
const isModeMenuOpen = ref(false)
const modeButtonRef = ref<HTMLElement | null>(null)
const modeMenuRef = ref<HTMLElement | null>(null)

function toggleModeMenu(): void {
  isModeMenuOpen.value = !isModeMenuOpen.value
}

function closeModeMenu(): void {
  isModeMenuOpen.value = false
}

function handleSelectMode(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  closeModeMenu()
}

// --- Outside click ---
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return

  if (isQueueOpen.value) {
    if (queueButtonRef.value?.contains(target)) return
    if (queuePopoverRef.value?.contains(target)) return
    closeQueue()
  }

  if (isModeMenuOpen.value) {
    if (modeButtonRef.value?.contains(target)) return
    if (modeMenuRef.value?.contains(target)) return
    closeModeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  void ensureDesktopLyricsFontReady().then(() => {
    if (isDesktopLyricsVisible.value) {
      syncDesktopLyrics(true)
    }
  })
  void auralis.desktopLyrics.isVisible().then((result) => {
    isDesktopLyricsVisible.value = result.visible
    if (result.visible) {
      syncDesktopLyrics(true)
    }
  })
  void auralis.desktopLyrics.isMousePassthroughEnabled().then((result) => {
    isDesktopLyricsMousePassthroughEnabled.value = result.enabled
  })
  unsubscribeDesktopLyricsVisibility = auralis.desktopLyrics.onVisibilityChanged((visible) => {
    isDesktopLyricsVisible.value = visible
    if (visible) {
      syncDesktopLyrics(true)
    }
  })
  unsubscribeDesktopLyricsMousePassthrough = auralis.desktopLyrics.onMousePassthroughChanged(
    (enabled) => {
      isDesktopLyricsMousePassthroughEnabled.value = enabled
    },
  )
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  unsubscribeDesktopLyricsVisibility?.()
  unsubscribeDesktopLyricsVisibility = null
  unsubscribeDesktopLyricsMousePassthrough?.()
  unsubscribeDesktopLyricsMousePassthrough = null
  if (desktopLyricsToastTimer) {
    clearTimeout(desktopLyricsToastTimer)
    desktopLyricsToastTimer = null
  }
  if (albumTintTimer) {
    clearTimeout(albumTintTimer)
    albumTintTimer = null
  }
})

watch(
  albumTint,
  (nextTint) => {
    if (nextTint === activeAlbumTint.value) {
      return
    }

    if (albumTintTimer) {
      clearTimeout(albumTintTimer)
      albumTintTimer = null
    }

    previousAlbumTint.value = activeAlbumTint.value
    activeAlbumTint.value = nextTint

    albumTintTimer = setTimeout(() => {
      previousAlbumTint.value = null
      albumTintTimer = null
    }, 420)
  },
  { immediate: true },
)

// Do not watch currentTime — it fires every media tick. Line changes already
// surface via activeIndex / preludeLitDotCount; track/play/status cover the rest.
watch(
  () => [
    playback.state.currentTrackId,
    playback.state.currentTrack?.title,
    playback.state.currentTrack?.artist,
    playback.state.isPlaying,
    lyrics.status.value,
    lyrics.rawLyrics.value,
    lyrics.activeIndex.value,
    lyrics.showPrelude.value,
    lyrics.preludeLitDotCount.value,
    lyrics.parsedLines.value.length,
  ],
  () => {
    syncDesktopLyrics()
  },
  { immediate: true },
)

// --- Mode icon ---
const playbackModeIconClass = computed(() => {
  switch (playback.state.playbackMode) {
    case 'repeat-all':
      return 'i-lucide-repeat'
    case 'repeat-one':
      return 'i-lucide-repeat-1'
    case 'shuffle':
      return 'i-lucide-shuffle'
    case 'album-shuffle':
      return 'i-lucide-disc-3'
    case 'sequential':
    default:
      return 'i-lucide-list-end'
  }
})

// --- Volume ---
const volumeIconClass = computed(() => {
  if (playback.state.isMuted) {
    return 'i-lucide-volume-x'
  }

  const volume = playback.state.volume

  if (volume <= 0) {
    return 'i-lucide-volume'
  }

  if (volume <= 0.33) {
    return 'i-lucide-volume'
  }

  if (volume <= 0.66) {
    return 'i-lucide-volume-1'
  }

  return 'i-lucide-volume-2'
})

const volumeSliderStyle = computed(() => {
  const percentage = `${Math.round(playback.state.volume * 100)}%`

  return {
    background: `linear-gradient(to right, var(--auralis-active-album-accent) 0%, var(--auralis-active-album-accent) ${percentage}, var(--auralis-progress-track) ${percentage}, var(--auralis-progress-track) 100%)`,
  }
})

// --- Transport ---
function handlePlayPause(): void {
  playback.togglePlayPause()
}

function handlePrev(): void {
  playback.playPrevious()
}

function handleNext(): void {
  playback.playNext()
}

function handleToggleMute(): void {
  playback.toggleMute()
}
</script>

<template>
  <footer
    class="player-bar"
    :class="{ 'player-bar--album-tinted': hasActiveAlbumTint }"
    :style="playerBarStyle"
  >
    <div class="player-bar-glass" aria-hidden="true"></div>

    <div
      v-if="previousAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-previous"
      aria-hidden="true"
      :style="previousAlbumTintStyle"
    ></div>
    <div
      v-if="activeAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-current"
      aria-hidden="true"
      :style="activeAlbumTintStyle"
    ></div>

    <div class="transport-controls">
      <button
        class="transport-control"
        type="button"
        aria-label="Previous track"
        @click="handlePrev"
      >
        <span class="h-4 w-4 i-lucide-skip-back" />
      </button>
      <button
        class="transport-control-primary"
        type="button"
        :aria-label="playback.state.isPlaying ? 'Pause' : 'Play'"
        @click="handlePlayPause"
      >
        <span
          class="h-5 w-5"
          :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        />
      </button>
      <button class="transport-control" type="button" aria-label="Next track" @click="handleNext">
        <span class="h-4 w-4 i-lucide-skip-forward" />
      </button>
    </div>

    <TrackProgressInfo />

    <div class="playback-actions">
      <div class="desktop-lyrics-control-wrap">
        <button
          class="player-control"
          :class="{ 'player-control-active': isDesktopLyricsVisible }"
          type="button"
          :aria-label="
            isDesktopLyricsMousePassthroughEnabled
              ? 'Desktop lyrics, mouse passthrough enabled'
              : 'Desktop lyrics, mouse passthrough disabled'
          "
          :aria-pressed="isDesktopLyricsVisible"
          :title="
            isDesktopLyricsMousePassthroughEnabled
              ? 'Right-click to disable mouse passthrough'
              : 'Right-click to enable mouse passthrough'
          "
          @click="toggleDesktopLyrics"
          @contextmenu="toggleDesktopLyricsMousePassthrough"
        >
          <span class="playbar-action-icon h-4 w-4 i-lucide-captions" />
        </button>
        <div v-if="desktopLyricsToast" class="desktop-lyrics-toast">
          {{ desktopLyricsToast }}
        </div>
      </div>

      <button
        ref="queueButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isQueueOpen }"
        type="button"
        aria-label="Playback queue"
        :aria-expanded="isQueueOpen"
        @click="toggleQueue"
      >
        <span class="playbar-action-icon h-4 w-4 i-lucide-list-music" />
      </button>

      <div ref="queuePopoverRef" class="contents">
        <PlaybackQueuePopover v-if="isQueueOpen" :anchor-ref="queueButtonRef" @close="closeQueue" />
      </div>

      <button
        ref="modeButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isModeMenuOpen }"
        type="button"
        aria-label="Playback mode"
        :aria-expanded="isModeMenuOpen"
        @click="toggleModeMenu"
      >
        <span class="playbar-action-icon h-4 w-4" :class="playbackModeIconClass" />
      </button>

      <div ref="modeMenuRef" class="contents">
        <PlaybackModeMenu
          v-if="isModeMenuOpen"
          :current-mode="playback.state.playbackMode"
          @select="handleSelectMode"
          @close="closeModeMenu"
        />
      </div>

      <div class="volume-control-group">
        <button
          class="player-control"
          type="button"
          :aria-label="playback.state.isMuted ? 'Unmute' : 'Mute'"
          @click="handleToggleMute"
        >
          <span class="playbar-action-icon h-4 w-4" :class="volumeIconClass" />
        </button>
        <input
          type="range"
          class="volume-slider"
          min="0"
          max="1"
          step="0.01"
          :value="playback.state.volume"
          :style="volumeSliderStyle"
          aria-label="Volume"
          @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </footer>
</template>
