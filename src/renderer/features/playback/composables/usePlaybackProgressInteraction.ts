import { computed, getCurrentScope, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import { subscribeVisualFrame } from '../utils/visualFrameScheduler'

type ReadonlyRef<T> = Readonly<Ref<T>>
type FrameSubscriber = (callback: (now: number) => void) => () => void

export interface PlaybackProgressInteractionOptions {
  duration: ReadonlyRef<number>
  currentTime: ReadonlyRef<number>
  isPlaying: ReadonlyRef<boolean>
  active: ReadonlyRef<boolean>
  seekByRatio: (ratio: number) => void
  seekTo: (time: number) => void
  renderRatio: (ratio: number) => void
  /** Limits automatic progress paints; seek and pointer feedback remain immediate. */
  maxVisualFps?: number
  resolveSeekStepSeconds: (shiftKey: boolean) => number
  subscribeFrame?: FrameSubscriber
  now?: () => number
}

interface ProgressPointerTarget extends EventTarget {
  getBoundingClientRect(): { left: number; width: number }
  setPointerCapture(pointerId: number): void
  hasPointerCapture(pointerId: number): boolean
  releasePointerCapture(pointerId: number): void
}

function isProgressPointerTarget(target: EventTarget | null): target is ProgressPointerTarget {
  if (!target || typeof target !== 'object') return false
  return (
    'getBoundingClientRect' in target &&
    'setPointerCapture' in target &&
    'hasPointerCapture' in target &&
    'releasePointerCapture' in target
  )
}

export function clampProgressRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function resolveProgressPointerRatio(clientX: number, left: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0
  return clampProgressRatio((clientX - left) / width)
}

export function usePlaybackProgressInteraction(options: PlaybackProgressInteractionOptions) {
  const isDragging = ref(false)
  const draggingRatio = ref<number | null>(null)
  const frameSubscriber = options.subscribeFrame ?? subscribeVisualFrame
  const getNow = options.now ?? (() => performance.now())
  let frameUnsubscribe: (() => void) | null = null
  let progressAnchorTime = 0
  let progressAnchorAt = 0
  let activePointerTarget: ProgressPointerTarget | null = null
  let activePointerId: number | null = null
  let disposed = false
  let lastVisualFrameAt: number | null = null
  const visualFrameInterval =
    options.maxVisualFps && options.maxVisualFps > 0 ? 1000 / options.maxVisualFps : 0

  const ratio = computed(() => {
    if (options.duration.value <= 0) return 0
    if (draggingRatio.value !== null) return draggingRatio.value
    return clampProgressRatio(options.currentTime.value / options.duration.value)
  })

  const valueNow = computed(() => Math.round(ratio.value * 100))

  function renderVisualProgress(now: number): void {
    let nextRatio = draggingRatio.value
    if (nextRatio === null) {
      const elapsed = options.isPlaying.value ? Math.max(0, now - progressAnchorAt) / 1000 : 0
      const visualTime = Math.min(options.duration.value, progressAnchorTime + elapsed)
      nextRatio =
        options.duration.value > 0 ? clampProgressRatio(visualTime / options.duration.value) : 0
    }
    options.renderRatio(nextRatio)
  }

  function syncAnchor(immediate = true): void {
    progressAnchorTime = options.currentTime.value
    progressAnchorAt = getNow()
    if (immediate) renderVisualProgress(progressAnchorAt)
    else renderScheduledProgress(progressAnchorAt)
  }

  function renderScheduledProgress(now: number): void {
    if (isDragging.value) return
    if (lastVisualFrameAt !== null && now - lastVisualFrameAt < visualFrameInterval - 0.1) return
    lastVisualFrameAt = now
    renderVisualProgress(now)
  }

  function syncFrameSubscription(): void {
    if (disposed) return
    if (options.active.value && options.isPlaying.value) {
      if (!frameUnsubscribe) {
        lastVisualFrameAt = null
        frameUnsubscribe = frameSubscriber(renderScheduledProgress)
      }
    } else {
      frameUnsubscribe?.()
      frameUnsubscribe = null
    }
    syncAnchor()
  }

  function getPointerRatio(event: PointerEvent): number | null {
    const target = event.currentTarget
    if (!isProgressPointerTarget(target)) return null
    const rect = target.getBoundingClientRect()
    return resolveProgressPointerRatio(event.clientX, rect.left, rect.width)
  }

  function updateFromPointer(event: PointerEvent): void {
    if (options.duration.value <= 0) return
    const nextRatio = getPointerRatio(event)
    if (nextRatio === null) return
    draggingRatio.value = nextRatio
    options.renderRatio(nextRatio)
  }

  function releasePointerCapture(): void {
    if (
      activePointerTarget &&
      activePointerId !== null &&
      activePointerTarget.hasPointerCapture(activePointerId)
    ) {
      activePointerTarget.releasePointerCapture(activePointerId)
    }
    activePointerTarget = null
    activePointerId = null
  }

  function finishDragging(commit: boolean, event?: PointerEvent): void {
    if (!isDragging.value) return
    if (event && commit) updateFromPointer(event)
    if (commit && draggingRatio.value !== null) options.seekByRatio(draggingRatio.value)
    releasePointerCapture()
    isDragging.value = false
    draggingRatio.value = null
    syncAnchor()
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      activePointerId !== null ||
      options.duration.value <= 0 ||
      !isProgressPointerTarget(event.currentTarget)
    )
      return
    isDragging.value = true
    activePointerTarget = event.currentTarget
    activePointerId = event.pointerId
    activePointerTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    updateFromPointer(event)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!isDragging.value || event.pointerId !== activePointerId) return
    updateFromPointer(event)
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return
    finishDragging(true, event)
  }

  function onPointerCancel(event?: PointerEvent): void {
    if (event && event.pointerId !== activePointerId) return
    finishDragging(false)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (options.duration.value <= 0) return
    const step = options.resolveSeekStepSeconds(event.shiftKey)
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      options.seekTo(options.currentTime.value - step)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      options.seekTo(options.currentTime.value + step)
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    frameUnsubscribe?.()
    frameUnsubscribe = null
    releasePointerCapture()
    isDragging.value = false
    draggingRatio.value = null
  }

  watch(
    () => [options.currentTime.value, options.duration.value],
    ([time, duration], [, previousDuration]) => {
      const elapsed = options.isPlaying.value ? Math.max(0, getNow() - progressAnchorAt) / 1000 : 0
      const jumped = Math.abs(time - (progressAnchorTime + elapsed)) > 0.25
      // Clock notifications must share the interpolation budget. Seek, pause and
      // duration changes still paint immediately rather than waiting for a frame.
      syncAnchor(
        !options.active.value ||
          !options.isPlaying.value ||
          duration !== previousDuration ||
          jumped,
      )
    },
  )
  watch(
    () => [options.active.value, options.isPlaying.value],
    () => nextTick(syncFrameSubscription),
  )

  syncFrameSubscription()
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    isDragging,
    draggingRatio,
    ratio,
    valueNow,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeydown,
    refresh: () => syncAnchor(),
    dispose,
  }
}
