import { onBeforeUnmount, onMounted, ref, watch, type DeepReadonly, type Ref } from 'vue'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import type { ArtworkPalette } from '../types'
import { toLiquidMetalPalette } from '../runtime/liquidMetalPalette'
import { createLiquidMetalRenderer } from '../runtime/liquidMetalRenderer'
import type { LiquidMetalSettings } from '../runtime/liquidMetalSettings'
import type { BackgroundMorphEndpoint } from '../runtime/backgroundMorph'

interface BackgroundState {
  enabled: boolean
  active: boolean
  playing: boolean
  motionPaused: boolean
  palette: DeepReadonly<ArtworkPalette>
  settings: Readonly<LiquidMetalSettings>
  deferInitialization?: boolean
  enableMorph?: boolean
}

/** Own one canvas/context for the overlay's lifetime, without retaining its lyrics DOM. */
export function useLiquidMetalArtworkBackground(
  canvas: Ref<HTMLCanvasElement | null>,
  state: BackgroundState,
  onUnavailable: () => void,
  callbacks: {
    onMorphFrame?: (phase: number) => void
    onMorphComplete?: (phase: BackgroundMorphEndpoint) => void
    onContextLost?: () => void
  } = {},
) {
  const ready = ref(false)
  let renderer: ReturnType<typeof createLiquidMetalRenderer> | null = null
  let motionQuery: MotionQuery | null = null
  let cancelWarmup: (() => void) | null = null
  let mounted = false
  let windowVisible = true
  let stopVisibility: (() => void) | null = null

  function handleError(error: unknown): void {
    rendererDiagnostics.warn({
      scope: 'playback.liquid-metal',
      message: 'Renderer unavailable',
      cause: error,
    })
    renderer?.dispose()
    renderer = null
    ready.value = false
    onUnavailable()
  }

  function syncState(): void {
    const deferColdFrame = state.deferInitialization && !ready.value
    renderer?.setState({
      active: state.enabled && state.active && windowVisible && !deferColdFrame,
      playing: state.playing,
      reducedMotion: state.motionPaused || motionQuery?.matches === true,
      ...(state.enableMorph ? { morphReducedMotion: motionQuery?.matches === true } : {}),
    })
    if (!state.enabled || !windowVisible || deferColdFrame) renderer?.cancelPrewarm()
    else if (!state.active) renderer?.prewarm()
  }

  function initialize(): void {
    cancelWarmup?.()
    cancelWarmup = null
    if (!mounted || !canvas.value || !state.enabled || state.deferInitialization || renderer) return
    if (!motionQuery) {
      motionQuery = createReducedMotionQuery()
      motionQuery.addEventListener('change', syncState)
    }
    try {
      renderer = createLiquidMetalRenderer(canvas.value, {
        palette: toLiquidMetalPalette(state.palette),
        settings: state.settings,
        active: state.active && windowVisible,
        playing: state.playing,
        reducedMotion: state.motionPaused || motionQuery.matches,
        ...(state.enableMorph ? { morphReducedMotion: motionQuery.matches } : {}),
        enableMorph: state.enableMorph,
        onMorphFrame: callbacks.onMorphFrame,
        onMorphComplete: callbacks.onMorphComplete,
        onReady: () => (ready.value = true),
        onContextLost: () => {
          ready.value = false
          callbacks.onContextLost?.()
        },
        onContextRestored: syncState,
        onFrameInvalidated: () => {
          ready.value = false
          if (state.deferInitialization) syncState()
        },
        onError: handleError,
      })
      if (!state.active && windowVisible) renderer.prewarm()
    } catch (error) {
      handleError(error)
    }
  }

  function syncPreparation(): void {
    cancelWarmup?.()
    cancelWarmup = null
    if (!mounted) return
    if (renderer) {
      syncState()
      return
    }
    if (!state.enabled || state.deferInitialization) return
    if (state.active) {
      initialize()
      return
    }
    // Prepare the selected mode during idle, including one GPU draw. Later parked
    // state changes reuse that frame without running an animation clock.
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(initialize, { timeout: 1500 })
      cancelWarmup = () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(initialize, 64)
      cancelWarmup = () => clearTimeout(id)
    }
  }

  watch(
    () => state.palette,
    (palette) => renderer?.setPalette(toLiquidMetalPalette(palette)),
  )
  watch(
    () => state.settings,
    (settings) => renderer?.setMaterial(settings),
  )
  watch(() => [state.playing, state.motionPaused], syncState)
  watch(() => [state.enabled, state.active, state.deferInitialization], syncPreparation, {
    flush: 'post',
  })

  onMounted(() => {
    mounted = true
    stopVisibility = observeWindowVisibility((visible) => {
      windowVisible = visible
      syncState()
    })
    syncPreparation()
  })
  onBeforeUnmount(() => {
    mounted = false
    stopVisibility?.()
    stopVisibility = null
    cancelWarmup?.()
    cancelWarmup = null
    motionQuery?.removeEventListener('change', syncState)
    renderer?.dispose()
    renderer = null
  })

  return {
    ready,
    resize: () => renderer?.resize(),
    uploadFlowFrame: (source: HTMLCanvasElement) => renderer?.uploadFlowFrame(source) ?? false,
    transitionTo: (target: BackgroundMorphEndpoint, animated: boolean) =>
      renderer?.transitionTo(target, animated),
  }
}
