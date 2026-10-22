import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import type { FullscreenBackgroundMode } from './useFullscreenBackground'

interface BackgroundState {
  mode: FullscreenBackgroundMode
  active: boolean
  target: HTMLElement | null
}

/** Coordinate the flow surface; music/queue state stays in usePlayback. */
export function useFullscreenArtworkBackground(
  state: BackgroundState,
  onFallback: (mode: FullscreenBackgroundMode) => void,
) {
  const windowVisible = ref(true)
  const documentVisible = ref(!document.hidden)
  const fluidFailed = ref(false)
  const active = computed(() => state.active && windowVisible.value && documentVisible.value)
  const fluidEnabled = computed(() => state.mode === 'fluid' && !fluidFailed.value)
  const fluidActive = computed(() => fluidEnabled.value && active.value)
  const fluidVisible = computed(() => fluidEnabled.value && state.target !== null)
  let stopWindowVisibility: (() => void) | null = null

  function unavailable(permanent: boolean): void {
    // Late events from a parked renderer must not alter the selected static surface.
    if (state.mode !== 'fluid') return
    if (permanent) fluidFailed.value = true
    onFallback('solid')
  }

  function syncDocumentVisibility(): void {
    documentVisible.value = !document.hidden
  }

  watch(
    () => state.mode,
    (mode) => {
      if (mode === 'fluid' && fluidFailed.value) onFallback('solid')
    },
    { flush: 'sync' },
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', syncDocumentVisibility)
    stopWindowVisibility = observeWindowVisibility((visible) => {
      windowVisible.value = visible
    })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', syncDocumentVisibility)
    stopWindowVisibility?.()
  })

  return {
    windowVisible,
    fluidEnabled,
    fluidActive,
    fluidVisible,
    onFluidUnavailable: () => unavailable(true),
    onFluidLost: () => unavailable(false),
  }
}
