import { readonly, ref, type Ref } from 'vue'
import { formatDelimitedParts, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { convertChineseText, isChineseScript, type ChineseScript } from '../utils/chineseText'

export const SONG_INFO_SCRIPT_STORAGE_KEY = 'auralis-song-info-script'
export const LYRICS_SCRIPT_STORAGE_KEY = 'auralis-lyrics-script'

function createPreference(key: string) {
  let initial: ChineseScript = 'simplified'
  try {
    const stored = localStorage.getItem(key)
    if (isChineseScript(stored)) initial = stored
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.text',
      message: 'Could not read text script preference',
      cause,
    })
  }
  const value = ref<ChineseScript>(initial)
  const persistFailed = ref(false)
  function set(next: ChineseScript): void {
    if (!isChineseScript(next)) return
    if (next === value.value && !persistFailed.value) return
    value.value = next
    try {
      localStorage.setItem(key, next)
      persistFailed.value = false
    } catch (cause) {
      persistFailed.value = true
      rendererDiagnostics.warn({
        scope: 'appearance.text',
        message: 'Could not save text script preference; keeping it for this session',
        cause,
      })
    }
  }
  return { value, persistFailed, set }
}

const songInfo = createPreference(SONG_INFO_SCRIPT_STORAGE_KEY)
const lyrics = createPreference(LYRICS_SCRIPT_STORAGE_KEY)

function display(value: string | null | undefined, preference: Ref<ChineseScript>): string {
  return convertChineseText(value, preference.value)
}

export function useChineseTextDisplay() {
  const songText = (value: string | null | undefined) => display(value, songInfo.value)
  const songParts = (values: readonly string[]) => formatDelimitedParts(values.map(songText))
  return {
    songInfoScript: readonly(songInfo.value),
    lyricsScript: readonly(lyrics.value),
    songInfoPersistFailed: readonly(songInfo.persistFailed),
    lyricsPersistFailed: readonly(lyrics.persistFailed),
    setSongInfoScript: songInfo.set,
    setLyricsScript: lyrics.set,
    songText,
    songParts,
    songValues: (value: string | null | undefined) => songParts(splitDelimitedValues(value)),
    lyricText: (value: string | null | undefined) => display(value, lyrics.value),
  }
}
