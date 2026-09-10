<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useVolumeOverlay } from '@renderer/features/playback/composables/useVolumeOverlay'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'

const props = defineProps<{
  presentation: PlayerSurfacePresentation
  retreatActive: boolean
}>()

const emit = defineEmits<{
  activate: []
}>()

const { t } = useI18n()
const playback = usePlayback()
const groupRef = ref<HTMLElement | null>(null)
const muteButtonRef = ref<HTMLButtonElement | null>(null)
const volumeOverlay = useVolumeOverlay(() => groupRef.value)

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

function applyVolumeHoverExclusivity(): void {
  if (props.retreatActive) emit('activate')
}

function handlePointerEnter(): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onPointerEnter()
}

function handleFocusIn(event: FocusEvent): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onFocusIn(event)
}

function handleSliderPointerDown(): void {
  applyVolumeHoverExclusivity()
  volumeOverlay.onSliderPointerDown()
}

function handleEscape(): void {
  if (!volumeOverlay.open.value) return
  volumeOverlay.dismiss()
  muteButtonRef.value?.focus()
}

function handleToggleMute(): void {
  playback.toggleMute()
}

defineExpose({
  el: groupRef,
  open: volumeOverlay.open,
  dismiss: volumeOverlay.dismiss,
})
</script>

<template>
  <div
    ref="groupRef"
    class="volume-control-group"
    :data-volume-open="volumeOverlay.open ? 'true' : 'false'"
    @pointerenter="handlePointerEnter"
    @pointerleave="volumeOverlay.onPointerLeave"
    @focusin="handleFocusIn"
    @focusout="volumeOverlay.onFocusOut"
    @keydown.esc="handleEscape"
  >
    <button
      ref="muteButtonRef"
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
        @pointerdown="handleSliderPointerDown"
        @pointerup="volumeOverlay.onSliderPointerUp"
        @pointercancel="volumeOverlay.onSliderPointerUp"
        @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
      />
    </div>
  </div>
</template>
