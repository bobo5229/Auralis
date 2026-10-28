<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { usePlaybackModePresentation } from '@renderer/features/playback/composables/usePlaybackModePresentation'
import type { PlaybackMode } from '@renderer/features/playback/types'
import PlaybackModeMenu from './PlaybackModeMenu.vue'

const playback = usePlayback()
const { isFullscreenPlayerOpen } = useFullscreenPlayer()
const { icon, label, tooltip } = usePlaybackModePresentation(() => playback.state.playbackMode)
const rootRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)

function close(restoreFocus = true): boolean {
  if (!open.value) return false
  open.value = false
  if (restoreFocus) void nextTick(() => buttonRef.value?.focus({ preventScroll: true }))
  return true
}

function select(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  close()
}

function dismissOutside(event: PointerEvent): void {
  if (event.target instanceof Node && !rootRef.value?.contains(event.target)) close(false)
}

watch(isFullscreenPlayerOpen, (isOpen) => {
  if (!isOpen) close(false)
})
onMounted(() => document.addEventListener('pointerdown', dismissOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissOutside, true))
defineExpose({ close })
</script>

<template>
  <div ref="rootRef" class="fullscreen-playback-mode">
    <button
      ref="buttonRef"
      v-tooltip="tooltip"
      class="fullscreen-playback-mode-trigger"
      :class="{ 'fullscreen-playback-mode-trigger-active': open }"
      type="button"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="h-4.5 w-4.5" :class="icon" aria-hidden="true" />
    </button>
    <PlaybackModeMenu
      v-if="open"
      :current-mode="playback.state.playbackMode"
      @select="select"
      @close="close"
    />
  </div>
</template>

<style scoped>
.fullscreen-playback-mode {
  position: relative;
  flex-shrink: 0;
}

.fullscreen-playback-mode-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  transition: color 140ms ease;
}

.fullscreen-playback-mode-trigger:hover,
.fullscreen-playback-mode-trigger-active {
  color: var(--auralis-text);
}

.fullscreen-playback-mode-trigger:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.fullscreen-playback-mode-trigger .i-ph-vinyl-record {
  transform: scale(0.9);
}

.fullscreen-playback-mode :deep(.playback-mode-menu) {
  --auralis-text: var(--auralis-fullscreen-controls-text);
  --auralis-text-muted: var(--auralis-fullscreen-controls-muted);
  --auralis-playbar-border: var(--auralis-fullscreen-controls-border);
  --auralis-control-hover-bg: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  bottom: calc(100% + 12px);
  left: 0;
  right: auto;
  background: var(--auralis-fullscreen-controls-bg);
}
</style>
