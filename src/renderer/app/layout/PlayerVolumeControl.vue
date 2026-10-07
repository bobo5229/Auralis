<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useVolumeOverlay } from '@renderer/features/playback/composables/useVolumeOverlay'
import { resolveRestorablePlayerTrigger } from '@renderer/app/utils/playerOverlayFocus'

const emit = defineEmits<{
  activate: []
}>()

const { t } = useI18n()
const playback = usePlayback()
const groupRef = ref<HTMLElement | null>(null)
const muteButtonRef = ref<HTMLButtonElement | null>(null)
const {
  open: isVolumeOverlayOpen,
  show: showVolumeOverlay,
  dismiss: dismissVolumeOverlay,
} = useVolumeOverlay()

const volumeIconClass = computed(() => {
  if (playback.state.isMuted) {
    return 'i-ph-speaker-slash'
  }

  const volume = playback.state.volume

  if (volume <= 0) {
    return 'i-ph-speaker-slash'
  }

  if (volume <= 0.4) {
    return 'i-ph-speaker-low'
  }

  return 'i-ph-speaker-high'
})

const volumeSliderStyle = computed(() => {
  const percentage = `${Math.round(playback.state.volume * 100)}%`

  return {
    '--volume-percent': percentage,
    '--volume-track-bg': `linear-gradient(to right, var(--auralis-volume-fill) 0%, var(--auralis-volume-fill) ${percentage}, var(--auralis-progress-track) ${percentage}, var(--auralis-progress-track) 100%)`,
    background: 'transparent',
  }
})

const volumePercentText = computed(() => Math.round(playback.state.volume * 100))

function handleEscape(): void {
  if (!isVolumeOverlayOpen.value) return
  dismissVolumeOverlay()
  resolveRestorablePlayerTrigger(muteButtonRef.value)?.focus()
}

function handleVolumeButtonClick(): void {
  if (isVolumeOverlayOpen.value) {
    dismissVolumeOverlay()
    return
  }

  emit('activate')
  showVolumeOverlay()
}

function handleWheel(event: WheelEvent): void {
  const step = 0.04
  const nextVolume =
    event.deltaY < 0
      ? Math.min(1, playback.state.volume + step)
      : Math.max(0, playback.state.volume - step)
  playback.setVolume(Math.round(nextVolume * 100) / 100)
}

defineExpose({
  el: groupRef,
  open: isVolumeOverlayOpen,
  dismiss: dismissVolumeOverlay,
})
</script>

<template>
  <div
    ref="groupRef"
    class="volume-control-group"
    :data-volume-open="isVolumeOverlayOpen ? 'true' : 'false'"
    @keydown.esc="handleEscape"
    @wheel.passive="handleWheel"
  >
    <button
      ref="muteButtonRef"
      class="player-bar-control"
      :class="{ 'player-bar-control-active': isVolumeOverlayOpen }"
      type="button"
      :aria-label="t('player.volume')"
      :aria-expanded="isVolumeOverlayOpen"
      @click="handleVolumeButtonClick"
    >
      <span class="playbar-action-icon h-5 w-5" :class="volumeIconClass" />
    </button>
    <div
      class="volume-inline-reveal"
      :inert="!isVolumeOverlayOpen"
      :aria-hidden="!isVolumeOverlayOpen"
    >
      <div class="volume-inline-panel" role="group" :aria-label="t('player.volume')">
        <div class="volume-slider-field" :style="volumeSliderStyle">
          <input
            type="range"
            class="volume-slider volume-overlay-slider"
            min="0"
            max="1"
            step="0.01"
            :value="playback.state.volume"
            :aria-label="t('player.volume')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="volumePercentText"
            @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="volume-overlay-value" aria-hidden="true">{{ volumePercentText }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
