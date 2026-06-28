<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LyricLine } from '../types'

const props = defineProps<{
  lines: LyricLine[]
  activeIndex: number
  isPrelude: boolean
}>()

const scrollRef = ref<HTMLElement | null>(null)
const containerHeight = ref(0)
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null

// Smooth scroll tracking state
let targetScrollTop: number | null = null
let rafId: number | null = null
const SNAP_THRESHOLD = 0.5
const DEFAULT_LERP = 0.14
const FAST_LERP = 0.3
const LARGE_JUMP_PX = 120
const MAX_ANIMATION_FPS = 120
const MIN_ANIMATION_FRAME_MS = 1000 / MAX_ANIMATION_FPS
const REFERENCE_FRAME_MS = 1000 / 60
let lastAnimationAt = 0

const topPadding = computed(() => Math.round(containerHeight.value * 0.3))
const bottomPadding = computed(() => Math.round(containerHeight.value * 0.7))

function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function computeTarget(): number | null {
  const container = scrollRef.value
  if (!container) return null

  if (props.isPrelude) {
    return 0
  }

  if (props.activeIndex < 0) return null

  // children[0] is the top spacer, lyric lines start at index 1
  // (prelude row is conditionally rendered before v-for, but isPrelude returns early above)
  const activeEl = container.children[props.activeIndex + 1] as HTMLElement | undefined
  if (!activeEl) return null

  const height = container.clientHeight
  const scrollableMax = container.scrollHeight - container.clientHeight
  const target = activeEl.offsetTop - height * 0.3 + activeEl.clientHeight / 2
  return clampScroll(target, scrollableMax)
}

function startTracking() {
  if (rafId !== null) return

  lastAnimationAt = 0

  function tick(now: number) {
    const container = scrollRef.value
    if (!container || targetScrollTop === null) {
      rafId = null
      lastAnimationAt = 0
      return
    }

    if (lastAnimationAt > 0 && now - lastAnimationAt < MIN_ANIMATION_FRAME_MS) {
      rafId = requestAnimationFrame(tick)
      return
    }

    const current = container.scrollTop
    const diff = targetScrollTop - current

    // Snap when very close
    if (Math.abs(diff) < SNAP_THRESHOLD) {
      container.scrollTop = targetScrollTop
      targetScrollTop = null
      rafId = null
      lastAnimationAt = 0
      return
    }

    // Adaptive lerp: fast for large jumps, smooth for small ones
    const elapsedMs = lastAnimationAt > 0 ? now - lastAnimationAt : REFERENCE_FRAME_MS
    lastAnimationAt = now
    const lerp = Math.abs(diff) > LARGE_JUMP_PX ? FAST_LERP : DEFAULT_LERP
    const frameScale = Math.max(0.25, Math.min(2, elapsedMs / REFERENCE_FRAME_MS))
    const adjustedLerp = 1 - Math.pow(1 - lerp, frameScale)
    container.scrollTop = current + diff * adjustedLerp

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

function updateTarget(behavior: ScrollBehavior = 'smooth') {
  if (isUserScrolling.value) return

  if (behavior === 'auto') {
    // Instant jump (on mount / prelude) — no animation
    const target = computeTarget()
    const container = scrollRef.value
    if (target !== null && container) {
      container.scrollTop = target
    }
    targetScrollTop = null
    return
  }

  targetScrollTop = computeTarget()
  startTracking()
}

function pauseAutoFollow() {
  isUserScrolling.value = true
  targetScrollTop = null
  lastAnimationAt = 0

  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  if (scrollTimeout) clearTimeout(scrollTimeout)

  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false
    updateTarget()
  }, 3000)
}

watch(
  () => [props.activeIndex, props.isPrelude, props.lines.length],
  () => {
    nextTick(() => updateTarget())
  },
  { flush: 'post' },
)

onMounted(() => {
  const container = scrollRef.value

  if (container) {
    containerHeight.value = container.clientHeight
    resizeObserver = new ResizeObserver((entries) => {
      containerHeight.value = entries[0].contentRect.height
    })
    resizeObserver.observe(container)
  }

  nextTick(() => updateTarget('auto'))
})

onBeforeUnmount(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout)
  if (rafId !== null) cancelAnimationFrame(rafId)
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
    <div :style="{ height: `${topPadding}px` }"></div>
    <div v-if="isPrelude" class="lyric-line lyric-prelude">
      <span class="lyric-dot">.</span><span class="lyric-dot">.</span
      ><span class="lyric-dot">.</span>
    </div>
    <div
      v-for="(line, index) in lines"
      :key="line.id"
      v-memo="[activeIndex === index, line.text]"
      class="lyric-line"
      :class="
        activeIndex === index
          ? 'lyric-active lyric-line-active-filter'
          : line.text
            ? 'lyric-inactive lyric-line-blur-filter'
            : 'lyric-empty'
      "
    >
      {{ line.text || ' ' }}
    </div>
    <div :style="{ height: `${bottomPadding}px` }"></div>
  </div>
</template>

<style scoped>
.synced-lyrics-scroll {
  contain: layout paint style;
  overscroll-behavior: contain;
  will-change: scroll-position;
}

.lyric-line-active-filter {
  filter: blur(0);
  opacity: 1;
  will-change: opacity, filter;
}

.lyric-line-blur-filter {
  filter: blur(3px);
  opacity: 0.8;
}
</style>
