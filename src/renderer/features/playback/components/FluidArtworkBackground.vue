<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ArtworkPalette } from '../types'
import { CanvasFluidRenderer } from '../renderers/canvasFluidRenderer'
import type { FluidRenderer } from '../renderers/fluidRenderer'
import { WebglFluidRenderer } from '../renderers/webglFluidRenderer'
import { subscribeVisualFrame } from '../utils/visualFrameScheduler'

const props = defineProps<{
  palette: ArtworkPalette
  active: boolean
  playing: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
let renderer: FluidRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let unsubscribeFrame: (() => void) | null = null
let lastFrameAt = 0
let reducedMotionQuery: MediaQueryList | null = null
let webglCanvas: HTMLCanvasElement | null = null
let highFrameRateUntil = 0
const AMBIENT_FRAME_INTERVAL_MS = 1000 / 30
const TRANSITION_FRAME_INTERVAL_MS = 1000 / 60
const PALETTE_TRANSITION_MS = 1200
const FRAME_INTERVAL_TOLERANCE = 0.85
const STATIC_GRADIENT_POSITIONS = [
  ['18%', '22%'],
  ['82%', '18%'],
  ['72%', '82%'],
  ['20%', '78%'],
] as const

function toCssRgb({ r, g, b }: ArtworkPalette['background']): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

const staticBackgroundStyle = computed(() => {
  const gradients = props.palette.accents
    .slice(0, STATIC_GRADIENT_POSITIONS.length)
    .map(({ rgb }, index) => {
      const [x, y] = STATIC_GRADIENT_POSITIONS[index]
      return `radial-gradient(circle at ${x} ${y}, ${toCssRgb(rgb)} 0%, transparent 62%)`
    })

  return {
    backgroundColor: toCssRgb(props.palette.background),
    backgroundImage: gradients.join(', '),
  }
})

function getDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 1.5)
}

function resizeRenderer(): void {
  const container = containerRef.value
  if (!container || !renderer) return
  const rect = container.getBoundingClientRect()
  renderer.resize(rect.width, rect.height, getDpr())
  renderer.render(performance.now(), 0)
}

function shouldAnimate(): boolean {
  return (
    props.active &&
    document.visibilityState === 'visible' &&
    !reducedMotionQuery?.matches &&
    Boolean(renderer)
  )
}

function stopAnimation(): void {
  unsubscribeFrame?.()
  unsubscribeFrame = null
  lastFrameAt = 0
}

function startAnimation(): void {
  if (!shouldAnimate() || unsubscribeFrame) return

  const tick = (time: number): void => {
    if (!shouldAnimate()) {
      stopAnimation()
      return
    }
    const frameInterval =
      time < highFrameRateUntil ? TRANSITION_FRAME_INTERVAL_MS : AMBIENT_FRAME_INTERVAL_MS
    if (lastFrameAt === 0 || time - lastFrameAt >= frameInterval * FRAME_INTERVAL_TOLERANCE) {
      renderer?.render(time, props.playing ? 1 : 0.35)
      lastFrameAt = time
    }
  }
  unsubscribeFrame = subscribeVisualFrame(tick)
}

function syncAnimation(): void {
  if (shouldAnimate()) {
    startAnimation()
  } else {
    stopAnimation()
    renderer?.render(performance.now(), 0)
  }
}

function handleVisibilityChange(): void {
  syncAnimation()
}

function handleReducedMotionChange(): void {
  syncAnimation()
}

function replaceCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const replacement = document.createElement('canvas')
  replacement.className = canvas.className
  canvas.replaceWith(replacement)
  canvasRef.value = replacement
  return replacement
}

function createCanvasFallback(canvas: HTMLCanvasElement): void {
  renderer?.dispose()
  renderer = null
  webglCanvas?.removeEventListener('webglcontextlost', handleWebglContextLost)
  webglCanvas = null

  const fallbackCanvas = replaceCanvas(canvas)
  try {
    renderer = new CanvasFluidRenderer(fallbackCanvas, props.palette)
    resizeRenderer()
    syncAnimation()
  } catch (error) {
    console.warn('[Auralis fluid background] Canvas renderer unavailable', error)
  }
}

function handleWebglContextLost(event: Event): void {
  event.preventDefault()
  const canvas = event.currentTarget as HTMLCanvasElement
  console.warn('[Auralis fluid background] WebGL context lost, using Canvas fallback')
  createCanvasFallback(canvas)
}

watch(
  () => props.palette,
  (palette) => {
    const now = performance.now()
    const reduceMotion = reducedMotionQuery?.matches ?? false
    const transitionStartedAt = reduceMotion ? now - PALETTE_TRANSITION_MS : now
    highFrameRateUntil = reduceMotion ? 0 : now + PALETTE_TRANSITION_MS
    lastFrameAt = 0
    renderer?.setPalette(palette, transitionStartedAt)
    syncAnimation()
  },
)

watch(
  () => [props.active, props.playing],
  () => syncAnimation(),
)

onMounted(() => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  try {
    renderer = new WebglFluidRenderer(canvas, props.palette)
    webglCanvas = canvas
    webglCanvas.addEventListener('webglcontextlost', handleWebglContextLost)
  } catch (error) {
    console.warn('[Auralis fluid background] WebGL2 unavailable, using Canvas fallback', error)
    createCanvasFallback(canvas)
  }

  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  resizeObserver = new ResizeObserver(() => resizeRenderer())
  resizeObserver.observe(container)

  nextTick(() => {
    resizeRenderer()
    syncAnimation()
  })
})

onBeforeUnmount(() => {
  stopAnimation()
  resizeObserver?.disconnect()
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  webglCanvas?.removeEventListener('webglcontextlost', handleWebglContextLost)
  webglCanvas = null
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="fluid-artwork-background"
    :style="staticBackgroundStyle"
    aria-hidden="true"
  >
    <canvas ref="canvasRef" class="fluid-artwork-background-canvas"></canvas>
    <div class="fluid-artwork-background-vignette"></div>
    <div class="fluid-artwork-background-noise"></div>
  </div>
</template>

<style scoped>
.fluid-artwork-background,
.fluid-artwork-background-canvas,
.fluid-artwork-background-vignette,
.fluid-artwork-background-noise {
  position: absolute;
  inset: 0;
}

.fluid-artwork-background {
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #0e1117;
}

.fluid-artwork-background-canvas {
  height: 100%;
  width: 100%;
}

.fluid-artwork-background-vignette {
  background:
    radial-gradient(
      ellipse at 34% 43%,
      transparent 0 23%,
      rgba(0, 0, 0, 0.14) 62%,
      rgba(0, 0, 0, 0.4) 100%
    ),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.34));
}

.fluid-artwork-background-noise {
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
}
</style>
