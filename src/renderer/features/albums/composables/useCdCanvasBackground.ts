import { readonly, ref } from 'vue'

const STORAGE_KEY = 'auralis-cd-canvas-background'

function readPersisted(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    // Legacy accent selection becomes on; all other old selections become off.
    const enabled = value === 'true' || value === 'accent'
    if (value !== null && value !== String(enabled)) {
      try {
        localStorage.setItem(STORAGE_KEY, String(enabled))
      } catch {
        /* Keep the session state. */
      }
    }
    return enabled
  } catch {
    return false
  }
}

const cdCanvasBackgroundEnabled = ref(readPersisted())

function toggleCdCanvasBackground(): void {
  cdCanvasBackgroundEnabled.value = !cdCanvasBackgroundEnabled.value
  try {
    localStorage.setItem(STORAGE_KEY, String(cdCanvasBackgroundEnabled.value))
  } catch {
    // Keep the current session usable if storage is unavailable.
  }
}

/** The saved switch survives leaving focus and temporarily using the dark canvas. */
export function useCdCanvasBackground() {
  return {
    cdCanvasBackgroundEnabled: readonly(cdCanvasBackgroundEnabled),
    toggleCdCanvasBackground,
  }
}
