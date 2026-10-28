import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  DEFAULT_LIGHT_ACCENT,
  LIGHT_ACCENT_DIAGNOSTIC_SCOPE,
  LIGHT_ACCENT_STORAGE_KEY,
} from '../constants/lightAccent'
import { normalizeDarkAccent } from '../utils/resolveDarkAccent'
import { resolveLightAccent } from '../utils/resolveLightAccent'

const lightAccent = ref(readInitialLightAccent())
const persistFailed = ref(false)
const resolution = computed(() => resolveLightAccent(lightAccent.value))

function readInitialLightAccent(): string {
  let stored: string | null
  try {
    stored =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(LIGHT_ACCENT_STORAGE_KEY)
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: LIGHT_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Could not read light accent preference; using the default for this session',
      cause,
    })
    return DEFAULT_LIGHT_ACCENT
  }

  if (stored === null) return DEFAULT_LIGHT_ACCENT
  const normalized = normalizeDarkAccent(stored)
  if (normalized) return normalized

  rendererDiagnostics.warn({
    scope: LIGHT_ACCENT_DIAGNOSTIC_SCOPE,
    message: 'Ignored an invalid stored light accent; preserving it until the next valid edit',
  })
  return DEFAULT_LIGHT_ACCENT
}

function applyLightAccent(): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  const rootStyle = document.documentElement.style
  rootStyle.setProperty('--auralis-light-accent-source', resolution.value.source)
  rootStyle.setProperty('--auralis-light-accent', resolution.value.display)
  rootStyle.setProperty('--auralis-light-accent-soft', resolution.value.soft)
  rootStyle.setProperty('--auralis-light-on-accent', resolution.value.onAccent)
}

function persistLightAccent(): void {
  try {
    localStorage.setItem(LIGHT_ACCENT_STORAGE_KEY, lightAccent.value)
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: LIGHT_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Could not save light accent preference; keeping it for this session',
      cause,
    })
  }
}

function setLightAccent(value: unknown, persistWhenUnchanged = false): boolean {
  const normalized = normalizeDarkAccent(value)
  if (!normalized) {
    rendererDiagnostics.warn({
      scope: LIGHT_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Ignored an invalid light accent update',
    })
    return false
  }

  const changed = lightAccent.value !== normalized
  if (changed) lightAccent.value = normalized
  applyLightAccent()
  if (changed || persistFailed.value || persistWhenUnchanged) persistLightAccent()
  return true
}

function resetLightAccent(): void {
  setLightAccent(DEFAULT_LIGHT_ACCENT, true)
}

function initLightAccent(): void {
  applyLightAccent()
}

export function useLightAccent() {
  return {
    lightAccent: readonly(lightAccent),
    resolution,
    persistFailed: readonly(persistFailed),
    initLightAccent,
    setLightAccent,
    resetLightAccent,
  }
}
