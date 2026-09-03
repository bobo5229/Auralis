import { computed, getCurrentScope, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { LyricsStatus } from './useTrackLyrics'

type ReadonlyRef<T> = Readonly<Ref<T>>
type LyricMetric = { offset: number; height: number }

export interface FullscreenLyricsViewportOptions {
  scrollRef: Ref<HTMLElement | null>
  trackRef: Ref<HTMLElement | null>
  currentTrackId: ReadonlyRef<number | null>
  lyricsStatus: ReadonlyRef<LyricsStatus>
  lineCount: ReadonlyRef<number>
  activeIndex: ReadonlyRef<number>
  isPrelude: ReadonlyRef<boolean>
  showPrelude: ReadonlyRef<boolean>
  isOpen: ReadonlyRef<boolean>
}

const MIN_DURATION_MS = 420
const MAX_DURATION_MS = 650
const DURATION_BASE_MS = 380
const DURATION_PER_PIXEL = 0.65
const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
const AUTO_FOLLOW_PAUSE_MS = 3000

export function clampFullscreenLyricsScroll(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

export function resolveFullscreenLyricsScrollTarget(
  metric: LyricMetric,
  containerHeight: number,
  scrollMax: number,
): number {
  return clampFullscreenLyricsScroll(
    metric.offset - containerHeight * 0.3 + metric.height / 2,
    scrollMax,
  )
}

export function resolveFullscreenLyricsAnimationDuration(distance: number): number {
  return Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, DURATION_BASE_MS + distance * DURATION_PER_PIXEL),
  )
}

export function useFullscreenLyricsViewport(options: FullscreenLyricsViewportOptions) {
  const containerHeight = ref(0)
  const isUserScrolling = ref(false)
  const topPadding = computed(() => Math.round(containerHeight.value * 0.3))
  const bottomPadding = computed(() => Math.round(containerHeight.value * 0.7))
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null
  let resizeObserver: ResizeObserver | null = null
  let observedContainer: HTMLElement | null = null
  let animation: Animation | null = null
  let offset = 0
  let lineMetrics: LyricMetric[] = []
  let preludeMetric: LyricMetric | null = null
  let metricsLineCount = -1
  let metricsPreludeState = false
  let scrollMax = 0
  let disposed = false

  function setOffset(nextOffset: number): void {
    offset = nextOffset
    const track = options.trackRef.value
    if (track) track.style.transform = `translate3d(0, ${nextOffset}px, 0)`
  }

  function getCurrentOffset(): number {
    const track = options.trackRef.value
    if (!track || !animation) return offset
    const transform = getComputedStyle(track).transform
    if (transform === 'none') return 0
    try {
      return new DOMMatrixReadOnly(transform).m42
    } catch {
      return offset
    }
  }

  function cancelAnimation(commitCurrentPosition: boolean): number {
    const currentOffset = commitCurrentPosition ? getCurrentOffset() : offset
    animation?.cancel()
    animation = null
    setOffset(currentOffset)
    return currentOffset
  }

  function clearAutoFollowTimeout(): void {
    if (!scrollTimeout) return
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }

  function clearMetrics(): void {
    lineMetrics = []
    preludeMetric = null
    metricsLineCount = -1
    metricsPreludeState = false
    scrollMax = 0
  }

  function resetPosition(): void {
    clearAutoFollowTimeout()
    isUserScrolling.value = false
    cancelAnimation(false)
    setOffset(0)
    if (options.scrollRef.value) options.scrollRef.value.scrollTop = 0
    clearMetrics()
  }

  function rebuildMetrics(force = false): void {
    const container = options.scrollRef.value
    const track = options.trackRef.value
    if (!container || !track) {
      clearMetrics()
      return
    }
    if (
      !force &&
      metricsLineCount === options.lineCount.value &&
      metricsPreludeState === options.showPrelude.value
    ) {
      return
    }

    const elements = track.querySelectorAll<HTMLElement>('[data-lyric-index]')
    lineMetrics = Array.from(elements, (element) => ({
      offset: element.offsetTop,
      height: element.offsetHeight,
    }))
    const preludeElement = track.querySelector<HTMLElement>('[data-lyric-prelude]')
    preludeMetric = preludeElement
      ? { offset: preludeElement.offsetTop, height: preludeElement.offsetHeight }
      : null
    metricsLineCount = options.lineCount.value
    metricsPreludeState = options.showPrelude.value
    scrollMax = Math.max(0, track.scrollHeight - container.clientHeight)
  }

  function computeTarget(): number | null {
    if (!options.scrollRef.value) return null
    if (options.isPrelude.value) {
      if (!preludeMetric) return 0
      return resolveFullscreenLyricsScrollTarget(preludeMetric, containerHeight.value, scrollMax)
    }
    if (options.lyricsStatus.value !== 'lrc' || options.activeIndex.value < 0) return null
    const metric = lineMetrics[options.activeIndex.value]
    if (!metric) return null
    return resolveFullscreenLyricsScrollTarget(metric, containerHeight.value, scrollMax)
  }

  function updateTarget(behavior: ScrollBehavior = 'smooth'): void {
    if (disposed || isUserScrolling.value) return
    const target = computeTarget()
    const container = options.scrollRef.value
    const track = options.trackRef.value
    if (target === null || !container || !track) return
    const targetOffset = -target

    if (behavior === 'auto') {
      cancelAnimation(false)
      container.scrollTop = 0
      setOffset(targetOffset)
      return
    }

    const currentOffset = cancelAnimation(true)
    const distance = Math.abs(targetOffset - currentOffset)
    if (distance < 0.5) {
      setOffset(targetOffset)
      return
    }

    setOffset(targetOffset)
    const nextAnimation = track.animate(
      [
        { transform: `translate3d(0, ${currentOffset}px, 0)` },
        { transform: `translate3d(0, ${targetOffset}px, 0)` },
      ],
      {
        duration: resolveFullscreenLyricsAnimationDuration(distance),
        easing: EASING,
        fill: 'both',
      },
    )
    animation = nextAnimation
    void nextAnimation.finished
      .then(() => {
        if (animation !== nextAnimation || disposed) return
        animation = null
        nextAnimation.cancel()
        setOffset(targetOffset)
      })
      .catch(() => undefined)
  }

  function disconnectResizeObserver(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    observedContainer = null
  }

  function syncScrollContainer(): void {
    if (disposed) return
    const container = options.scrollRef.value
    if (!container) {
      disconnectResizeObserver()
      containerHeight.value = 0
      return
    }
    if (!options.isOpen.value) {
      disconnectResizeObserver()
      return
    }
    if (container === observedContainer && resizeObserver) return

    disconnectResizeObserver()
    containerHeight.value = container.clientHeight
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver((entries) => {
      if (disposed || !options.isOpen.value || observedContainer !== container) return
      containerHeight.value = entries[0]?.contentRect.height ?? container.clientHeight
      void nextTick(() => {
        rebuildMetrics(true)
        updateTarget('auto')
      })
    })
    resizeObserver.observe(container)
    observedContainer = container
  }

  function refresh(behavior: ScrollBehavior, forceMetrics = false): void {
    if (disposed) return
    if (!options.isOpen.value) {
      disconnectResizeObserver()
      return
    }
    syncScrollContainer()
    rebuildMetrics(forceMetrics)
    updateTarget(behavior)
  }

  function pauseAutoFollow(): void {
    if (disposed) return
    const container = options.scrollRef.value
    if (!isUserScrolling.value) {
      const currentOffset = cancelAnimation(true)
      if (container) {
        setOffset(0)
        container.scrollTop = -currentOffset
      }
    }
    isUserScrolling.value = true
    clearAutoFollowTimeout()
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null
      if (disposed) return
      const scrollTop = container?.scrollTop ?? 0
      if (container) container.scrollTop = 0
      setOffset(-scrollTop)
      isUserScrolling.value = false
      updateTarget()
    }, AUTO_FOLLOW_PAUSE_MS)
  }

  function suspend(): void {
    clearAutoFollowTimeout()
    isUserScrolling.value = false
    cancelAnimation(true)
    disconnectResizeObserver()
    clearMetrics()
  }

  function dispose(): void {
    if (disposed) return
    suspend()
    disposed = true
  }

  watch(options.currentTrackId, resetPosition)
  watch(
    () => [
      options.activeIndex.value,
      options.isPrelude.value,
      options.lineCount.value,
      options.isOpen.value,
    ],
    () => {
      void nextTick(() => {
        if (!options.isOpen.value) {
          suspend()
          return
        }
        refresh('smooth')
      })
    },
    { flush: 'post' },
  )
  void nextTick(() => refresh('auto', true))
  if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts.ready.then(() => {
      if (disposed || !options.isOpen.value) return
      void nextTick(() => refresh('auto', true))
    })
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    containerHeight,
    topPadding,
    bottomPadding,
    isUserScrolling,
    pauseAutoFollow,
    resetPosition,
    refresh,
    dispose,
  }
}
