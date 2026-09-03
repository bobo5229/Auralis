<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { useAlbumTint } from '@renderer/features/playback/composables/useAlbumTint'
import { useVolumeOverlay } from '@renderer/features/playback/composables/useVolumeOverlay'
import { usePlayerBarMaterial } from '@renderer/features/settings/composables/usePlayerBarMaterial'
import type { PlaybackMode } from '@renderer/features/playback/types'
import TrackProgressInfo from './TrackProgressInfo.vue'
import PlayerBarTimeColophon from './PlayerBarTimeColophon.vue'
import PlaybackQueuePopover from './PlaybackQueuePopover.vue'
import PlaybackModeMenu from './PlaybackModeMenu.vue'
import DesktopLyricsLockPopover from './DesktopLyricsLockPopover.vue'
import PlaybarQueueIcon from '@renderer/features/playback/components/PlaybarQueueIcon.vue'
import PlaybarLyricsIcon from '@renderer/features/playback/components/PlaybarLyricsIcon.vue'
import { useDesktopLyricsSync } from '@renderer/features/lyrics/composables/useDesktopLyricsSync'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import {
  resolvePlayerPaletteEnabled,
  type PlayerSurfacePresentation,
} from '@renderer/app/utils/playerSurfacePresentation'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'
import {
  usePlayerBarOverlayController,
  type PlayerBarOverlayId,
} from './playerBar/usePlayerBarOverlayController'
import {
  MODERN_PLAYER_BAR_MAX_WIDTH_PX,
  shouldOverflowModernUtilities,
} from '@renderer/features/playback/utils/modernPlayerBarLayout'
import { isPlayerBarVolumeOverlayRetreatActive } from '@renderer/features/playback/utils/playerBarExclusiveOverlay'
import { resolvePlayerPrimaryButtonTextColor } from '@renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor'

const props = defineProps<{ presentation: PlayerSurfacePresentation }>()

const playback = usePlayback()
const { t } = useI18n()
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
const isPrimaryPlaybackPending = computed(
  () => isModernPlayer.value && playback.isPlaybackPending.value,
)
const isPrimaryPlaybackDisabled = computed(
  () => !playback.state.currentTrack || isPrimaryPlaybackPending.value,
)
const primaryPlaybackLabel = computed(() => {
  if (!playback.state.currentTrack) return t('player.playbackNoTrack')
  if (isPrimaryPlaybackPending.value) return t('player.playbackLoading')
  return playback.state.isPlaying ? t('player.pause') : t('player.play')
})
const primaryPlaybackIconClass = computed(() => {
  if (isPrimaryPlaybackPending.value) return 'i-lucide-loader-circle'
  return playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'
})
const modernPrimaryPlaybackButtonStyle = computed<CSSProperties>(() => {
  const primaryColor = playback.state.currentTrack ? albumPalette.value?.accents[0]?.rgb : undefined

  return {
    '--auralis-player-primary-button-bg':
      primaryColor && albumAccentColor.value
        ? albumAccentColor.value
        : 'var(--auralis-control-primary-bg)',
    '--auralis-player-primary-button-fg': primaryColor
      ? resolvePlayerPrimaryButtonTextColor(primaryColor)
      : 'var(--auralis-control-primary-text)',
  } as CSSProperties
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
const volumeGroupRef = ref<HTMLElement | null>(null)
const volumeMuteButtonRef = ref<HTMLButtonElement | null>(null)
const volumeOverlay = useVolumeOverlay(() => volumeGroupRef.value)
const overlayController = usePlayerBarOverlayController(volumeOverlay)
const { isQueueOpen, isModeMenuOpen, isOverflowOpen, isDesktopLyricsLockOpen, isVolumeOpen } =
  overlayController
const desktopLyricsButtonRef = ref<HTMLElement | null>(null)
const desktopLyricsLockPopoverRef = ref<HTMLElement | null>(null)
const playerBarHostRef = ref<HTMLElement | null>(null)
const hostInlineSize = ref(Number.POSITIVE_INFINITY)
const islandRef = ref<HTMLElement | null>(null)
const islandInlineSize = ref(MODERN_PLAYER_BAR_MAX_WIDTH_PX)
let islandResizeObserver: ResizeObserver | null = null

const isUtilitiesOverflow = computed(() => shouldOverflowModernUtilities(islandInlineSize.value))

function syncIslandInlineSize(width: number): void {
  if (!Number.isFinite(width) || width <= 0) return
  islandInlineSize.value = width
}

function bindIslandObserver(): void {
  islandResizeObserver?.disconnect()
  islandResizeObserver = null
  const el = islandRef.value
  if (!el || !isModernPlayer.value) return

  islandResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    const size = entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? el.clientWidth
    syncIslandInlineSize(size)
  })
  islandResizeObserver.observe(el)
  syncIslandInlineSize(el.getBoundingClientRect().width)
}

function unbindIslandObserver(): void {
  islandResizeObserver?.disconnect()
  islandResizeObserver = null
}

function toggleQueue(): void {
  overlayController.toggle('queue')
}

function measureHostInlineSize(): number {
  const width = playerBarHostRef.value?.getBoundingClientRect().width
  if (width && Number.isFinite(width) && width > 0) {
    hostInlineSize.value = width
    return width
  }
  return hostInlineSize.value
}

function isVolumeOverlayRetreatActive(): boolean {
  return isPlayerBarVolumeOverlayRetreatActive({
    presentation: props.presentation,
    surfaceInlineSizePx: isModernPlayer.value ? islandInlineSize.value : measureHostInlineSize(),
  })
}

function applyVolumeHoverExclusivity(): void {
  if (isVolumeOverlayRetreatActive()) overlayController.activateVolume()
}

function handleVolumePointerEnter(): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onPointerEnter()
}

function handleVolumeFocusIn(event: FocusEvent): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onFocusIn(event)
}

function handleVolumeSliderPointerDown(): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onSliderPointerDown()
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
  if (volumeGroupRef.value?.contains(target)) {
    inside.add('volume')
  }
  overlayController.dismissOutside(inside)
}

watch(isUtilitiesOverflow, (collapsed) => {
  if (collapsed) return
  overlayController.closeMany(['overflow', 'mode', 'desktopLyricsLock'])
})

watch(
  isModernPlayer,
  async (modern) => {
    if (!modern) {
      unbindIslandObserver()
      closeOverflow()
      return
    }
    await nextTick()
    bindIslandObserver()
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  if (isModernPlayer.value) {
    bindIslandObserver()
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  if (desktopLyricsToastTimer) {
    clearTimeout(desktopLyricsToastTimer)
    desktopLyricsToastTimer = null
  }
  unbindIslandObserver()
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
    '--volume-percent': percentage,
    '--volume-track-bg': `linear-gradient(to right, var(--auralis-active-album-accent) 0%, var(--auralis-active-album-accent) ${percentage}, var(--auralis-progress-track) ${percentage}, var(--auralis-progress-track) 100%)`,
    background: 'transparent',
  }
})

function handleVolumeOverlayEscape(): void {
  if (!isVolumeOpen.value) return
  overlayController.close('volume')
  volumeMuteButtonRef.value?.focus()
}

// --- Transport ---
function handlePlayPause(): void {
  if (isModernPlayer.value && isPrimaryPlaybackDisabled.value) return
  void playback.togglePlayPause()
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
    ref="playerBarHostRef"
    class="player-bar"
    :data-player-presentation="props.presentation"
    :class="{
      'player-bar--album-tinted': hasActiveAlbumTint,
      'player-bar--liquid-glass': playerBarMaterial === 'liquid-glass',
    }"
    :style="playerBarStyle"
  >
    <!-- Modern floating island: chrome lives on the island, not the host. -->
    <template v-if="isModernPlayer">
      <div ref="islandRef" class="player-bar-island">
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

        <div class="player-bar-row">
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
              :style="modernPrimaryPlaybackButtonStyle"
              :disabled="isPrimaryPlaybackDisabled"
              :aria-label="primaryPlaybackLabel"
              :aria-busy="isPrimaryPlaybackPending ? 'true' : undefined"
              @click="handlePlayPause"
            >
              <span class="h-5 w-5" :class="primaryPlaybackIconClass" />
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
              <PlaybarQueueIcon class="playbar-action-icon h-4 w-4" />
            </button>

            <div ref="queuePopoverRef" class="contents">
              <PlaybackQueuePopover
                v-if="isQueueOpen"
                :presentation="props.presentation"
                @close="handleQueueClose"
              />
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
                <PlaybarLyricsIcon class="playbar-action-icon h-4 w-4" />
              </button>
              <div ref="desktopLyricsLockPopoverRef" class="contents">
                <DesktopLyricsLockPopover
                  v-if="isDesktopLyricsLockOpen"
                  :is-locked="isDesktopLyricsMousePassthroughEnabled"
                  :presentation="props.presentation"
                  @change="handleDesktopLyricsLockChange"
                  @close="handleDesktopLyricsLockClose"
                />
              </div>
              <div
                v-if="desktopLyricsToast && !isDesktopLyricsLockOpen"
                class="player-overlay desktop-lyrics-toast"
                :data-player-presentation="props.presentation"
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
                :data-player-presentation="props.presentation"
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
                    <PlaybarLyricsIcon class="playbar-action-icon h-4 w-4" />
                    <span class="player-bar-overflow-label">{{
                      t('player.desktopLyrics.menu')
                    }}</span>
                  </button>
                  <DesktopLyricsLockPopover
                    v-if="isDesktopLyricsLockOpen"
                    :is-locked="isDesktopLyricsMousePassthroughEnabled"
                    :presentation="props.presentation"
                    @change="handleDesktopLyricsLockChange"
                    @close="handleDesktopLyricsLockClose"
                  />
                  <div
                    v-if="desktopLyricsToast && !isDesktopLyricsLockOpen"
                    class="player-overlay desktop-lyrics-toast"
                    :data-player-presentation="props.presentation"
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
                :presentation="props.presentation"
                @select="handleSelectMode"
                @close="handleModeMenuClose"
              />
            </div>

            <div
              ref="volumeGroupRef"
              class="volume-control-group"
              :data-volume-open="isVolumeOpen ? 'true' : 'false'"
              @pointerenter="handleVolumePointerEnter"
              @pointerleave="volumeOverlay.onPointerLeave"
              @focusin="handleVolumeFocusIn"
              @focusout="volumeOverlay.onFocusOut"
              @keydown.esc="handleVolumeOverlayEscape"
            >
              <button
                ref="volumeMuteButtonRef"
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
              <div
                class="player-overlay volume-overlay"
                :data-player-presentation="props.presentation"
                role="group"
                :aria-label="t('player.volume')"
              >
                <input
                  type="range"
                  class="volume-slider volume-overlay-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="playback.state.volume"
                  :style="volumeSliderStyle"
                  :aria-label="t('player.volume')"
                  @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
                  @pointerdown="handleVolumeSliderPointerDown"
                  @pointerup="volumeOverlay.onSliderPointerUp"
                  @pointercancel="volumeOverlay.onSliderPointerUp"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Manuscript dock: display:contents wrappers + named areas (Phase 23). -->
    <template v-else>
      <div class="player-bar-dock-main">
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
      </div>

      <div class="player-bar-dock-actions">
        <div class="playback-actions">
          <div class="desktop-lyrics-control-wrap">
            <button
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
              <PlaybarLyricsIcon class="playbar-action-icon h-4 w-4" />
            </button>
            <DesktopLyricsLockPopover
              v-if="isDesktopLyricsLockOpen"
              :is-locked="isDesktopLyricsMousePassthroughEnabled"
              :presentation="props.presentation"
              @change="handleDesktopLyricsLockChange"
              @close="handleDesktopLyricsLockClose"
            />
            <div
              v-if="desktopLyricsToast && !isDesktopLyricsLockOpen"
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
            <PlaybarQueueIcon class="playbar-action-icon h-4 w-4" />
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

          <div
            ref="volumeGroupRef"
            class="volume-control-group"
            :data-volume-open="isVolumeOpen ? 'true' : 'false'"
            @pointerenter="handleVolumePointerEnter"
            @pointerleave="volumeOverlay.onPointerLeave"
            @focusin="handleVolumeFocusIn"
            @focusout="volumeOverlay.onFocusOut"
            @keydown.esc="handleVolumeOverlayEscape"
          >
            <button
              ref="volumeMuteButtonRef"
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
            <div
              class="player-overlay volume-overlay"
              :data-player-presentation="props.presentation"
              role="group"
              :aria-label="t('player.volume')"
            >
              <input
                type="range"
                class="volume-slider volume-overlay-slider"
                min="0"
                max="1"
                step="0.01"
                :value="playback.state.volume"
                :style="volumeSliderStyle"
                :aria-label="t('player.volume')"
                @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
                @pointerdown="handleVolumeSliderPointerDown"
                @pointerup="volumeOverlay.onSliderPointerUp"
                @pointercancel="volumeOverlay.onSliderPointerUp"
              />
            </div>
          </div>
        </div>

        <PlayerBarTimeColophon />
      </div>

      <div class="player-bar-dock-rule" aria-hidden="true"></div>
    </template>
  </footer>
</template>
