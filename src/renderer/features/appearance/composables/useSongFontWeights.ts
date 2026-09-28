import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE,
  SONG_FONT_WEIGHT_STORAGE_KEY,
  emptySongFontWeightPreference,
  isSongCoverFontField,
  isSongFontWeightValue,
  isSongListFontField,
  parseStoredSongFontWeights,
  serializeSongFontWeights,
  songFontWeightCssVars,
  type SongFontWeightChoice,
  type SongFontWeightPreference,
  type SongFontWeightValue,
  type SongFontWeightView,
} from '../constants/songFontWeights'

const preference = ref<SongFontWeightPreference>(readInitial())
const persistFailed = ref(false)
const songFontWeightStyle = computed(() => songFontWeightCssVars(preference.value))

function readInitial(): SongFontWeightPreference {
  let raw: string | null
  try {
    raw = localStorage.getItem(SONG_FONT_WEIGHT_STORAGE_KEY)
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE,
      message: 'Could not read song font weight preference',
      cause,
    })
    return emptySongFontWeightPreference()
  }

  const parsed = parseStoredSongFontWeights(raw)
  if (parsed.issues.length > 0) {
    rendererDiagnostics.warn({
      scope: SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE,
      message: parsed.retainStorage
        ? 'Ignored unusable song font weight preference'
        : 'Ignored invalid song font weight entries',
      context: { issues: parsed.issues },
    })
  }
  // Keep the stored payload untouched until the next successful edit.
  return parsed.preference
}

function persist(): void {
  try {
    localStorage.setItem(SONG_FONT_WEIGHT_STORAGE_KEY, serializeSongFontWeights(preference.value))
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE,
      message: 'Could not save song font weight preference; keeping it for this session',
      cause,
    })
  }
}

function isSameChoice(
  current: SongFontWeightValue | undefined,
  choice: SongFontWeightChoice,
): boolean {
  return choice === 'default' ? current === undefined : current === choice
}

function warnRejected(message: string, view: SongFontWeightView, field: string): void {
  rendererDiagnostics.warn({
    scope: SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE,
    message,
    context: { view, field },
  })
}

function setSongFontWeight(
  view: SongFontWeightView,
  field: string,
  choice: SongFontWeightChoice,
): void {
  if (choice !== 'default' && !isSongFontWeightValue(choice)) {
    warnRejected('Ignored song font weight update with an invalid weight', view, field)
    return
  }

  if (view === 'list') {
    if (!isSongListFontField(field)) {
      warnRejected('Ignored song font weight update for an unknown field', view, field)
      return
    }
    if (isSameChoice(preference.value.list[field], choice)) {
      if (persistFailed.value) persist()
      return
    }
    const list = { ...preference.value.list }
    if (choice === 'default') delete list[field]
    else list[field] = choice
    preference.value = { list, cover: preference.value.cover }
    persist()
    return
  }

  if (!isSongCoverFontField(field)) {
    warnRejected('Ignored song font weight update for an unknown field', view, field)
    return
  }
  if (isSameChoice(preference.value.cover[field], choice)) {
    if (persistFailed.value) persist()
    return
  }
  const cover = { ...preference.value.cover }
  if (choice === 'default') delete cover[field]
  else cover[field] = choice
  preference.value = { list: preference.value.list, cover }
  persist()
}

function resetSongFontWeightView(view: SongFontWeightView): void {
  preference.value =
    view === 'list'
      ? { list: {}, cover: preference.value.cover }
      : { list: preference.value.list, cover: {} }
  persist()
}

function songFontWeightChoice(view: SongFontWeightView, field: string): SongFontWeightChoice {
  if (view === 'list' && isSongListFontField(field)) {
    return preference.value.list[field] ?? 'default'
  }
  if (view === 'cover' && isSongCoverFontField(field)) {
    return preference.value.cover[field] ?? 'default'
  }
  return 'default'
}

export function useSongFontWeights() {
  return {
    preference: readonly(preference),
    persistFailed: readonly(persistFailed),
    songFontWeightStyle,
    songFontWeightChoice,
    setSongFontWeight,
    resetSongFontWeightView,
  }
}
