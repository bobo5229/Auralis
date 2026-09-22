<script setup lang="ts">
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
import DesktopLyricsLockPopover from './DesktopLyricsLockPopover.vue'
import { useDesktopLyricsSync } from '@renderer/features/lyrics/composables/useDesktopLyricsSync'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { isPlayerVisualEffectsActive } from '@renderer/app/utils/playerVisualEffects'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'
import {
  usePlayerBarOverlayController,
  type PlayerBarOverlayId,
} from './playerBar/usePlayerBarOverlayController'
import { usePlayerBarIslandMetrics } from './playerBar/usePlayerBarIslandMetrics'
import { shouldOverflowModernUtilities } from '@renderer/features/playback/utils/modernPlayerBarLayout'
import { resolvePlaybarAccent } from '@renderer/features/playback/utils/resolvePlaybarAccent'
import { animateFrames } from '@renderer/shared/animation/motion'

const playback = usePlayback()
const { t } = useI18n()
const { displayMode } = usePlayerDisplayMode()
const currentArtworkCacheKey = computed(() => playback.state.currentTrack?.artworkCacheKey ?? null)
// Fullscreen and Miniplayer own their visual pipelines. The hidden PlayerBar
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
      '--auralis-active-album-tint': activeAlbumTint.value ?? 'transparent',
      '--auralis-active-album-accent': albumAccentColor.value,
    }) as CSSProperties,
)

// --- Queue popover ---
const queueButtonRef = ref<HTMLElement | null>(null)
const queuePopoverRef = ref<HTMLElement | null>(null)
const {
  isVisible: isDesktopLyricsVisible,
  isMousePassthroughEnabled: isDesktopLyricsMousePassthroughEnabled,
  toggle: toggleDesktopLyricsSession,
  toggleMousePassthrough: toggleDesktopLyricsMousePassthroughSession,
} = useDesktopLyricsSync()
const desktopLyricsToast = ref<string | null>(null)
let desktopLyricsToastTimer: ReturnType<typeof setTimeout> | null = null

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
let reducedMotion: MediaQueryList | undefined

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
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
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
const { isQueueOpen, isModeMenuOpen, isOverflowOpen, isDesktopLyricsLockOpen } = overlayController
const desktopLyricsButtonRef = ref<HTMLElement | null>(null)
const desktopLyricsLockPopoverRef = ref<HTMLElement | null>(null)
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

async function toggleDesktopLyrics(): Promise<void> {
  const result = await toggleDesktopLyricsSession()
  showDesktopLyricsToast(
    result.visible ? 'player.desktopLyrics.toastOn' : 'player.desktopLyrics.toastOff',
  )
}

function dismissDesktopLyricsToast(): void {
  desktopLyricsToast.value = null
  if (desktopLyricsToastTimer) {
    clearTimeout(desktopLyricsToastTimer)
    desktopLyricsToastTimer = null
  }
}

function toggleDesktopLyricsLockPopover(): void {
  dismissDesktopLyricsToast()
  overlayController.toggle('desktopLyricsLock')
}

function handleDesktopLyricsLockClose(restoreFocus = true): void {
  overlayController.close('desktopLyricsLock')
  if (!restoreFocus) return
  resolveRestorablePlayerTrigger(desktopLyricsButtonRef.value)?.focus()
}

async function handleDesktopLyricsLockChange(locked: boolean): Promise<void> {
  if (isDesktopLyricsMousePassthroughEnabled.value !== locked) {
    await toggleDesktopLyricsMousePassthroughSession()
    if (!isDesktopLyricsLockOpen.value) {
      const resultEnabled = isDesktopLyricsMousePassthroughEnabled.value
      showDesktopLyricsToast(
        resultEnabled ? 'player.desktopLyrics.lockedToast' : 'player.desktopLyrics.unlockedToast',
      )
    }
  }
}

function showDesktopLyricsToast(key: string): void {
  if (isDesktopLyricsLockOpen.value) return

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
  if (
    desktopLyricsButtonRef.value?.contains(target) ||
    desktopLyricsLockPopoverRef.value?.contains(target) ||
    ((target as Element).closest?.('.desktop-lyrics-lock-popover') ?? false)
  ) {
    inside.add('desktopLyricsLock')
  }
  if (volumeControlRef.value?.el?.contains(target)) {
    inside.add('volume')
  }
  overlayController.dismissOutside(inside)
}

watch(isUtilitiesOverflow, (collapsed) => {
  if (collapsed) return
  overlayController.closeMany(['overflow', 'mode', 'desktopLyricsLock'])
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
  if (desktopLyricsToastTimer) {
    clearTimeout(desktopLyricsToastTimer)
    desktopLyricsToastTimer = null
  }
  stopAlbumTint()
})

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
    <div ref="islandRef" class="player-bar-island">
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
            <span v-if="isPrimaryPlaybackPending" class="h-6 w-6 i-lucide-loader-circle" />
            <svg v-else class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <template v-if="playback.state.isPlaying">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </template>
              <path
                v-else
                d="M7 4.8c0-1.1 1.2-1.8 2.2-1.2l11 7.2c.9.6.9 1.8 0 2.4l-11 7.2C8.2 21 7 20.3 7 19.2V4.8Z"
              />
            </svg>
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
            ref="queueButtonRef"
            class="player-control"
            :class="{ 'player-control-active': isQueueOpen }"
            type="button"
            :aria-label="t('player.queue')"
            :aria-expanded="isQueueOpen"
            @click="toggleQueue"
          >
            <span class="playbar-action-icon h-4 w-4 i-lucide-list-music" />
          </button>

          <div ref="queuePopoverRef" class="contents">
            <PlaybackQueuePopover v-if="isQueueOpen" @close="handleQueueClose" />
          </div>

          <div v-if="!isUtilitiesOverflow" class="desktop-lyrics-control-wrap">
            <button
              ref="desktopLyricsButtonRef"
              class="player-control"
              :class="{
                'player-control-active': isDesktopLyricsVisible || isDesktopLyricsLockOpen,
              }"
              type="button"
              :aria-label="t('player.desktopLyrics.menu')"
              :aria-pressed="isDesktopLyricsVisible"
              :aria-expanded="isDesktopLyricsLockOpen"
              :title="t('player.desktopLyrics.titleToggle')"
              @click="toggleDesktopLyrics"
              @contextmenu.prevent="toggleDesktopLyricsLockPopover"
            >
              <span class="playbar-action-icon h-4 w-4 i-lucide-captions" />
            </button>
            <div ref="desktopLyricsLockPopoverRef" class="contents">
              <DesktopLyricsLockPopover
                v-if="isDesktopLyricsLockOpen"
                :is-locked="isDesktopLyricsMousePassthroughEnabled"
                @change="handleDesktopLyricsLockChange"
                @close="handleDesktopLyricsLockClose"
              />
            </div>
            <div
              v-if="desktopLyricsToast && !isDesktopLyricsLockOpen"
              class="player-overlay desktop-lyrics-toast"
            >
              {{ t(desktopLyricsToast) }}
            </div>
          </div>

          <button
            v-if="!isUtilitiesOverflow"
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

          <div v-if="isUtilitiesOverflow" class="player-bar-overflow">
            <button
              ref="overflowButtonRef"
              class="player-control"
              :class="{ 'player-control-active': isOverflowOpen || isModeMenuOpen }"
              type="button"
              :aria-label="t('player.more')"
              :aria-expanded="isOverflowOpen"
              @click="toggleOverflow"
            >
              <span class="playbar-action-icon h-4 w-4 i-lucide-more-horizontal" />
            </button>

            <div
              v-if="isOverflowOpen"
              ref="overflowPanelRef"
              class="player-overlay player-bar-overflow-panel"
              role="menu"
              :aria-label="t('player.more')"
              @keydown.esc="handleOverflowEscape"
            >
              <div class="desktop-lyrics-control-wrap">
                <button
                  class="player-control player-bar-overflow-item"
                  :class="{
                    'player-control-active': isDesktopLyricsVisible || isDesktopLyricsLockOpen,
                  }"
                  type="button"
                  role="menuitem"
                  :aria-label="t('player.desktopLyrics.menu')"
                  :aria-pressed="isDesktopLyricsVisible"
                  :aria-expanded="isDesktopLyricsLockOpen"
                  :title="t('player.desktopLyrics.titleToggle')"
                  @click="toggleDesktopLyrics"
                  @contextmenu.prevent="toggleDesktopLyricsLockPopover"
                >
                  <span class="playbar-action-icon h-4 w-4 i-lucide-captions" />
                  <span class="player-bar-overflow-label">{{
                    t('player.desktopLyrics.menu')
                  }}</span>
                </button>
                <DesktopLyricsLockPopover
                  v-if="isDesktopLyricsLockOpen"
                  :is-locked="isDesktopLyricsMousePassthroughEnabled"
                  @change="handleDesktopLyricsLockChange"
                  @close="handleDesktopLyricsLockClose"
                />
                <div
                  v-if="desktopLyricsToast && !isDesktopLyricsLockOpen"
                  class="player-overlay desktop-lyrics-toast"
                >
                  {{ t(desktopLyricsToast) }}
                </div>
              </div>

              <button
                ref="modeButtonRef"
                class="player-control player-bar-overflow-item"
                :class="{ 'player-control-active': isModeMenuOpen }"
                type="button"
                role="menuitem"
                :aria-label="t('player.mode')"
                :aria-expanded="isModeMenuOpen"
                @click="toggleModeMenu"
              >
                <span class="playbar-action-icon h-4 w-4" :class="playbackModeIconClass" />
                <span class="player-bar-overflow-label">{{ t('player.mode') }}</span>
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
