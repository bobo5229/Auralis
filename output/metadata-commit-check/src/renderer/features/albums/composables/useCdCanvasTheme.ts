import { readonly, ref } from 'vue'

export type CdCanvasTheme = 'light' | 'dark'

const STORAGE_KEY = 'auralis-cd-canvas-theme'

function readPersisted(): CdCanvasTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const cdCanvasTheme = ref<CdCanvasTheme>(readPersisted())

function setCdCanvasTheme(theme: CdCanvasTheme): void {
  const next = theme === 'dark' ? 'dark' : 'light'
  if (cdCanvasTheme.value === next) return
  cdCanvasTheme.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Quota / private mode: keep in-memory preference for this session.
  }
}

/** CD browse canvas only. Does not change the app-wide dark-only theme. */
export function useCdCanvasTheme() {
  return {
    cdCanvasTheme: readonly(cdCanvasTheme),
    setCdCanvasTheme,
  }
}
