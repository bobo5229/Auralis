import { readonly, ref } from 'vue'

/** Shell FluidArtworkBackground preference; default on. */
const STORAGE_KEY = 'auralis-shell-fluid-background-enabled'

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

const shellFluidBackgroundEnabled = ref(readPersisted())

function setShellFluidBackgroundEnabled(enabled: boolean): void {
  if (shellFluidBackgroundEnabled.value === enabled) return
  shellFluidBackgroundEnabled.value = enabled
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Quota / private mode: keep in-memory preference for this session.
  }
}

/**
 * Shared preference for the main-window shell fluid artwork layer.
 * Does not gate PlayerBar tint, fullscreen, mini player, or CD browse.
 */
export function useShellFluidBackground() {
  return {
    shellFluidBackgroundEnabled: readonly(shellFluidBackgroundEnabled),
    setShellFluidBackgroundEnabled,
  }
}
