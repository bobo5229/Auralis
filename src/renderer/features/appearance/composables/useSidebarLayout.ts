import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-sidebar-full-height'

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not read sidebar layout preference',
      cause,
    })
    return true
  }
}

const sidebarFullHeight = ref(readPersisted())

function setSidebarFullHeight(enabled: boolean): void {
  sidebarFullHeight.value = enabled
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not save sidebar layout preference; keeping it for this session',
      cause,
    })
  }
}

export function useSidebarLayout() {
  return { sidebarFullHeight: readonly(sidebarFullHeight), setSidebarFullHeight }
}
