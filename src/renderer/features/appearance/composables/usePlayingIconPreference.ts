import { readonly, ref } from 'vue'
import {
  PLAYING_INDICATOR_PRESETS,
  type PlayingIndicatorPreset,
} from '@renderer/shared/components/playingIndicatorTypes'

export const PLAYING_ICON_PRESET_KEY = 'auralis-playing-icon-preset'

export const PLAYING_ICON_PRESETS = PLAYING_INDICATOR_PRESETS
export type PlayingIconPreset = PlayingIndicatorPreset

function parsePreset(value: string | null): PlayingIconPreset {
  return PLAYING_ICON_PRESETS.find((preset) => preset === value) ?? 'equalizer'
}

function readPreset(): PlayingIconPreset {
  try {
    return parsePreset(localStorage.getItem(PLAYING_ICON_PRESET_KEY))
  } catch {
    return 'equalizer'
  }
}

const preset = ref<PlayingIconPreset>(readPreset())

export function getPlayingIconPreset(): PlayingIconPreset {
  return preset.value
}

export function setPlayingIconPreset(value: PlayingIconPreset): void {
  if (value === preset.value) return
  preset.value = value
  try {
    localStorage.setItem(PLAYING_ICON_PRESET_KEY, value)
  } catch {
    // 忽略在无法使用 localStorage 环境下的持久化错误
  }
}

export function usePlayingIconPreference() {
  return {
    playingIcon: readonly(preset),
    setPlayingIcon: setPlayingIconPreset,
  }
}
