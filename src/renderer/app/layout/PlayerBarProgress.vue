<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { usePlaybackProgressInteraction } from '@renderer/features/playback/composables/usePlaybackProgressInteraction'
import { resolveProgressSeekStepSeconds } from '@renderer/features/playback/utils/progressSeekStep'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'

const props = withDefaults(defineProps<{ interactive?: boolean }>(), { interactive: true })
const playback = usePlayback()
const { displayMode } = usePlayerDisplayMode()
const { t } = useI18n()
const progressFillRef = ref<HTMLElement | null>(null)
const progressRootRef = ref<HTMLElement | null>(null)
const windowVisible = ref(false)
const documentVisible = ref(!document.hidden)
let stopVisibility: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined
let railWidth = 0
let lastRenderedRatio = Number.NaN
let draggingTrackId: number | null = null

const hasSeekableTrack = computed(
  () => Boolean(playback.state.currentTrack) && playback.state.duration > 0 && props.interactive,
)
const active = computed(
  () =>
    displayMode.value === 'normal' &&
    hasSeekableTrack.value &&
    windowVisible.value &&
    documentVisible.value,
)

function renderProgressRatio(ratio: number): void {
  const fill = progressFillRef.value
  if (!fill || displayMode.value !== 'normal' || !windowVisible.value || !documentVisible.value)
    return
  // Quarter-device-pixel steps retain smooth short-track feedback without
  // invalidating paint for changes too small to see on a long track.
  const steps = railWidth * (window.devicePixelRatio || 1) * 4
  const renderedRatio =
    steps > 0 && ratio > 0 && ratio < 1 ? Math.min(1, Math.round(ratio * steps) / steps) : ratio
  if (renderedRatio === lastRenderedRatio) return
  lastRenderedRatio = renderedRatio
  fill.style.clipPath = `inset(0 ${(1 - renderedRatio) * 100}% 0 0 round 999px)`
  fill.parentElement?.style.setProperty('--auralis-progress-value', renderedRatio.toString())
}

const interaction = usePlaybackProgressInteraction({
  duration: computed(() => (hasSeekableTrack.value ? playback.state.duration : 0)),
  currentTime: computed(() => playback.state.currentTime),
  isPlaying: computed(() => playback.state.isPlaying),
  active,
  seekByRatio: playback.seekByRatio,
  seekTo: playback.seekTo,
  renderRatio: renderProgressRatio,
  maxVisualFps: 30,
  resolveSeekStepSeconds: resolveProgressSeekStepSeconds,
})
const progressValueNow = interaction.valueNow

function cancelDraggingProgress(): void {
  draggingTrackId = null
  interaction.onPointerCancel()
}
function handleProgressPointerDown(event: PointerEvent): void {
  if (!active.value) return
  interaction.onPointerDown(event)
  if (interaction.isDragging.value) draggingTrackId = playback.state.currentTrackId
}
function handleProgressPointerUp(event: PointerEvent): void {
  if (!hasSeekableTrack.value || draggingTrackId !== playback.state.currentTrackId) {
    cancelDraggingProgress()
    return
  }
  interaction.onPointerUp(event)
  if (!interaction.isDragging.value) draggingTrackId = null
}
function handleProgressKeydown(event: KeyboardEvent): void {
  if (hasSeekableTrack.value) interaction.onKeydown(event)
}
function syncDocumentVisibility(): void {
  documentVisible.value = !document.hidden
}

watch(() => playback.state.currentTrackId, cancelDraggingProgress, { flush: 'sync' })
watch(
  active,
  (visible) => {
    if (!visible) cancelDraggingProgress()
  },
  { flush: 'sync' },
)
onMounted(() => {
  document.addEventListener('visibilitychange', syncDocumentVisibility)
  window.addEventListener('blur', cancelDraggingProgress)
  stopVisibility = observeWindowVisibility((visible) => {
    windowVisible.value = visible
  })
  resizeObserver = new ResizeObserver(([entry]) => {
    railWidth = entry.contentRect.width
    lastRenderedRatio = Number.NaN
    interaction.refresh()
  })
  if (progressRootRef.value) resizeObserver.observe(progressRootRef.value)
  interaction.refresh()
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', syncDocumentVisibility)
  window.removeEventListener('blur', cancelDraggingProgress)
  stopVisibility?.()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="progressRootRef"
    class="track-progress"
    :class="{ 'track-progress--idle': !hasSeekableTrack }"
    role="slider"
    :tabindex="hasSeekableTrack ? 0 : -1"
    :aria-disabled="hasSeekableTrack ? undefined : 'true'"
    :aria-label="t('player.progress')"
    aria-valuemin="0"
    :aria-valuemax="Math.round(playback.state.duration || 0)"
    :aria-valuenow="Math.round(playback.state.currentTime || 0)"
    :aria-valuetext="`${progressValueNow}%`"
    @pointerdown="handleProgressPointerDown"
    @pointermove="interaction.onPointerMove"
    @pointerup="handleProgressPointerUp"
    @pointercancel="interaction.onPointerCancel"
    @lostpointercapture="interaction.onPointerCancel"
    @keydown="handleProgressKeydown"
  >
    <div ref="progressFillRef" class="track-progress-fill"></div>
  </div>
</template>

<style scoped>
.track-progress-fill {
  width: 100%;
  clip-path: inset(0 100% 0 0 round 999px);
  will-change: clip-path;
}
</style>
