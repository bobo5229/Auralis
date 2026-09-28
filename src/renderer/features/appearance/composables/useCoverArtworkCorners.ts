import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-cover-artwork-rounded'
const RADIUS_STORAGE_KEY = 'auralis-cover-artwork-radius'
export const DEFAULT_COVER_ARTWORK_RADIUS = 8

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
const coverArtworkRadius = ref(readPersistedRadius())

function readPersistedRadius(): number {
  try {
    const value = Number(localStorage.getItem(RADIUS_STORAGE_KEY))
    return Number.isInteger(value) && value >= 4 && value <= 24 && value % 2 === 0
      ? value
      : DEFAULT_COVER_ARTWORK_RADIUS
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.cover-artwork',
      message: 'Could not read cover corner radius preference',
      cause,
    })
    return DEFAULT_COVER_ARTWORK_RADIUS
  }
}

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

function setCoverArtworkRadius(radius: number): void {
  if (!Number.isInteger(radius) || radius < 4 || radius > 24 || radius % 2 !== 0) return
  coverArtworkRadius.value = radius
  try {
    localStorage.setItem(RADIUS_STORAGE_KEY, String(radius))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.cover-artwork',
      message: 'Could not save cover corner radius preference; keeping it for this session',
      cause,
    })
  }
}

export function useCoverArtworkCorners() {
  return {
    coverArtworkRounded: readonly(coverArtworkRounded),
    setCoverArtworkRounded,
    coverArtworkRadius: readonly(coverArtworkRadius),
    setCoverArtworkRadius,
  }
}
