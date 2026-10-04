import { readonly, ref } from 'vue'
import type { CdVibrationStyle } from '../utils/cdVibrationMotion'

const STORAGE_KEY = 'auralis-cd-vibration-enabled'
function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
const cdVibrationEnabled = ref(readPersisted())
const STYLE_KEY = 'auralis-cd-vibration-style'
function readStyle(): CdVibrationStyle {
  try {
    return localStorage.getItem(STYLE_KEY) === 'elastic' ? 'elastic' : 'smooth'
  } catch {
    return 'smooth'
  }
}
const cdVibrationStyle = ref<CdVibrationStyle>(readStyle())

export function useCdVibration() {
  function toggleCdVibration(): void {
    cdVibrationEnabled.value = !cdVibrationEnabled.value
    try {
      localStorage.setItem(STORAGE_KEY, String(cdVibrationEnabled.value))
    } catch {
      // The switch remains usable for this session.
    }
  }
  function setCdVibrationStyle(style: CdVibrationStyle): void {
    cdVibrationStyle.value = style
    try {
      localStorage.setItem(STYLE_KEY, style)
    } catch {
      /* Session selection remains usable. */
    }
  }
  return {
    cdVibrationEnabled: readonly(cdVibrationEnabled),
    toggleCdVibration,
    cdVibrationStyle: readonly(cdVibrationStyle),
    setCdVibrationStyle,
  }
}
