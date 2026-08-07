<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { LyricLine } from '../types'

const props = defineProps<{
  lines: LyricLine[]
  activeIndex: number
  isPrelude: boolean
  showPrelude: boolean
  preludeLitDotCount: number
}>()

const { seekTo } = usePlayback()

const scrollRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const containerHeight = ref(0)
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let animation: Animation | null = null
let trackOffset = 0
let lineMetrics: Array<{ offset: number; height: number }> = []
let preludeMetric: { offset: number; height: number } | null = null
let metricsLineCount = -1
let metricsPreludeState = false
let scrollMax = 0

const MIN_DURATION_MS = 420
const MAX_DURATION_MS = 650
const DURATION_BASE_MS = 380
const DURATION_PER_PIXEL = 0.65
const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

const topPadding = computed(() => Math.round(containerHeight.value * 0.3))
const bottomPadding = computed(() => Math.round(containerHeight.value * 0.7))

function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function getCurrentTrackOffset(): number {
  const track = trackRef.value
  if (!track || !animation) return trackOffset
  const transform = getComputedStyle(track).transform
  if (transform === 'none') return 0
  try {
    return new DOMMatrixReadOnly(transform).m42
  } catch {
    return trackOffset
  }
}

function setTrackOffset(offset: number): void {
  trackOffset = offset
  if (trackRef.value) {
    trackRef.value.style.transform = `translate3d(0, ${offset}px, 0)`
  }
}

function cancelTrackAnimation(commitCurrentPosition: boolean): number {
  const currentOffset = commitCurrentPosition ? getCurrentTrackOffset() : trackOffset
  animation?.cancel()
  animation = null
  setTrackOffset(currentOffset)
  return currentOffset
}

function rebuildMetrics(force = false): void {
  const container = scrollRef.value
  const track = trackRef.value
  if (!container || !track) {
    lineMetrics = []
    preludeMetric = null
    metricsLineCount = -1
    metricsPreludeState = false
    scrollMax = 0
    return
  }

  if (
    !force &&
    metricsLineCount === props.lines.length &&
    metricsPreludeState === props.showPrelude
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
  metricsLineCount = props.lines.length
  metricsPreludeState = props.showPrelude
  scrollMax = Math.max(0, track.scrollHeight - container.clientHeight)
}

function computeTarget(): number | null {
  if (!scrollRef.value) return null

  if (props.isPrelude) {
    if (!preludeMetric) return 0
    const target = preludeMetric.offset - containerHeight.value * 0.3 + preludeMetric.height / 2
    return clampScroll(target, scrollMax)
  }

  if (props.activeIndex < 0) return null
  const metric = lineMetrics[props.activeIndex]
  if (!metric) return null
  const target = metric.offset - containerHeight.value * 0.3 + metric.height / 2
  return clampScroll(target, scrollMax)
}

function updateTarget(behavior: ScrollBehavior = 'smooth'): void {
  if (isUserScrolling.value) return
  const container = scrollRef.value
  const track = trackRef.value
  const target = computeTarget()
  if (!container || !track || target === null) return

  const targetOffset = -target
  if (behavior === 'auto') {
    cancelTrackAnimation(false)
    container.scrollTop = 0
    setTrackOffset(targetOffset)
    return
  }

  const currentOffset = cancelTrackAnimation(true)
  const distance = Math.abs(targetOffset - currentOffset)
  if (distance < 0.5) {
    setTrackOffset(targetOffset)
    return
  }

  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, DURATION_BASE_MS + distance * DURATION_PER_PIXEL),
  )
  setTrackOffset(targetOffset)
  const nextAnimation = track.animate(
    [
      { transform: `translate3d(0, ${currentOffset}px, 0)` },
      { transform: `translate3d(0, ${targetOffset}px, 0)` },
    ],
    {
      duration,
      easing: EASING,
      fill: 'both',
    },
  )
  animation = nextAnimation
  void nextAnimation.finished
    .then(() => {
      if (animation !== nextAnimation) return
      animation = null
      nextAnimation.cancel()
      setTrackOffset(targetOffset)
    })
    .catch(() => undefined)
}

function pauseAutoFollow(): void {
  const container = scrollRef.value
  if (!isUserScrolling.value) {
    const currentOffset = cancelTrackAnimation(true)
    if (container) {
      setTrackOffset(0)
      container.scrollTop = -currentOffset
    }
  }
  isUserScrolling.value = true

  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    resumeAutoFollowFromUserScroll()
  }, 3000)
}

/** Commit native scrollTop back to transform tracking and re-enable auto-follow. */
function resumeAutoFollowFromUserScroll(): void {
  const container = scrollRef.value
  const scrollTop = container?.scrollTop ?? 0
  if (container) container.scrollTop = 0
  setTrackOffset(-scrollTop)
  isUserScrolling.value = false
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }
  updateTarget()
}

/**
 * Click / keyboard on a timed LRC line: seek playback, then immediately follow
 * the new active line (cancel the 3s user-scroll pause from pointerdown).
 */
function onLyricLineActivate(index: number): void {
  const line = props.lines[index]
  if (!line || !Number.isFinite(line.timeSeconds)) return

  seekTo(line.timeSeconds)

  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }

  const container = scrollRef.value
  if (isUserScrolling.value && container) {
    const scrollTop = container.scrollTop
    container.scrollTop = 0
    setTrackOffset(-scrollTop)
  }
  isUserScrolling.value = false

  void nextTick(() => {
    rebuildMetrics()
    updateTarget('smooth')
  })
}

function onLyricLineKeydown(event: KeyboardEvent, index: number): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onLyricLineActivate(index)
}

function resetScrollPosition(): void {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }
  isUserScrolling.value = false
  cancelTrackAnimation(false)
  setTrackOffset(0)
  if (scrollRef.value) scrollRef.value.scrollTop = 0
  lineMetrics = []
  preludeMetric = null
  metricsLineCount = -1
  metricsPreludeState = false
  scrollMax = 0
}

function syncContainer(): void {
  const container = scrollRef.value
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!container) {
    containerHeight.value = 0
    return
  }

  containerHeight.value = container.clientHeight
  resizeObserver = new ResizeObserver((entries) => {
    containerHeight.value = entries[0].contentRect.height
    nextTick(() => {
      rebuildMetrics(true)
      updateTarget('auto')
    })
  })
  resizeObserver.observe(container)
}

watch(
  () => [props.activeIndex, props.isPrelude, props.showPrelude, props.lines.length],
  () => {
    if (props.lines.length === 0) {
      resetScrollPosition()
      return
    }
    nextTick(() => {
      rebuildMetrics()
      updateTarget()
    })
  },
  { flush: 'post' },
)

onMounted(() => {
  syncContainer()
  nextTick(() => {
    rebuildMetrics(true)
    updateTarget('auto')
  })

  void document.fonts.ready.then(() => {
    nextTick(() => {
      rebuildMetrics(true)
      updateTarget('auto')
    })
  })
})

onBeforeUnmount(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout)
  cancelTrackAnimation(false)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="scrollRef"
    class="synced-lyrics-scroll h-full overflow-auto scrollbar-none px-4"
    tabindex="0"
    @wheel="pauseAutoFollow"
    @pointerdown="pauseAutoFollow"
    @touchstart="pauseAutoFollow"
    @keydown="pauseAutoFollow"
  >
    <div ref="trackRef" class="synced-lyrics-track">
      <div :style="{ height: `${topPadding}px` }"></div>
      <div
        v-if="showPrelude"
        class="lyric-line lyric-prelude"
        :class="
          isPrelude
            ? 'lyric-active lyric-line-active-filter'
            : 'lyric-inactive lyric-line-blur-filter'
        "
        aria-label="Lyrics starting soon"
        data-lyric-prelude
      >
        <span
          v-for="dot in 3"
          :key="dot"
          class="lyric-dot"
          :class="{ 'lyric-dot-lit': dot <= preludeLitDotCount }"
        ></span>
      </div>
      <div
        v-for="(line, index) in lines"
        :key="line.id"
        v-memo="[activeIndex === index, line.text]"
        class="lyric-line lyric-line-seekable"
        :class="
          activeIndex === index
            ? 'lyric-active lyric-line-active-filter'
            : line.text
              ? 'lyric-inactive lyric-line-blur-filter'
              : 'lyric-empty'
        "
        role="button"
        tabindex="0"
        :data-lyric-index="index"
        :aria-label="
          line.text ? `跳转到：${line.text}` : `跳转到 ${Math.floor(line.timeSeconds)} 秒`
        "
        @click.stop="onLyricLineActivate(index)"
        @keydown="onLyricLineKeydown($event, index)"
      >
        {{ line.text || ' ' }}
      </div>
      <div :style="{ height: `${bottomPadding}px` }"></div>
    </div>
  </div>
</template>

<style scoped>
.synced-lyrics-scroll {
  contain: layout paint style;
  overscroll-behavior: contain;
}

.synced-lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.synced-lyrics-track {
  min-height: 100%;
  will-change: transform;
}

.lyric-line {
  transition:
    opacity 300ms ease,
    filter 300ms ease;
}

.lyric-line-seekable {
  cursor: pointer;
  border-radius: 6px;
  outline: none;
}

.lyric-line-seekable:hover {
  opacity: 1;
  filter: none;
}

.lyric-line-seekable:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--auralis-text) 35%, transparent);
}

.lyric-line-active-filter {
  filter: none;
  opacity: 1;
  will-change: auto;
}

.lyric-line-blur-filter {
  filter: blur(3px);
  opacity: 0.8;
}

.lyric-prelude {
  display: flex;
  align-items: center;
  gap: 0.3em;
  min-height: 1.2em;
}

.lyric-prelude.lyric-active {
  filter: none;
}

.lyric-dot {
  width: 0.28em;
  height: 0.28em;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.2;
  transform: scale(0.78);
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 0.72, 0.18, 1);
}

.lyric-dot-lit {
  /* 与高亮歌词行颜色统一（高亮行继承 --auralis-text） */
  color: var(--auralis-text);
  box-shadow:
    0 0 0.18em currentColor,
    0 0 0.42em currentColor,
    0 0 0.72em color-mix(in srgb, currentColor 42%, transparent);
  opacity: 1;
  transform: scale(1);
}
</style>
