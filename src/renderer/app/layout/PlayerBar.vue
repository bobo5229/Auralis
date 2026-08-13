<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { useAlbumTint } from '@renderer/features/playback/composables/useAlbumTint'
import { usePlayerBarMaterial } from '@renderer/features/settings/composables/usePlayerBarMaterial'
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
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import {
  resolvePlayerPaletteEnabled,
  type PlayerSurfacePresentation,
} from '@renderer/app/utils/playerSurfacePresentation'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'

const props = defineProps<{ presentation: PlayerSurfacePresentation }>()

const playback = usePlayback()
const { t } = useI18n()
const lyrics = useTrackLyrics()
const { playerBarMaterial } = usePlayerBarMaterial()
const { displayMode } = usePlayerDisplayMode()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
// Phase 18: palette extraction and album tint only run for the modern player
// presentation while the surface is the visible one; the hidden PlayerBar
// under fullscreen must not decode images, paint canvases or start worker
// colour work (TECHDOC §6.1 risk).
const isModernPlayer = computed(() => props.presentation === 'modern')
const paletteEnabled = computed(() =>
  resolvePlayerPaletteEnabled({
    presentation: props.presentation,
    displayMode: displayMode.value,
  }),
)
const { palette: albumPalette } = useArtworkPalette(currentArtworkCacheKey, {
  enabled: paletteEnabled,
})

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

const {
  activeAlbumTint,
  previousAlbumTint,
  hasActiveAlbumTint,
  stop: stopAlbumTint,
} = useAlbumTint(albumTint, paletteEnabled)

const activeAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: activeAlbumTint.value ?? 'transparent',
}))

const previousAlbumTintStyle = computed<CSSProperties>(() => ({
  backgroundColor: previousAlbumTint.value ?? 'transparent',
}))

const albumAccentColor = computed(() => {
  // manuscript 使用稳定档案 accent，不从旧封面保留颜色（TECHDOC §6.2）
  if (!isModernPlayer.value) {
    return 'var(--manuscript-accent-primary)'
  }

  const primaryColor = albumPalette.value?.accents[0]?.rgb
  if (!primaryColor || !playback.state.currentTrack) {
    return null
  }
  return `rgb(${primaryColor.r} ${primaryColor.g} ${primaryColor.b})`
})
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
  // Queue and mode menu are mutually exclusive — only one document keydown
  // listener stays active at a time (§8.4).
  isModeMenuOpen.value = false
  isQueueOpen.value = !isQueueOpen.value
}

function closeQueue(): void {
  isQueueOpen.value = false
}

function handleQueueClose(): void {
  isQueueOpen.value = false
  resolveRestorablePlayerTrigger(queueButtonRef.value)?.focus()
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
    currentLine = t('player.lyricsLoading')
  } else if (lyrics.status.value === 'empty') {
    currentLine = t('player.lyricsEmpty')
  } else if (lyrics.status.value === 'plain') {
    const lines = getPlainLyricLines(lyrics.rawLyrics.value)
    currentLine = lines[0] ?? t('player.lyricsEmpty')
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
  showDesktopLyricsToast(
    result.visible ? 'player.desktopLyrics.toastOn' : 'player.desktopLyrics.toastOff',
  )
  if (result.visible) {
    syncDesktopLyrics(true)
  }
}

async function toggleDesktopLyricsMousePassthrough(event: MouseEvent): Promise<void> {
  event.preventDefault()
  const result = await auralis.desktopLyrics.toggleMousePassthrough()
  isDesktopLyricsMousePassthroughEnabled.value = result.enabled
  showDesktopLyricsToast(
    result.enabled ? 'player.desktopLyrics.passthroughOn' : 'player.desktopLyrics.passthroughOff',
  )
}

function showDesktopLyricsToast(key: string): void {
  desktopLyricsToast.value = key

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
  isQueueOpen.value = false
  isModeMenuOpen.value = !isModeMenuOpen.value
}

function closeModeMenu(): void {
  isModeMenuOpen.value = false
}

function handleModeMenuClose(): void {
  isModeMenuOpen.value = false
  resolveRestorablePlayerTrigger(modeButtonRef.value)?.focus()
}

function handleSelectMode(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  // Close through the same path as Escape so the mode button regains focus
  // after keyboard or mouse selection (P2).
  handleModeMenuClose()
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
  stopAlbumTint()
})

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
      return 'i-ri-repeat-fill'
    case 'repeat-one':
      return 'i-ri-repeat-one-fill'
    case 'shuffle':
      return 'i-ri-shuffle-fill'
    case 'album-shuffle':
      return 'i-ri-disc-fill'
    case 'sequential':
    default:
      return 'i-ri-play-list-fill'
  }
})

// --- Volume ---
const volumeIconClass = computed(() => {
  if (playback.state.isMuted) {
    return 'i-ri-volume-mute-fill'
  }

  const volume = playback.state.volume

  if (volume <= 0) {
    return 'i-ri-volume-mute-fill'
  }

  if (volume <= 0.4) {
    return 'i-ri-volume-down-fill'
  }

  return 'i-ri-volume-up-fill'
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
    :data-player-presentation="props.presentation"
    :class="{
      'player-bar--album-tinted': hasActiveAlbumTint,
      'player-bar--liquid-glass': playerBarMaterial === 'liquid-glass',
    }"
    :style="playerBarStyle"
  >
    <div class="player-bar-glass" aria-hidden="true"></div>

    <div
      v-if="paletteEnabled && playerBarMaterial === 'cover-tint' && previousAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-previous"
      aria-hidden="true"
      :style="previousAlbumTintStyle"
    ></div>
    <div
      v-if="paletteEnabled && playerBarMaterial === 'cover-tint' && activeAlbumTint"
      class="player-bar-album-tint player-bar-album-tint-current"
      aria-hidden="true"
      :style="activeAlbumTintStyle"
    ></div>

    <div class="transport-controls">
      <button
        class="transport-control"
        type="button"
        :aria-label="t('player.previous')"
        @click="handlePrev"
      >
        <span class="h-4 w-4 i-lucide-skip-back" />
      </button>
      <button
        class="transport-control-primary"
        type="button"
        :aria-label="playback.state.isPlaying ? t('player.pause') : t('player.play')"
        @click="handlePlayPause"
      >
        <span
          class="h-5 w-5"
          :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
        />
      </button>
      <button
        class="transport-control"
        type="button"
        :aria-label="t('player.next')"
        @click="handleNext"
      >
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
              ? t('player.desktopLyrics.ariaPassthroughOn')
              : t('player.desktopLyrics.ariaPassthroughOff')
          "
          :aria-pressed="isDesktopLyricsVisible"
          :title="
            isDesktopLyricsMousePassthroughEnabled
              ? t('player.desktopLyrics.titlePassthroughOn')
              : t('player.desktopLyrics.titlePassthroughOff')
          "
          @click="toggleDesktopLyrics"
          @contextmenu="toggleDesktopLyricsMousePassthrough"
        >
          <span class="playbar-action-icon h-4 w-4 i-lucide-captions" />
        </button>
        <div
          v-if="desktopLyricsToast"
          class="player-overlay desktop-lyrics-toast"
          :data-player-presentation="props.presentation"
        >
          {{ t(desktopLyricsToast) }}
        </div>
      </div>

      <button
        ref="queueButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isQueueOpen }"
        type="button"
        :aria-label="t('player.queue')"
        :aria-expanded="isQueueOpen"
        @click="toggleQueue"
      >
        <span class="playbar-action-icon h-4 w-4 i-ri-play-list-2-fill" />
      </button>

      <div ref="queuePopoverRef" class="contents">
        <PlaybackQueuePopover
          v-if="isQueueOpen"
          :presentation="props.presentation"
          @close="handleQueueClose"
        />
      </div>

      <button
        ref="modeButtonRef"
        class="player-control"
        :class="{ 'player-control-active': isModeMenuOpen }"
        type="button"
        :aria-label="t('player.mode')"
        :aria-expanded="isModeMenuOpen"
        @click="toggleModeMenu"
      >
        <span class="playbar-action-icon h-4 w-4" :class="playbackModeIconClass" />
      </button>

      <div ref="modeMenuRef" class="contents">
        <PlaybackModeMenu
          v-if="isModeMenuOpen"
          :current-mode="playback.state.playbackMode"
          :presentation="props.presentation"
          @select="handleSelectMode"
          @close="handleModeMenuClose"
        />
      </div>

      <div class="volume-control-group">
        <button
          class="player-control"
          type="button"
          :aria-label="playback.state.isMuted ? t('player.unmute') : t('player.mute')"
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
          :aria-label="t('player.volume')"
          @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </footer>
</template>
