import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS,
  FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
  FULLSCREEN_INFO_TYPOGRAPHY_FIELDS,
  FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY,
  fullscreenInfoTypographyCssVars,
  isFullscreenInfoFontWeight,
  isFullscreenInfoTypographyFieldValue,
  parseStoredFullscreenInfoTypography,
  serializeFullscreenInfoTypography,
  type FullscreenInfoTypography,
  type FullscreenInfoTypographyStyle,
} from '../constants/fullscreenInfoTypography'

const preference = ref<FullscreenInfoTypography>(readInitial())
const persistFailed = ref(false)
const style = computed<FullscreenInfoTypographyStyle>(() =>
  fullscreenInfoTypographyCssVars(preference.value),
)

function readInitial(): FullscreenInfoTypography {
  let raw: string | null
  try {
    raw = localStorage.getItem(FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY)
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message: 'Could not read fullscreen info typography preference',
      cause,
    })
    return { ...FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS }
  }

  const parsed = parseStoredFullscreenInfoTypography(raw)
  if (parsed.issues.length > 0) {
    rendererDiagnostics.warn({
      scope: FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message: parsed.retainStorage
        ? 'Ignored unusable fullscreen info typography preference'
        : 'Ignored invalid fullscreen info typography fields',
      context: { issues: parsed.issues },
    })
  }
  return parsed.preference
}

function persist(): void {
  try {
    localStorage.setItem(
      FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY,
      serializeFullscreenInfoTypography(preference.value),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message: 'Could not save fullscreen info typography preference; keeping it for this session',
      cause,
    })
  }
}

function applyField(
  next: FullscreenInfoTypography,
  field: keyof FullscreenInfoTypography,
  value: unknown,
): boolean {
  if (!isFullscreenInfoTypographyFieldValue(field, value)) return false
  if (field === 'titleFontWeight' || field === 'subtitleFontWeight') {
    if (!isFullscreenInfoFontWeight(value)) return false
    next[field] = value
    return true
  }
  if (typeof value !== 'number') return false
  next[field] = value
  return true
}

function setPreference(patch: Partial<FullscreenInfoTypography>): void {
  const next = { ...preference.value }
  let hasValidField = false
  for (const field of FULLSCREEN_INFO_TYPOGRAPHY_FIELDS) {
    const value = patch[field]
    if (value === undefined) continue
    if (!applyField(next, field, value)) {
      rendererDiagnostics.warn({
        scope: FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
        message: 'Ignored invalid fullscreen info typography update',
        context: { field, value },
      })
      continue
    }
    hasValidField = true
  }

  if (!hasValidField) return
  const unchanged = FULLSCREEN_INFO_TYPOGRAPHY_FIELDS.every(
    (field) => next[field] === preference.value[field],
  )
  if (unchanged && !persistFailed.value) return
  preference.value = next
  persist()
}

function resetPreference(): void {
  preference.value = { ...FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS }
  // Always write on reset so invalid old payloads are repaired and failed saves can be retried.
  persist()
}

export function useFullscreenInfoTypography() {
  return {
    preference: readonly(preference),
    style,
    persistFailed: readonly(persistFailed),
    setPreference,
    resetPreference,
  }
}
