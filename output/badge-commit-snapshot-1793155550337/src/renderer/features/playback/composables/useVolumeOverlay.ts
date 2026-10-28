import { ref } from 'vue'

/** Inline volume controls opened explicitly from the volume button. */
export function useVolumeOverlay() {
  const open = ref(false)

  function show(): void {
    open.value = true
  }

  function dismiss(): void {
    open.value = false
  }

  return {
    open,
    show,
    dismiss,
  }
}
