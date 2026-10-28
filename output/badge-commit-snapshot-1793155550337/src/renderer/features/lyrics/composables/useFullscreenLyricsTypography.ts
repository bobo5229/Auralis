import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS,
  FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
  FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY,
  fullscreenLyricsTypographyCssVars,
  isFullscreenLyricsTypographyFieldValue,
  parseStoredFullscreenLyricsTypography,
  serializeFullscreenLyricsTypography,
  type FullscreenLyricsTypography,
  type FullscreenLyricsTypographyStyle,
} from '../constants/fullscreenLyricsTypography'

const preference = ref<FullscreenLyricsTypography>(readInitial())
const persistFailed = ref(false)
const style = computed<FullscreenLyricsTypographyStyle>(() =>
  fullscreenLyricsTypographyCssVars(preference.value),
)

function readInitial(): FullscreenLyricsTypography {
  let raw: string | null
  try {
    raw = localStorage.getItem(FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY)
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message: 'Could not read fullscreen lyrics typography preference',
      cause,
    })
    return { ...FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS }
  }

  const parsed = parseStoredFullscreenLyricsTypography(raw)
  if (parsed.issues.length > 0) {
    rendererDiagnostics.warn({
      scope: FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message: parsed.retainStorage
        ? 'Ignored unusable fullscreen lyrics typography preference'
        : 'Ignored invalid fullscreen lyrics typography fields',
      context: { issues: parsed.issues },
    })
  }
  return parsed.preference
}

function persist(): void {
  try {
    localStorage.setItem(
      FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY,
      serializeFullscreenLyricsTypography(preference.value),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
      message:
        'Could not save fullscreen lyrics typography preference; keeping it for this session',
      cause,
    })
  }
}

function setPreference(patch: Partial<FullscreenLyricsTypography>): void {
  const next = { ...preference.value }
  let hasValidField = false
  const applyField = (field: keyof FullscreenLyricsTypography, value: unknown): boolean => {
    if (value === undefined) return false
    if (!isFullscreenLyricsTypographyFieldValue(field, value)) {
      rendererDiagnostics.warn({
        scope: FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE,
        message: 'Ignored invalid fullscreen lyrics typography update',
        context: { field, value },
      })
      return false
    }
    if (field === 'fontSizePercent') next.fontSizePercent = value as number
    else if (field === 'fontWeight')
      next.fontWeight = value as FullscreenLyricsTypography['fontWeight']
    else next.lineGapPercent = value as number
    return true
  }

  hasValidField = applyField('fontSizePercent', patch.fontSizePercent) || hasValidField
  hasValidField = applyField('fontWeight', patch.fontWeight) || hasValidField
  hasValidField = applyField('lineGapPercent', patch.lineGapPercent) || hasValidField

  if (!hasValidField) return
  const unchanged =
    next.fontSizePercent === preference.value.fontSizePercent &&
    next.fontWeight === preference.value.fontWeight &&
    next.lineGapPercent === preference.value.lineGapPercent
  if (unchanged && !persistFailed.value) return
  preference.value = next
  persist()
}

function resetPreference(): void {
  preference.value = { ...FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS }
  // Always write on reset so invalid old payloads are repaired and failed saves can be retried.
  persist()
}

export function useFullscreenLyricsTypography() {
  return {
    preference: readonly(preference),
    style,
    persistFailed: readonly(persistFailed),
    setPreference,
    resetPreference,
  }
}
