import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-cover-artwork-rounded'

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.cover-artwork',
      message: 'Could not read cover corner preference',
      cause,
    })
    return true
  }
}

const coverArtworkRounded = ref(readPersisted())

function setCoverArtworkRounded(enabled: boolean): void {
  coverArtworkRounded.value = enabled
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.cover-artwork',
      message: 'Could not save cover corner preference; keeping it for this session',
      cause,
    })
  }
}

export function useCoverArtworkCorners() {
  return { coverArtworkRounded: readonly(coverArtworkRounded), setCoverArtworkRounded }
}
