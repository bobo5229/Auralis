import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  SONG_FONT_SIZE_STORAGE_KEY,
  defaultSongFontSize,
  emptySongFontSizePreference,
  isSongFontSize,
  parseStoredSongFontSizes,
  songFontSizeCssVars,
} from '../constants/songFontSizes'
import type { SongFontWeightView } from '../constants/songFontWeights'

function readInitial() {
  try {
    return parseStoredSongFontSizes(localStorage.getItem(SONG_FONT_SIZE_STORAGE_KEY))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.song-font-size',
      message: 'Could not read song font sizes',
      cause,
    })
    return emptySongFontSizePreference()
  }
}

const preference = ref(readInitial())
const persistFailed = ref(false)
const songFontSizeStyle = computed(() => songFontSizeCssVars(preference.value))

function persist() {
  try {
    localStorage.setItem(
      SONG_FONT_SIZE_STORAGE_KEY,
      JSON.stringify({ version: 1, ...preference.value }),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: 'appearance.song-font-size',
      message: 'Could not save song font sizes; keeping them for this session',
      cause,
    })
  }
}

function songFontSize(view: SongFontWeightView, field: string): number {
  const overrides: Record<string, number | undefined> = preference.value[view]
  return overrides[field] ?? defaultSongFontSize(view, field) ?? 12
}

function setSongFontSize(view: SongFontWeightView, field: string, size: number) {
  if (!isSongFontSize(view, field, size)) return
  if (songFontSize(view, field) === size && !persistFailed.value) return
  const overrides = { ...preference.value[view] }
  if (size === defaultSongFontSize(view, field)) Reflect.deleteProperty(overrides, field)
  else Object.assign(overrides, { [field]: size })
  preference.value = { ...preference.value, [view]: overrides }
  persist()
}

function resetSongFontSizeView(view: SongFontWeightView) {
  preference.value = { ...preference.value, [view]: {} }
  persist()
}

export function useSongFontSizes() {
  return {
    preference: readonly(preference),
    persistFailed: readonly(persistFailed),
    songFontSizeStyle,
    songFontSize,
    setSongFontSize,
    resetSongFontSizeView,
  }
}
