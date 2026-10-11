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
import FluidArtworkBackgroundEffects from './FluidArtworkBackgroundEffects.vue'
import {
  createFrameCapturingMeshRenderer,
  type FluidBackgroundFrame,
} from '../runtime/fluidBackgroundFrameCapture'
import { FLUID_BACKGROUND_FEATHER_PX, FLUID_BACKGROUND_SCALE } from '../runtime/backgroundMorph'

const props = withDefaults(
  defineProps<{
    artworkUrl: string | null
    active: boolean
    playing: boolean
    target: HTMLElement | null
    enabled: boolean
    visible: boolean
    motionPaused?: boolean
    captureFrames?: boolean
    effects?: boolean
    windowVisible?: boolean
    deferInitialization?: boolean
  }>(),
  {
    motionPaused: false,
    captureFrames: false,
    effects: true,
    windowVisible: true,
    deferInitialization: false,
  },
)
const emit = defineEmits<{
  frame: [frame: FluidBackgroundFrame]
  ready: [artworkUrl: string | null]
  invalidated: []
  unavailable: []
  lost: []
  'capture-unavailable': []
}>()

const containerRef = ref<HTMLElement | null>(null)
let background: AmllBackgroundRender<AmllMeshGradientRenderer> | null = null
let session: ReturnType<typeof createArtworkBackgroundSession> | null = null
let reducedMotionQuery: MotionQuery | null = null
let albumRequestToken = 0
let disposed = false
let contextLost = false
let initializationPending = false
let reinitializeAfterPending = false
let cancelInitialization: (() => void) | null = null
let priming = false
let primeTimeout: ReturnType<typeof setTimeout> | undefined
let committedArtworkUrl: string | null | undefined
let readyArtworkUrl: string | null | undefined
let captureSupported = true

const FALLBACK_ALBUM =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%230e1117'/%3E%3C/svg%3E"
function cancelPrime(): void {
  priming = false
  clearTimeout(primeTimeout)
  primeTimeout = undefined
}

function loadArtworkImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load artwork image'))
    image.src = source
  })
}

function syncRendererState(): void {
  if (!background) return
  cancelPrime()

  background.setStaticMode(props.motionPaused || reducedMotionQuery?.matches === true)
  background.setFlowSpeed(props.playing ? 1.6 : 0.6)
  background.setFPS(props.playing || props.captureFrames ? 60 : 12)

  if (
    !contextLost &&
    props.enabled &&
    props.windowVisible &&
    props.active &&
    (!props.deferInitialization || readyArtworkUrl === props.artworkUrl) &&
    (props.visible || props.captureFrames) &&
    document.visibilityState === 'visible'
  ) {
    background.resume()
  } else {
    background.pause()
    if (committedArtworkUrl === props.artworkUrl && readyArtworkUrl === undefined) primeBackground()
  }
}

function primeBackground(): void {
  const current = background
  if (
    !current ||
    !props.enabled ||
    props.deferInitialization ||
    props.active ||
    !props.windowVisible ||
    contextLost ||
    document.visibilityState !== 'visible'
  )
    return
  // Settle the asynchronous artwork fade while parked, then stop. Static mode still
  // draws until AMLL reports its album ready; no continuous flow is left running.
  cancelPrime()
  priming = true
  current.setStaticMode(true)
  current.resume()
  primeTimeout = setTimeout(() => {
    if (background === current && priming) {
      cancelPrime()
      current.pause()
      if (readyArtworkUrl === undefined) emit('unavailable')
    }
  }, 10_000)
}

function handleFrame(canvas: HTMLCanvasElement, settled: boolean): void {
  if (
    disposed ||
    contextLost ||
    background?.getElement() !== canvas ||
    committedArtworkUrl !== props.artworkUrl
  )
    return
  if (settled && readyArtworkUrl !== committedArtworkUrl) {
    readyArtworkUrl = committedArtworkUrl
    emit('ready', committedArtworkUrl)
  }
  if (props.captureFrames) emit('frame', { canvas, artworkUrl: props.artworkUrl, settled })
  if (priming && settled) {
    cancelPrime()
    background.pause()
  }
}

function requestFrame(): void {
  if (!background || contextLost || !props.enabled || !props.windowVisible || document.hidden)
    return
  // setStaticMode requests a draw even after a previously settled static frame.
  background.setStaticMode(
    props.motionPaused || reducedMotionQuery?.matches === true || !props.active,
  )
  background.resume()
}
defineExpose({ requestFrame })

async function syncAlbum(): Promise<void> {
  const currentSession = session
  if (!currentSession || !props.enabled || contextLost || disposed) return
  const artworkUrl = props.artworkUrl
  if (committedArtworkUrl === artworkUrl) return

  const token = ++albumRequestToken
  currentSession.cancelPendingAlbum()
  try {
    const image = await loadArtworkImage(artworkUrl ?? FALLBACK_ALBUM)
    if (token !== albumRequestToken) return
    await currentSession.setAlbum(image)
    if (token === albumRequestToken) {
      committedArtworkUrl = artworkUrl
      if (!captureSupported) {
        readyArtworkUrl = artworkUrl
        emit('ready', artworkUrl)
      }
      primeBackground()
    }
  } catch (error) {
    if (token !== albumRequestToken) return
    rendererDiagnostics.warn({
      scope: 'playback.fluid-background',
      message: 'Unable to load artwork',
      cause: error,
    })
    const fallbackImage = await loadArtworkImage(FALLBACK_ALBUM).catch(() => null)
    if (fallbackImage && token === albumRequestToken) {
      try {
        await currentSession.setAlbum(fallbackImage)
        if (token === albumRequestToken) {
          committedArtworkUrl = artworkUrl
          if (!captureSupported) {
            readyArtworkUrl = artworkUrl
            emit('ready', artworkUrl)
          }
          primeBackground()
        }
      } catch {
        if (token === albumRequestToken) emit('unavailable')
      }
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
  cancelPrime()
  readyArtworkUrl = undefined
  emit('lost')
  albumRequestToken += 1
  session?.cancelPendingAlbum()
  background?.pause()
}

function releaseBackground(): void {
  committedArtworkUrl = undefined
  readyArtworkUrl = undefined
  cancelPrime()
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
  if (initializationPending) reinitializeAfterPending = true
  else void initializeBackground()
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
    return BackgroundRender.new(
      createFrameCapturingMeshRenderer(MeshGradientRenderer, handleFrame, () => {
        captureSupported = false
        emit('capture-unavailable')
      }),
    )
  } finally {
    console.warn = originalWarn
  }
}

async function initializeBackground(): Promise<void> {
  const container = containerRef.value
  if (
    !container ||
    background ||
    initializationPending ||
    disposed ||
    props.deferInitialization ||
    !props.windowVisible
  )
    return
  initializationPending = true

  try {
    const { BackgroundRender, MeshGradientRenderer } = await import('@applemusic-like-lyrics/core')
    if (
      disposed ||
      !container.isConnected ||
      !props.enabled ||
      props.deferInitialization ||
      !props.windowVisible
    )
      return

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
    canvas.style.filter = `blur(${FLUID_BACKGROUND_FEATHER_PX}px)`
    canvas.style.transform = `scale(${FLUID_BACKGROUND_SCALE})`
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
    emit('unavailable')
  } finally {
    initializationPending = false
    if (reinitializeAfterPending) {
      reinitializeAfterPending = false
      scheduleInitialization()
    }
  }
}

function scheduleInitialization(): void {
  cancelInitialization?.()
  cancelInitialization = null
  if (!props.enabled || !props.windowVisible || props.deferInitialization || background || disposed)
    return
  const prepare = () => {
    cancelInitialization = null
    if (props.enabled && !disposed) void initializeBackground()
  }
  // Prepare the selected mode while the player is parked, outside the opening click task.
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(prepare, { timeout: 1000 })
    cancelInitialization = () => cancelIdleCallback(id)
  } else {
    const id = setTimeout(prepare, 0)
    cancelInitialization = () => clearTimeout(id)
  }
}

watch(
  () => props.artworkUrl,
  () => {
    readyArtworkUrl = undefined
    emit('invalidated')
    void syncAlbum()
  },
)
watch(
  () => [props.enabled, props.windowVisible, props.deferInitialization],
  ([enabled]) => {
    scheduleInitialization()
    if (enabled && background) void syncAlbum()
    else if (!enabled) {
      albumRequestToken++
      session?.cancelPendingAlbum()
    }
  },
)
watch(
  () => [
    props.active,
    props.enabled,
    props.playing,
    props.visible,
    props.target,
    props.motionPaused,
    props.captureFrames,
    props.windowVisible,
    props.deferInitialization,
  ],
  () => syncRendererState(),
  { flush: 'post' },
)

onMounted(() => {
  disposed = false
  reducedMotionQuery = createReducedMotionQuery()
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  scheduleInitialization()
})

onBeforeUnmount(() => {
  disposed = true
  cancelInitialization?.()
  cancelInitialization = null
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  releaseBackground()
})
</script>

<template>
  <Teleport :to="target ?? 'body'">
    <div
      ref="containerRef"
      class="fluid-artwork-background"
      :class="{ 'fluid-artwork-background--parked': target === null }"
      :style="{ visibility: visible ? 'visible' : 'hidden' }"
      aria-hidden="true"
    >
      <FluidArtworkBackgroundEffects v-if="effects" />
    </div>
  </Teleport>
</template>

<style scoped>
.fluid-artwork-background,
.fluid-artwork-background-canvas {
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

.fluid-artwork-background--parked {
  /* Preserve viewport size while paused so returning does not resize the GPU buffer. */
  position: fixed;
}
</style>
