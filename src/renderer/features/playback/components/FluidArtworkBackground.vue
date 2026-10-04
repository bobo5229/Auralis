<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import type {
  BackgroundRender as AmllBackgroundRender,
  MeshGradientRenderer as AmllMeshGradientRenderer,
} from '@applemusic-like-lyrics/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { createArtworkBackgroundSession } from './artworkBackgroundSession'

const props = defineProps<{
  artworkUrl: string | null
  active: boolean
  playing: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
let background: AmllBackgroundRender<AmllMeshGradientRenderer> | null = null
let session: ReturnType<typeof createArtworkBackgroundSession> | null = null
let reducedMotionQuery: MotionQuery | null = null
let albumRequestToken = 0
let disposed = false
let contextLost = false

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
  background.setFlowSpeed(props.playing ? 1.6 : 0.6)
  background.setFPS(props.playing ? 60 : 30)

  if (!contextLost && props.active && document.visibilityState === 'visible') {
    background.resume()
  } else {
    background.pause()
  }
}

async function syncAlbum(): Promise<void> {
  const currentSession = session
  if (!currentSession || contextLost || disposed) return

  const token = ++albumRequestToken
  currentSession.cancelPendingAlbum()
  try {
    const image = await loadArtworkImage(props.artworkUrl ?? FALLBACK_ALBUM)
    if (token !== albumRequestToken) return
    await currentSession.setAlbum(image)
  } catch (error) {
    if (token !== albumRequestToken) return
    rendererDiagnostics.warn({
      scope: 'playback.fluid-background',
      message: 'Unable to load artwork',
      cause: error,
    })
    const fallbackImage = await loadArtworkImage(FALLBACK_ALBUM).catch(() => null)
    if (fallbackImage && token === albumRequestToken) {
      await currentSession.setAlbum(fallbackImage).catch(() => undefined)
    }
  }
}

function handleVisibilityChange(): void {
  syncRendererState()
}

function handleReducedMotionChange(): void {
  syncRendererState()
}

function handleContextLost(event: Event): void {
  // 允许浏览器恢复上下文；AMLL 自身不会暂停或重建失效的 GPU 资源。
  event.preventDefault()
  contextLost = true
  albumRequestToken += 1
  session?.cancelPendingAlbum()
  background?.pause()
}

function releaseBackground(): void {
  albumRequestToken += 1
  const canvas = background?.getElement()
  canvas?.removeEventListener('webglcontextlost', handleContextLost)
  canvas?.removeEventListener('webglcontextrestored', handleContextRestored)
  // 立即退出画面和动画，保留正在提交的资源直到可完整释放。
  canvas?.remove()
  session?.dispose()
  session = null
  background = null
}

function handleContextRestored(): void {
  if (disposed) return
  releaseBackground()
  contextLost = false
  void initializeBackground()
}

/**
 * AMLL MeshGradientRenderer 在不支持部分 WebGL 扩展时会 console.warn 探测结果。
 * 库内无配置开关，仅在构造窗口内过滤这些已知、无害的能力探测噪声。
 */
function createMeshGradientBackground(
  BackgroundRender: typeof import('@applemusic-like-lyrics/core').BackgroundRender,
  MeshGradientRenderer: typeof import('@applemusic-like-lyrics/core').MeshGradientRenderer,
): AmllBackgroundRender<AmllMeshGradientRenderer> {
  const originalWarn = console.warn.bind(console)
  const isWebGlCapabilityProbe = (args: unknown[]): boolean => {
    const message = typeof args[0] === 'string' ? args[0] : String(args[0] ?? '')
    return (
      message.includes('EXT_color_buffer_float not supported') ||
      message.includes('EXT_float_blend not supported') ||
      message.includes('OES_texture_float_linear not supported') ||
      message.includes('OES_texture_float not supported')
    )
  }

  console.warn = (...args: unknown[]) => {
    if (isWebGlCapabilityProbe(args)) return
    originalWarn(...args)
  }

  try {
    return BackgroundRender.new(MeshGradientRenderer)
  } finally {
    console.warn = originalWarn
  }
}

async function initializeBackground(): Promise<void> {
  const container = containerRef.value
  if (!container) return

  try {
    const { BackgroundRender, MeshGradientRenderer } = await import('@applemusic-like-lyrics/core')
    if (disposed || !container.isConnected) return

    background = createMeshGradientBackground(BackgroundRender, MeshGradientRenderer)
    session = createArtworkBackgroundSession(background)
    const canvas = background.getElement()
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
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
    background.setLowFreqVolume(0)
    syncRendererState()
    await syncAlbum()
  } catch (error) {
    if (disposed) return
    rendererDiagnostics.warn({
      scope: 'playback.fluid-background',
      message: 'Renderer unavailable',
      cause: error,
    })
    releaseBackground()
  }
}

watch(() => props.artworkUrl, syncAlbum)
watch(
  () => [props.active, props.playing],
  () => syncRendererState(),
)

onMounted(() => {
  disposed = false
  reducedMotionQuery = createReducedMotionQuery()
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void initializeBackground()
})

onBeforeUnmount(() => {
  disposed = true
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  releaseBackground()
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
  background: var(--auralis-artwork-background-fallback);
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
      rgba(0, 0, 0, 0.45) 100%
    ),
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.08) 0%,
      transparent 30%,
      transparent 60%,
      rgba(14, 17, 23, 0.4) 80%,
      rgba(14, 17, 23, 0.8) 100%
    );
}

.fluid-artwork-background-noise {
  z-index: 2;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
}
</style>
