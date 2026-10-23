import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'

interface BackgroundState {
  active: boolean
  target: HTMLElement | null
}

/** Coordinate the flow surface; music/queue state stays in usePlayback. */
export function useFullscreenArtworkBackground(state: BackgroundState) {
  const windowVisible = ref(true)
  const documentVisible = ref(!document.hidden)
  const fluidFailed = ref(false)
  const active = computed(() => state.active && windowVisible.value && documentVisible.value)
  const fluidEnabled = computed(() => !fluidFailed.value)
  const fluidActive = computed(() => fluidEnabled.value && active.value)
  const fluidVisible = computed(() => fluidEnabled.value && state.target !== null)
  let stopWindowVisibility: (() => void) | null = null

  function syncDocumentVisibility(): void {
    documentVisible.value = !document.hidden
  }

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
    onFluidUnavailable: () => {
      fluidFailed.value = true
    },
  }
}
