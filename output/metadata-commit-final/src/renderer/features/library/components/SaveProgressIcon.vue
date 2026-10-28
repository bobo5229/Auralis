<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Segment from './vendor/segment'

// Geometry, loading sequence and check drawing from jagjitgill/svg-loading
// (MIT, edf7b8499754b7c23aa9ed3e5e7b656ea493ab61), powered by Segment.
// Vue owns the SVG; this adapter adds cancellation, short success hold,
// reduced motion and cleanup without the upstream button/DOM mutation layer.
const outer = ref<SVGPathElement | null>(null)
const check = ref<SVGPathElement | null>(null)
let segments: Segment[] = []
let stopped = false
let succeeding = false
let holdTimer: ReturnType<typeof setTimeout> | undefined
let fallbackTimer: ReturnType<typeof setTimeout> | undefined
let cancelSuccess: (() => void) | undefined
let popAnimation: Animation | undefined
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function spinOuter(): void {
  if (stopped || succeeding) return
  const segment = segments[0]
  segment.draw('15%', '25%', 0.2, {
    callback: () =>
      segment.draw('75%', '150%', 0.3, {
        circular: true,
        callback: () =>
          segment.draw('70%', '75%', 0.3, {
            circular: true,
            callback: () =>
              segment.draw('100%', '100% + 0.1', 0.4, {
                circular: true,
                callback: () => {
                  segment.draw(0, 0.1)
                  spinOuter()
                },
              }),
          }),
      }),
  })
}

onMounted(() => {
  if (!outer.value || !check.value) return
  segments = [outer.value, check.value].map((path) => new Segment(path, 0, 0.1))
  if (reducedMotion()) {
    segments[0].draw('15%', '75%')
  } else {
    spinOuter()
  }
})

function complete(signal: AbortSignal): Promise<void> {
  if (signal.aborted || stopped || segments.length !== 2) return Promise.resolve()
  succeeding = true
  segments.forEach((segment) => segment.stop())
  return new Promise((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      clearTimeout(holdTimer)
      clearTimeout(fallbackTimer)
      segments.forEach((segment) => segment.stop())
      popAnimation?.cancel()
      signal.removeEventListener('abort', settle)
      cancelSuccess = undefined
      resolve()
    }
    cancelSuccess = settle
    signal.addEventListener('abort', settle, { once: true })
    const drawCheck = (animate: boolean) => {
      if (settled) return
      if (!outer.value || !check.value || signal.aborted || stopped) return settle()
      if (!animate) segments.forEach((segment) => segment.stop())
      outer.value.style.visibility = 'hidden'
      check.value.style.visibility = 'visible'
      if (animate) {
        popAnimation = check.value.animate(
          [{ transform: 'scale(0.92)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
          { duration: 240, easing: 'ease-out' },
        )
      }
      segments[1].draw(0, '100%', animate ? 0.4 : 0, {
        callback: () => {
          holdTimer = setTimeout(settle, 300)
        },
      })
      if (!animate) holdTimer = setTimeout(settle, 300)
    }
    if (reducedMotion()) drawCheck(false)
    else {
      segments[0].draw('100%', '100% + 0.1', 0.12, {
        circular: true,
        callback: () => drawCheck(true),
      })
    }
    // Backgrounded windows may stop RAF. Do not hold an already saved dialog indefinitely.
    fallbackTimer = setTimeout(() => drawCheck(false), 1500)
  })
}

onBeforeUnmount(() => {
  stopped = true
  segments.forEach((segment) => segment.stop())
  cancelSuccess?.()
})
defineExpose({ complete })
</script>

<template>
  <svg class="save-progress-icon" viewBox="0 0 120 120" aria-hidden="true">
    <path ref="outer" d="M 60 60 m 0 -50 a 50 50 0 1 1 0 100 a 50 50 0 1 1 0 -100" />
    <path ref="check" class="save-progress-icon-check" d="M 15 60 L 48 93 L 105 27" />
  </svg>
</template>

<style scoped>
.save-progress-icon {
  width: 20px;
  height: 20px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 10;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.save-progress-icon-check {
  visibility: hidden;
  transform-origin: 60px 60px;
}
</style>
