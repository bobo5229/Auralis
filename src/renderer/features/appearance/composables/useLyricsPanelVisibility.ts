import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-lyrics-panel-expanded'

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.lyricsPanel',
      message: 'Could not read lyrics panel layout preference',
      cause,
    })
    return true
  }
}

const lyricsPanelExpanded = ref(readPersisted())

function setLyricsPanelExpanded(expanded: boolean): void {
  lyricsPanelExpanded.value = expanded
  try {
    localStorage.setItem(STORAGE_KEY, String(expanded))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.lyricsPanel',
      message: 'Could not save lyrics panel layout preference; keeping it for this session',
      cause,
    })
  }
}

export function useLyricsPanelVisibility() {
  return {
    lyricsPanelExpanded: readonly(lyricsPanelExpanded),
    setLyricsPanelExpanded,
  }
}
