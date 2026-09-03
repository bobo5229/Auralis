<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { resolveProgressSeekStepSeconds } from '@renderer/features/playback/utils/progressSeekStep'
import { subscribeVisualFrame } from '@renderer/features/playback/utils/visualFrameScheduler'

const props = withDefaults(
  defineProps<{
    /** When false, the rail is non-interactive (empty / no duration). */
    interactive?: boolean
  }>(),
  { interactive: true },
)

const playback = usePlayback()
const { t } = useI18n()
const isDraggingProgress = ref(false)
const draggingProgressRatio = ref<number | null>(null)
const progressFillRef = ref<HTMLElement | null>(null)
const progressRootRef = ref<HTMLElement | null>(null)
let progressFrameUnsubscribe: (() => void) | null = null
let progressAnchorTime = 0
let progressAnchorAt = 0

const hasSeekableTrack = computed(
  () => Boolean(playback.state.currentTrack) && playback.state.duration > 0 && props.interactive,
)

const progressRatio = computed(() => {
  if (!playback.state.duration) {
    return 0
  }

  if (draggingProgressRatio.value !== null) {
    return draggingProgressRatio.value
  }

  return Math.min(1, Math.max(0, playback.state.currentTime / playback.state.duration))
})

const progressValueNow = computed(() => Math.round(progressRatio.value * 100))

function renderVisualProgress(now: number): void {
  const fill = progressFillRef.value
  if (!fill) return

  let ratio = draggingProgressRatio.value
  if (ratio === null) {
    if (!playback.state.currentTrack || !playback.state.duration) {
      ratio = 0
    } else {
      const elapsed = playback.state.isPlaying ? Math.max(0, now - progressAnchorAt) / 1000 : 0
      const visualTime = Math.min(playback.state.duration, progressAnchorTime + elapsed)
      ratio = Math.min(1, Math.max(0, visualTime / playback.state.duration))
    }
  }
  const concealedPercentage = (1 - ratio) * 100
  fill.style.clipPath = `inset(0 ${concealedPercentage}% 0 0 round 999px)`
  fill.parentElement?.style.setProperty('--auralis-progress-value', ratio.toString())
}

function syncProgressAnchor(): void {
  progressAnchorTime = playback.state.currentTime
  progressAnchorAt = performance.now()
  renderVisualProgress(progressAnchorAt)
}

function syncProgressFrameSubscription(): void {
  // Empty / no-track: never subscribe to the visual frame loop (no fake scrub animation).
  const shouldAnimate = Boolean(
    playback.state.currentTrack && playback.state.isPlaying && playback.state.duration > 0,
  )
  if (shouldAnimate) {
    if (!progressFrameUnsubscribe) {
      progressFrameUnsubscribe = subscribeVisualFrame(renderVisualProgress)
    }
  } else {
    progressFrameUnsubscribe?.()
    progressFrameUnsubscribe = null
  }
  syncProgressAnchor()
}

watch(
  () => playback.state.currentTrackId,
  () => {
    nextTick(() => syncProgressFrameSubscription())
  },
)

watch(
  () => [playback.state.currentTime, playback.state.duration, playback.state.isPlaying],
  () => syncProgressFrameSubscription(),
)

onMounted(() => {
  syncProgressFrameSubscription()
})

onBeforeUnmount(() => {
  progressFrameUnsubscribe?.()
  progressFrameUnsubscribe = null
})

function getProgressRatioFromPointer(event: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  const ratio = (event.clientX - rect.left) / rect.width
  return Math.min(1, Math.max(0, ratio))
}

function updateDraggingProgressFromPointer(event: PointerEvent): void {
  if (!hasSeekableTrack.value) return

  const target = event.currentTarget as HTMLElement
  const ratio = getProgressRatioFromPointer(event, target)
  draggingProgressRatio.value = ratio
  renderVisualProgress(performance.now())
}

function commitDraggingProgress(): void {
  if (draggingProgressRatio.value === null) return
  playback.seekByRatio(draggingProgressRatio.value)
}

function handleProgressPointerDown(event: PointerEvent): void {
  if (!hasSeekableTrack.value) return

  const target = event.currentTarget as HTMLElement
  isDraggingProgress.value = true
  target.setPointerCapture(event.pointerId)
  event.preventDefault()
  updateDraggingProgressFromPointer(event)
}

function handleProgressPointerMove(event: PointerEvent): void {
  if (!isDraggingProgress.value) return
  updateDraggingProgressFromPointer(event)
}

function handleProgressPointerUp(event: PointerEvent): void {
  if (!isDraggingProgress.value) return

  updateDraggingProgressFromPointer(event)
  commitDraggingProgress()
  const target = event.currentTarget as HTMLElement

  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }

  isDraggingProgress.value = false
  draggingProgressRatio.value = null
  syncProgressAnchor()
}

function handleProgressPointerCancel(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement

  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }

  isDraggingProgress.value = false
  draggingProgressRatio.value = null
  syncProgressAnchor()
}

function handleProgressKeydown(event: KeyboardEvent): void {
  if (!hasSeekableTrack.value) return

  const seekStepSeconds = resolveProgressSeekStepSeconds(event.shiftKey)

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime - seekStepSeconds)
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    playback.seekTo(playback.state.currentTime + seekStepSeconds)
  }
}
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
    @pointermove="handleProgressPointerMove"
    @pointerup="handleProgressPointerUp"
    @pointercancel="handleProgressPointerCancel"
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
