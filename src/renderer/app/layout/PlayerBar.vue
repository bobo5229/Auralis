<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { useAlbumTint } from '@renderer/features/playback/composables/useAlbumTint'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'
import PlayerVolumeControl from './PlayerVolumeControl.vue'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { isPlayerVisualEffectsActive } from '@renderer/app/utils/playerVisualEffects'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'
import {
  usePlayerBarOverlayController,
  type PlayerBarOverlayId,
} from './playerBar/usePlayerBarOverlayController'
import { usePlayerBarIslandMetrics } from './playerBar/usePlayerBarIslandMetrics'
import { usePlayerBarResponsiveFocus } from './playerBar/usePlayerBarResponsiveFocus'
import { shouldOverflowModernUtilities } from '@renderer/features/playback/utils/modernPlayerBarLayout'
import { resolvePlaybarAccent } from '@renderer/features/playback/utils/resolvePlaybarAccent'
import { animateFrames } from '@renderer/shared/animation/motion'
import { useTheme } from '@renderer/composables/useTheme'
import { useLyricsPanelVisibility } from '@renderer/features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelLayout } from './useLyricsPanelLayout'

const playback = usePlayback()
const { t } = useI18n()
const { isDark } = useTheme()
const { displayMode } = usePlayerDisplayMode()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
// Fullscreen owns its visual pipeline. The hidden PlayerBar
// must not decode artwork, paint canvases, or start palette work.
const isNormalPlayerDisplay = computed(() => displayMode.value === 'normal')
const paletteEnabled = computed(() => isPlayerVisualEffectsActive(displayMode.value))
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
  const primaryColor = resolvePlaybarAccent(
    playback.state.currentTrack ? albumPalette.value?.accents[0]?.rgb : null,
    isDark.value,
  )
  return `rgb(${primaryColor.r} ${primaryColor.g} ${primaryColor.b})`
})
const isPrimaryPlaybackPending = computed(() => playback.isPlaybackPending.value)
const isPrimaryPlaybackDisabled = computed(
  () => !playback.state.currentTrack || isPrimaryPlaybackPending.value,
)
const primaryPlaybackLabel = computed(() => {
  if (!playback.state.currentTrack) return t('player.playbackNoTrack')
  if (isPrimaryPlaybackPending.value) return t('player.playbackLoading')
  return playback.state.isPlaying ? t('player.pause') : t('player.play')
})
const playerBarStyle = computed(
  () =>
    ({
      '--auralis-active-album-tint': isDark.value
        ? 'transparent'
        : (activeAlbumTint.value ?? 'transparent'),
      '--auralis-active-album-accent': isDark.value
        ? 'var(--auralis-theme-accent, #1dd55f)'
        : albumAccentColor.value,
    }) as CSSProperties,
)

// --- Queue popover ---
const queueButtonRef = ref<HTMLElement | null>(null)
const queuePopoverRef = ref<HTMLElement | null>(null)

// Modern island: lyrics + mode stay first-class until the island is ≤640px.
const overflowButtonRef = ref<HTMLElement | null>(null)
const overflowPanelRef = ref<HTMLElement | null>(null)
const volumeControlRef = ref<{
  el: HTMLElement | null
  open: boolean
  dismiss: () => void
} | null>(null)
let volumeReveal = 0
let volumeVelocity = 0
let stopVolumeAnimation: (() => void) | undefined
let reducedMotion: MotionQuery | undefined

function animateVolumeReveal(): void {
  stopVolumeAnimation?.()
  const target = volumeControlRef.value?.open ? 1 : 0
  const paint = (): void => {
    playerBarHostRef.value?.style.setProperty('--volume-reveal', String(volumeReveal))
  }
  if (reducedMotion?.matches) {
    volumeReveal = target
    volumeVelocity = 0
    paint()
    return
  }
  stopVolumeAnimation = animateFrames((seconds) => {
    // Critically damped spring, with velocity retained when the user reverses direction.
    const offset = volumeReveal - target
    const decay = Math.exp(-18 * seconds)
    const coefficient = volumeVelocity + 18 * offset
    volumeReveal = target + (offset + coefficient * seconds) * decay
    volumeVelocity = (volumeVelocity - 18 * coefficient * seconds) * decay
    const settled = Math.abs(volumeReveal - target) < 0.001 && Math.abs(volumeVelocity) < 0.01
    if (settled) {
      volumeReveal = target
      volumeVelocity = 0
    }
    paint()
    return !settled
  })
}

watch(() => volumeControlRef.value?.open ?? false, animateVolumeReveal)
onMounted(() => {
  reducedMotion = createReducedMotionQuery()
  reducedMotion.addEventListener('change', animateVolumeReveal)
})
onUnmounted(() => {
  stopVolumeAnimation?.()
  reducedMotion?.removeEventListener('change', animateVolumeReveal)
})
const overlayController = usePlayerBarOverlayController({
  open: computed(() => volumeControlRef.value?.open ?? false),
  dismiss: () => volumeControlRef.value?.dismiss(),
})
const { isQueueOpen, isModeMenuOpen, isOverflowOpen } = overlayController
const playerBarHostRef = ref<HTMLElement | null>(null)
const islandRef = ref<HTMLElement | null>(null)

const { islandInlineSize } = usePlayerBarIslandMetrics({
  islandRef,
  hostRef: playerBarHostRef,
  enabled: isNormalPlayerDisplay,
})

const isUtilitiesOverflow = computed(() => shouldOverflowModernUtilities(islandInlineSize.value))

function toggleQueue(): void {
  overlayController.toggle('queue')
}

function handleQueueClose(): void {
  overlayController.close('queue')
  resolveRestorablePlayerTrigger(queueButtonRef.value)?.focus()
}

// --- Lyrics toggle ---
const { lyricsPanelExpanded, setLyricsPanelExpanded } = useLyricsPanelVisibility()
const { canDisplayLyricsPanel } = useLyricsPanelLayout()
const lyricsButtonRef = ref<HTMLElement | null>(null)
const overflowLyricsButtonRef = ref<HTMLElement | null>(null)

function toggleLyrics(): void {
  setLyricsPanelExpanded(!lyricsPanelExpanded.value)
}

function handleOverflowToggleLyrics(): void {
  setLyricsPanelExpanded(!lyricsPanelExpanded.value)
  closeOverflow()
  resolveRestorablePlayerTrigger(overflowButtonRef.value)?.focus()
}

// --- Mode menu ---
const modeButtonRef = ref<HTMLElement | null>(null)
const modeMenuRef = ref<HTMLElement | null>(null)

function toggleModeMenu(): void {
  overlayController.toggle('mode')
}

function handleModeMenuClose(restoreFocus = true): void {
  overlayController.close('mode')
  if (!restoreFocus) return
  resolveRestorablePlayerTrigger(modeButtonRef.value ?? overflowButtonRef.value)?.focus()
}

function handleSelectMode(mode: PlaybackMode, source: 'pointer' | 'keyboard' = 'keyboard'): void {
  playback.setPlaybackMode(mode)
  handleModeMenuClose(source !== 'pointer')
}

function toggleOverflow(): void {
  overlayController.toggle('overflow')
}

function closeOverflow(): void {
  overlayController.close('overflow')
}

function handleOverflowEscape(): void {
  if (!isOverflowOpen.value) return
  closeOverflow()
  resolveRestorablePlayerTrigger(overflowButtonRef.value)?.focus()
}

// --- Outside click ---
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return

  const inside = new Set<PlayerBarOverlayId>()
  if (queueButtonRef.value?.contains(target) || queuePopoverRef.value?.contains(target)) {
    inside.add('queue')
  }
  if (modeButtonRef.value?.contains(target) || modeMenuRef.value?.contains(target)) {
    inside.add('mode')
  }
  if (overflowButtonRef.value?.contains(target) || overflowPanelRef.value?.contains(target)) {
    inside.add('overflow')
  }
  if (volumeControlRef.value?.el?.contains(target)) {
    inside.add('volume')
  }
  overlayController.dismissOutside(inside)
}

usePlayerBarResponsiveFocus({
  overflow: isUtilitiesOverflow,
  lyricsAvailable: canDisplayLyricsPanel,
  enabled: isNormalPlayerDisplay,
  lyricsButton: lyricsButtonRef,
  overflowLyricsButton: overflowLyricsButtonRef,
  modeButton: modeButtonRef,
  overflowButton: overflowButtonRef,
  overflowPanel: overflowPanelRef,
  queueButton: queueButtonRef,
  closeOverflowPanels: () => overlayController.closeMany(['overflow', 'mode']),
})

watch(
  () => isNormalPlayerDisplay.value,
  (shouldObserveIsland) => {
    if (!shouldObserveIsland) closeOverflow()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  stopAlbumTint()
})

// --- Mode icon ---
const playbackModeIconClass = computed(() => {
  switch (playback.state.playbackMode) {
    case 'repeat-all':
      return 'i-ph-repeat'
    case 'repeat-one':
      return 'i-ph-repeat-once'
    case 'shuffle':
      return 'i-ph-shuffle'
    case 'album-shuffle':
      return 'i-ph-vinyl-record'
    case 'sequential':
    default:
      return 'i-ph-list-numbers'
  }
})

// --- Transport ---
function handlePlayPause(): void {
  if (isPrimaryPlaybackDisabled.value) return
  void playback.togglePlayPause()
}

function handlePrev(): void {
  playback.playPrevious()
}

function handleNext(): void {
  playback.playNext()
}
</script>

<template>
  <footer
    ref="playerBarHostRef"
    class="player-bar"
    :data-volume-expanded="volumeControlRef?.open ? 'true' : 'false'"
    :class="{
      'player-bar--album-tinted': hasActiveAlbumTint,
    }"
    :style="playerBarStyle"
  >
    <!-- Modern floating island: chrome lives on the island, not the host. -->
    <div ref="islandRef" class="player-bar-island" data-playbar-drop-target>
      <div class="player-bar-glass" aria-hidden="true"></div>
      <div
        v-if="paletteEnabled && previousAlbumTint"
        class="player-bar-album-tint player-bar-album-tint-previous"
        aria-hidden="true"
        :style="previousAlbumTintStyle"
      ></div>
      <div
        v-if="paletteEnabled && activeAlbumTint"
        class="player-bar-album-tint player-bar-album-tint-current"
        aria-hidden="true"
        :style="activeAlbumTintStyle"
      ></div>

      <div class="player-bar-row">
        <div
          class="transport-controls"
          :class="{ 'transport-controls--empty': !playback.state.currentTrack }"
        >
          <button
            class="transport-control"
            type="button"
            :aria-label="t('player.previous')"
            @click="handlePrev"
          >
            <svg class="h-4 w-5" viewBox="0 0 32 24" fill="currentColor" aria-hidden="true">
              <path
                d="M13 4.5C14.3 3.7 16 4.6 16 6.1v11.8c0 1.5-1.7 2.4-3 1.6L2.6 13.6a1.85 1.85 0 0 1 0-3.2L13 4.5Zm14 0c1.3-.8 3 .1 3 1.6v11.8c0 1.5-1.7 2.4-3 1.6l-10.4-5.9a1.85 1.85 0 0 1 0-3.2L27 4.5Z"
              />
            </svg>
          </button>
          <button
            class="transport-control-primary"
            :class="{ 'transport-control-primary--playing': playback.state.isPlaying }"
            type="button"
            :disabled="isPrimaryPlaybackDisabled"
            :aria-label="primaryPlaybackLabel"
            :aria-busy="isPrimaryPlaybackPending ? 'true' : undefined"
            @click="handlePlayPause"
          >
            <span v-if="isPrimaryPlaybackPending" class="h-6 w-6 i-ph-spinner-gap" />
            <span
              v-else
              class="h-6 w-6"
              :class="playback.state.isPlaying ? 'i-ph-music-note-fill' : 'i-ph-play-fill'"
              aria-hidden="true"
            />
          </button>
          <button
            class="transport-control"
            type="button"
            :aria-label="t('player.next')"
            @click="handleNext"
          >
            <svg class="h-4 w-5" viewBox="0 0 32 24" fill="currentColor" aria-hidden="true">
              <path
                transform="translate(32 0) scale(-1 1)"
                d="M13 4.5C14.3 3.7 16 4.6 16 6.1v11.8c0 1.5-1.7 2.4-3 1.6L2.6 13.6a1.85 1.85 0 0 1 0-3.2L13 4.5Zm14 0c1.3-.8 3 .1 3 1.6v11.8c0 1.5-1.7 2.4-3 1.6l-10.4-5.9a1.85 1.85 0 0 1 0-3.2L27 4.5Z"
              />
            </svg>
          </button>
        </div>

        <TrackProgressInfo show-split-clocks />

        <div class="playback-actions">
          <button
            v-if="!isUtilitiesOverflow"
            ref="modeButtonRef"
            class="player-bar-control"
            :class="{ 'player-bar-control-active': isModeMenuOpen }"
            type="button"
            :aria-label="t('player.mode')"
            :aria-expanded="isModeMenuOpen"
            @click="toggleModeMenu"
          >
            <span class="playbar-action-icon h-5 w-5" :class="playbackModeIconClass" />
          </button>

          <button
            ref="queueButtonRef"
            class="player-bar-control"
            :class="{ 'player-bar-control-active': isQueueOpen }"
            data-testid="player-queue-button"
            type="button"
            :aria-label="t('player.queue')"
            :aria-expanded="isQueueOpen"
            @click="toggleQueue"
          >
            <span class="playbar-action-icon h-5 w-5 i-ph-playlist" />
          </button>

          <div ref="queuePopoverRef" class="contents">
            <PlaybackQueuePopover v-if="isQueueOpen" @close="handleQueueClose" />
          </div>

          <button
            v-if="canDisplayLyricsPanel && !isUtilitiesOverflow"
            ref="lyricsButtonRef"
            class="player-bar-control"
            data-testid="player-lyrics-button"
            data-lyrics-toggle
            type="button"
            aria-controls="now-playing-panel"
            :aria-expanded="lyricsPanelExpanded"
            :aria-label="
              lyricsPanelExpanded ? t('player.lyricsCollapse') : t('player.lyricsExpand')
            "
            @click="toggleLyrics"
          >
            <span class="playbar-action-icon h-5 w-5 i-ph-text-align-left" aria-hidden="true" />
          </button>

          <div v-if="isUtilitiesOverflow" class="player-bar-overflow">
            <button
              ref="overflowButtonRef"
              class="player-bar-control"
              :class="{ 'player-bar-control-active': isOverflowOpen || isModeMenuOpen }"
              type="button"
              :aria-label="t('player.more')"
              :aria-expanded="isOverflowOpen"
              @click="toggleOverflow"
            >
              <span class="playbar-action-icon h-4 w-4 i-ph-dots-three" />
            </button>

            <div
              v-if="isOverflowOpen"
              ref="overflowPanelRef"
              class="player-overlay player-bar-overflow-panel"
              role="menu"
              :aria-label="t('player.more')"
              @keydown.esc="handleOverflowEscape"
            >
              <button
                ref="modeButtonRef"
                class="player-bar-control player-bar-overflow-item"
                :class="{ 'player-bar-control-active': isModeMenuOpen }"
                type="button"
                role="menuitem"
                :aria-label="t('player.mode')"
                :aria-expanded="isModeMenuOpen"
                @click="toggleModeMenu"
              >
                <span class="playbar-action-icon h-4 w-4" :class="playbackModeIconClass" />
                <span class="player-bar-overflow-label">{{ t('player.mode') }}</span>
              </button>

              <button
                v-if="canDisplayLyricsPanel"
                ref="overflowLyricsButtonRef"
                class="player-bar-control player-bar-overflow-item"
                data-lyrics-toggle
                type="button"
                role="menuitemcheckbox"
                :aria-checked="lyricsPanelExpanded"
                :aria-label="
                  lyricsPanelExpanded ? t('player.lyricsCollapse') : t('player.lyricsExpand')
                "
                @click="handleOverflowToggleLyrics"
              >
                <span class="playbar-action-icon h-4 w-4 i-ph-text-align-left" aria-hidden="true" />
                <span class="player-bar-overflow-label">{{
                  lyricsPanelExpanded ? t('player.lyricsCollapse') : t('player.lyricsExpand')
                }}</span>
                <span
                  v-if="lyricsPanelExpanded"
                  class="ml-auto h-4 w-4 i-ph-check"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div ref="modeMenuRef" class="contents">
            <PlaybackModeMenu
              v-if="isModeMenuOpen"
              :current-mode="playback.state.playbackMode"
              @select="handleSelectMode"
              @close="handleModeMenuClose"
            />
          </div>

          <PlayerVolumeControl
            ref="volumeControlRef"
            @activate="overlayController.activateVolume()"
          />
        </div>
      </div>
    </div>
  </footer>
</template>
