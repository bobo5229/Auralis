import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { observeWindowVisibility } from './windowVisibility'

/** Electron's backgroundThrottling:false keeps document visible even while its window is hidden. */
export function useWindowVisibility() {
  const api = typeof window === 'undefined' ? undefined : window.auralis?.window
  const nativeVisible = ref(!api)
  const documentVisible = ref(typeof document === 'undefined' || !document.hidden)
  let stop: (() => void) | undefined
  const updateDocument = (): void => {
    documentVisible.value = !document.hidden
  }
  onMounted(() => {
    updateDocument()
    document.addEventListener('visibilitychange', updateDocument)
    if (api) {
      stop = observeWindowVisibility((visible) => {
        nativeVisible.value = visible
      }, api)
    }
  })
  onBeforeUnmount(() => {
    stop?.()
    document.removeEventListener('visibilitychange', updateDocument)
  })
  return computed(() => nativeVisible.value && documentVisible.value)
}
