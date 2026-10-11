import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  backgroundMorphPresentation,
  type BackgroundMorphEndpoint,
} from '../runtime/backgroundMorph'
import type { FluidBackgroundFrame } from '../runtime/fluidBackgroundFrameCapture'
import type { FullscreenBackgroundMode } from './useFullscreenBackground'

export interface MorphBackgroundHandle {
  readonly ready: boolean
  uploadFlowFrame(source: HTMLCanvasElement): boolean
  transitionTo(target: BackgroundMorphEndpoint, animated: boolean): void
}
export interface FluidBackgroundHandle {
  requestFrame(): void
}

interface BackgroundState {
  mode: FullscreenBackgroundMode
  active: boolean
  target: HTMLElement | null
  artworkUrl: string | null
  artworkKey: string | null
  palette: { readonly key: string }
}

const endpoint = (mode: FullscreenBackgroundMode): BackgroundMorphEndpoint =>
  mode === 'metal' ? 1 : 0

/** Coordinate persistent renderers; music/queue state stays in usePlayback. */
export function useFullscreenArtworkBackground(
  state: BackgroundState,
  surface: Ref<HTMLElement | null>,
  metal: Ref<MorphBackgroundHandle | null>,
  fluid: Ref<FluidBackgroundHandle | null>,
  onFallback: (mode: FullscreenBackgroundMode) => void,
) {
  const shownMode = ref(state.mode)
  const transitioning = ref(false)
  const preparing = ref(false)
  const windowVisible = ref(true)
  const documentVisible = ref(!document.hidden)
  const metalFailed = ref(false),
    fluidFailed = ref(false)
  const morphSupported = ref(true)
  const reducedMotion = ref(false)
  const fluidReady = ref(false)
  const active = computed(() => state.active && windowVisible.value && documentVisible.value)
  const presentationMode = computed(() => (transitioning.value ? 'metal' : shownMode.value))
  const metalEnabled = computed(
    () =>
      !metalFailed.value && (state.mode === 'metal' || shownMode.value === 'metal' || state.active),
  )
  const fluidEnabled = computed(
    () =>
      !fluidFailed.value && (state.mode === 'fluid' || shownMode.value === 'fluid' || state.active),
  )
  const metalActive = computed(
    () => active.value && (shownMode.value === 'metal' || preparing.value || transitioning.value),
  )
  const fluidActive = computed(
    () => active.value && (shownMode.value === 'fluid' || preparing.value || transitioning.value),
  )
  const captureFrames = computed(
    () => active.value && morphSupported.value && (preparing.value || transitioning.value),
  )
  const metalVisible = computed(
    () =>
      state.target !== null &&
      (shownMode.value === 'metal' || transitioning.value) &&
      !metalFailed.value,
  )
  // Keep native flow underneath a morph, so a drawing-buffer resize cannot expose black.
  const fluidVisible = computed(
    () =>
      state.target !== null &&
      !fluidFailed.value &&
      (shownMode.value === 'fluid' ||
        preparing.value ||
        transitioning.value ||
        !metal.value?.ready),
  )
  let readyArtworkUrl: string | null | undefined
  let capturedArtworkUrl: string | null | undefined
  let phase = endpoint(state.mode) as number
  let animateRequest = false
  let requestVersion = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  let motionQuery: MotionQuery | null = null
  let stopWindowVisibility: (() => void) | null = null

  function applyPresentation(value: number): void {
    phase = value
    const element = surface.value
    if (!element) return
    const presentation = backgroundMorphPresentation(value)
    element.style.setProperty('--background-morph-feather', `${presentation.feather}px`)
    element.style.setProperty('--background-morph-scale', String(presentation.scale))
    element.style.setProperty('--background-flow-effects', String(presentation.effects))
    element.dataset.backgroundPhase = String(value)
  }

  function cancelPreparation(): void {
    requestVersion++
    clearTimeout(timeout)
    timeout = undefined
    preparing.value = false
    capturedArtworkUrl = undefined
  }

  function settle(mode = state.mode): void {
    cancelPreparation()
    transitioning.value = false
    shownMode.value = mode
    metal.value?.transitionTo(endpoint(mode), false)
    applyPresentation(endpoint(mode))
  }

  function unavailable(mode: FullscreenBackgroundMode, permanent = true): void {
    const interrupted = preparing.value || transitioning.value
    if (permanent) {
      if (mode === 'metal') metalFailed.value = true
      else fluidFailed.value = true
    }
    cancelPreparation()
    transitioning.value = false
    const fallback = mode === 'metal' ? 'fluid' : 'metal'
    const fallbackFailed = fallback === 'metal' ? metalFailed.value : fluidFailed.value
    // Failure of an idle alternate must not change a healthy selected material.
    if (state.mode !== mode && shownMode.value !== mode) {
      if (interrupted) settle()
      return
    }
    if (!fallbackFailed) {
      settle(fallback)
      onFallback(fallback)
    } else applyPresentation(endpoint(shownMode.value))
  }

  async function tryStart(): Promise<void> {
    if (!preparing.value || !active.value) return
    const version = requestVersion
    await nextTick()
    if (version !== requestVersion || !preparing.value || !active.value) return
    const isFluidReady = fluidReady.value && readyArtworkUrl === state.artworkUrl
    const isMetalReady = metal.value?.ready === true
    if (!animateRequest || reducedMotion.value || !morphSupported.value) {
      if (state.mode === 'fluid' ? isFluidReady : isMetalReady) settle(state.mode)
      return
    }
    const paletteReady = state.artworkKey === null || state.palette.key === state.artworkKey
    if (!isMetalReady || !isFluidReady || !paletteReady) return
    if (capturedArtworkUrl !== state.artworkUrl) {
      fluid.value?.requestFrame()
      return
    }
    const target = endpoint(state.mode)
    // Submit the matching source endpoint before showing the morph surface.
    metal.value?.transitionTo(endpoint(shownMode.value), false)
    cancelPreparation()
    transitioning.value = true
    applyPresentation(endpoint(shownMode.value))
    metal.value?.transitionTo(target, true)
  }

  function select(): void {
    const failed = state.mode === 'metal' ? metalFailed.value : fluidFailed.value
    if (failed) {
      unavailable(state.mode)
      return
    }
    if (!active.value) {
      settle()
      return
    }
    if (transitioning.value) {
      metal.value?.transitionTo(endpoint(state.mode), !reducedMotion.value && morphSupported.value)
      return
    }
    if (state.mode === shownMode.value) {
      cancelPreparation()
      return
    }
    cancelPreparation()
    animateRequest = !reducedMotion.value && morphSupported.value
    preparing.value = true
    const version = requestVersion
    timeout = setTimeout(() => {
      if (version !== requestVersion || !preparing.value) return
      rendererDiagnostics.warn({
        scope: 'playback.background-morph',
        message: 'Background preparation timed out',
      })
      // Keep the currently usable renderer when only the bridge is unavailable.
      if (metal.value?.ready && fluidReady.value) {
        morphSupported.value = false
        animateRequest = false
        void tryStart()
      } else unavailable(metal.value?.ready ? 'fluid' : 'metal')
    }, 10_000)
    void tryStart()
  }

  function onFluidReady(artworkUrl: string | null): void {
    if (artworkUrl !== state.artworkUrl) return
    readyArtworkUrl = artworkUrl
    fluidReady.value = true
    void tryStart()
  }
  function onFluidInvalidated(): void {
    fluidReady.value = false
    readyArtworkUrl = capturedArtworkUrl = undefined
  }
  function onFlowFrame(frame: FluidBackgroundFrame): void {
    if (!captureFrames.value || frame.artworkUrl !== state.artworkUrl) return
    if (metal.value?.uploadFlowFrame(frame.canvas)) capturedArtworkUrl = frame.artworkUrl
    if (frame.settled) onFluidReady(frame.artworkUrl)
  }
  function onMorphFrame(value: number): void {
    if (transitioning.value && value !== phase) applyPresentation(value)
  }
  function onMorphComplete(value: BackgroundMorphEndpoint): void {
    if (!transitioning.value || value !== endpoint(state.mode)) return
    transitioning.value = false
    shownMode.value = state.mode
    applyPresentation(value)
  }
  function onCaptureUnavailable(): void {
    morphSupported.value = false
    if (transitioning.value) settle()
    else void tryStart()
  }

  function syncMotionPreference(): void {
    reducedMotion.value = motionQuery?.matches === true
    if (reducedMotion.value) {
      if (transitioning.value) settle()
      else void tryStart()
    }
  }
  function syncDocumentVisibility(): void {
    documentVisible.value = !document.hidden
  }

  watch(() => state.mode, select, { flush: 'post' })
  watch(active, () => settle(), { flush: 'sync' })
  watch(
    () => [state.artworkUrl, state.artworkKey],
    () => {
      capturedArtworkUrl = undefined
      if (readyArtworkUrl !== state.artworkUrl) onFluidInvalidated()
    },
    { flush: 'sync' },
  )
  watch(
    () => [metal.value?.ready, state.palette.key],
    () => {
      void tryStart()
    },
  )
  watch(surface, () => applyPresentation(transitioning.value ? phase : endpoint(shownMode.value)), {
    flush: 'post',
  })

  onMounted(() => {
    motionQuery = createReducedMotionQuery()
    syncMotionPreference()
    motionQuery.addEventListener('change', syncMotionPreference)
    document.addEventListener('visibilitychange', syncDocumentVisibility)
    stopWindowVisibility = observeWindowVisibility((visible) => {
      windowVisible.value = visible
    })
    applyPresentation(endpoint(shownMode.value))
  })
  onBeforeUnmount(() => {
    cancelPreparation()
    transitioning.value = false
    motionQuery?.removeEventListener('change', syncMotionPreference)
    document.removeEventListener('visibilitychange', syncDocumentVisibility)
    stopWindowVisibility?.()
  })

  return {
    active,
    windowVisible,
    presentationMode,
    transitioning,
    preparing,
    metalEnabled,
    fluidEnabled,
    metalActive,
    fluidActive,
    metalVisible,
    fluidVisible,
    captureFrames,
    onFlowFrame,
    onFluidReady,
    onFluidInvalidated,
    onMorphFrame,
    onMorphComplete,
    onCaptureUnavailable,
    onMetalUnavailable: () => unavailable('metal'),
    onFluidUnavailable: () => unavailable('fluid'),
    onMetalLost: () => unavailable('metal', false),
    onFluidLost: () => {
      onFluidInvalidated()
      unavailable('fluid', false)
    },
  }
}
