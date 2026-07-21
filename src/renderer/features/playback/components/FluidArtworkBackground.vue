<script setup lang="ts">
import type {
  BackgroundRender as AmllBackgroundRender,
  MeshGradientRenderer as AmllMeshGradientRenderer,
} from '@applemusic-like-lyrics/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  artworkUrl: string | null
  active: boolean
  playing: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
let background: AmllBackgroundRender<AmllMeshGradientRenderer> | null = null
let reducedMotionQuery: MediaQueryList | null = null
let albumRequestToken = 0
let disposed = false

const FALLBACK_ALBUM =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%230e1117'/%3E%3C/svg%3E"
const BACKGROUND_FEATHER_PX = 12

function loadArtworkImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load artwork image'))
    image.src = source
  })
}

function syncRendererState(): void {
  if (!background) return

  background.setStaticMode(reducedMotionQuery?.matches === true)
  background.setFlowSpeed(props.playing ? 2.2 : 0.6)

  if (props.active && document.visibilityState === 'visible') {
    background.resume()
  } else {
    background.pause()
  }
}

async function syncAlbum(): Promise<void> {
  const currentBackground = background
  if (!currentBackground) return

  const token = ++albumRequestToken
  try {
    const image = await loadArtworkImage(props.artworkUrl ?? FALLBACK_ALBUM)
    if (token !== albumRequestToken) return
    await currentBackground.setAlbum(image)
  } catch (error) {
    if (token !== albumRequestToken) return
    console.warn('[Auralis AMLL background] Unable to load artwork', error)
    const fallbackImage = await loadArtworkImage(FALLBACK_ALBUM).catch(() => null)
    if (fallbackImage && token === albumRequestToken) {
      await currentBackground.setAlbum(fallbackImage).catch(() => undefined)
    }
  }
}

function handleVisibilityChange(): void {
  syncRendererState()
}

function handleReducedMotionChange(): void {
  syncRendererState()
}

async function initializeBackground(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  try {
    const { BackgroundRender, MeshGradientRenderer } = await import('@applemusic-like-lyrics/core')
    if (disposed || !container.isConnected) return

    background = BackgroundRender.new(MeshGradientRenderer)
    const canvas = background.getElement()
    canvas.className = 'fluid-artwork-background-canvas'
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '0'
    canvas.style.filter = `blur(${BACKGROUND_FEATHER_PX}px)`
    canvas.style.transform = 'scale(1.08)'
    canvas.style.transformOrigin = 'center'
    container.prepend(canvas)
    background.setRenderScale(0.5)
    background.setFPS(60)
    background.setLowFreqVolume(0)
    syncRendererState()
    await syncAlbum()
  } catch (error) {
    if (disposed) return
    console.warn('[Auralis AMLL background] Renderer unavailable', error)
    background?.dispose()
    background = null
  }
}

watch(() => props.artworkUrl, syncAlbum)
watch(
  () => [props.active, props.playing],
  () => syncRendererState(),
)

onMounted(() => {
  disposed = false
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void initializeBackground()
})

onBeforeUnmount(() => {
  disposed = true
  albumRequestToken += 1
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  background?.dispose()
  background = null
})
</script>

<template>
  <div ref="containerRef" class="fluid-artwork-background" aria-hidden="true">
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
  display: block;
  height: 100%;
  width: 100%;
}

.fluid-artwork-background-vignette {
  z-index: 1;
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
  z-index: 2;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
}
</style>
