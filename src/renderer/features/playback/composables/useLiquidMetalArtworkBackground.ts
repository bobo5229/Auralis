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

interface BackgroundState {
  enabled: boolean
  active: boolean
  playing: boolean
  motionPaused: boolean
  palette: DeepReadonly<ArtworkPalette>
  settings: Readonly<LiquidMetalSettings>
}

/** Own one canvas/context for the overlay's lifetime, without retaining its lyrics DOM. */
export function useLiquidMetalArtworkBackground(
  canvas: Ref<HTMLCanvasElement | null>,
  state: BackgroundState,
  onUnavailable: () => void,
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
    renderer?.setState({
      active: state.enabled && state.active && windowVisible,
      playing: state.playing,
      reducedMotion: state.motionPaused || motionQuery?.matches === true,
    })
  }

  function initialize(): void {
    cancelWarmup?.()
    cancelWarmup = null
    if (!mounted || !canvas.value || !state.enabled || renderer) return
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
        onReady: () => (ready.value = true),
        onContextLost: () => (ready.value = false),
        onFrameInvalidated: () => (ready.value = false),
        onError: handleError,
      })
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
    if (!state.enabled) return
    if (state.active) {
      initialize()
      return
    }
    // Compile during a quiet moment after a track exists and metal is selected.
    // An inactive renderer submits no draws or frame polling; first entry uses
    // the driver's already compiled program, then sizes/draws the visible canvas.
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
  watch(() => [state.enabled, state.active], syncPreparation, { flush: 'post' })

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

  return { ready, resize: () => renderer?.resize() }
}
