import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export const LYRICS_PANEL_WIDTH_KEY = 'auralis-lyrics-panel-width'
export const LYRICS_PANEL_WIDTH = { min: 240, max: 640 } as const

export function clampLyricsPanelWidth(width: number, max: number = LYRICS_PANEL_WIDTH.max): number {
  return Math.round(Math.max(LYRICS_PANEL_WIDTH.min, Math.min(max, width)))
}

/** Zero selects automatic 20% sizing within the bounds; positive values are preferred pixels. */
function normalizePreference(value: number): number {
  return Number.isFinite(value) && value > 0 ? clampLyricsPanelWidth(value) : 0
}

function readWidth(): number {
  try {
    return normalizePreference(Number(localStorage.getItem(LYRICS_PANEL_WIDTH_KEY)))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.lyricsPanel',
      message: 'Could not read lyrics panel width preference',
      cause,
    })
    return 0
  }
}

const lyricsPanelWidth = ref(readWidth())

function setLyricsPanelWidth(width: number, persist = true): void {
  lyricsPanelWidth.value = normalizePreference(width)
  if (!persist) return
  try {
    localStorage.setItem(LYRICS_PANEL_WIDTH_KEY, String(lyricsPanelWidth.value))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.lyricsPanel',
      message: 'Could not save lyrics panel width preference; keeping it for this session',
      cause,
    })
  }
}

export function useLyricsPanelWidth() {
  return { lyricsPanelWidth: readonly(lyricsPanelWidth), setLyricsPanelWidth }
}
