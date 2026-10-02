import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  DARK_ACCENT_DIAGNOSTIC_SCOPE,
  DARK_ACCENT_STORAGE_KEY,
  DEFAULT_DARK_ACCENT,
} from '../constants/darkAccent'
import { normalizeDarkAccent, resolveDarkAccent } from '../utils/resolveDarkAccent'

const darkAccent = ref(readInitialDarkAccent())
const persistFailed = ref(false)
const resolution = computed(() => resolveDarkAccent(darkAccent.value))

function readInitialDarkAccent(): string {
  let stored: string | null
  try {
    stored =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(DARK_ACCENT_STORAGE_KEY)
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: DARK_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Could not read dark accent preference; using the default for this session',
      cause,
    })
    return DEFAULT_DARK_ACCENT
  }

  if (stored === null) return DEFAULT_DARK_ACCENT
  const normalized = normalizeDarkAccent(stored)
  if (normalized) return normalized

  rendererDiagnostics.warn({
    scope: DARK_ACCENT_DIAGNOSTIC_SCOPE,
    message: 'Ignored an invalid stored dark accent; preserving it until the next valid edit',
  })
  return DEFAULT_DARK_ACCENT
}

function applyDarkAccent(): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  const rootStyle = document.documentElement.style
  rootStyle.setProperty('--auralis-dark-accent-source', resolution.value.source)
  rootStyle.setProperty('--auralis-dark-accent', resolution.value.display)
  rootStyle.setProperty('--auralis-dark-on-accent', resolution.value.onAccent)
}

function persistDarkAccent(): void {
  try {
    localStorage.setItem(DARK_ACCENT_STORAGE_KEY, darkAccent.value)
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: DARK_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Could not save dark accent preference; keeping it for this session',
      cause,
    })
  }
}

function setDarkAccent(value: unknown, persistWhenUnchanged = false): boolean {
  const normalized = normalizeDarkAccent(value)
  if (!normalized) {
    rendererDiagnostics.warn({
      scope: DARK_ACCENT_DIAGNOSTIC_SCOPE,
      message: 'Ignored an invalid dark accent update',
    })
    return false
  }

  const changed = darkAccent.value !== normalized
  if (changed) darkAccent.value = normalized
  applyDarkAccent()
  if (changed || persistFailed.value || persistWhenUnchanged) persistDarkAccent()
  return true
}

function resetDarkAccent(): void {
  setDarkAccent(DEFAULT_DARK_ACCENT, true)
}

function initDarkAccent(): void {
  applyDarkAccent()
}

export function useDarkAccent() {
  return {
    darkAccent: readonly(darkAccent),
    resolution,
    persistFailed: readonly(persistFailed),
    initDarkAccent,
    setDarkAccent,
    resetDarkAccent,
  }
}
