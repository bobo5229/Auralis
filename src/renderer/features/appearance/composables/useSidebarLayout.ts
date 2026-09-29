import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-sidebar-full-height'
const COLLAPSED_STORAGE_KEY = 'auralis-sidebar-collapsed'

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

function readPersistedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not read sidebar collapsed preference',
      cause,
    })
    return false
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

/** 收起态独立于全高/悬浮布局持久化；仅在全高布局下应用为图标栏。 */
const sidebarCollapsed = ref(readPersistedCollapsed())

function setSidebarCollapsed(collapsed: boolean): void {
  sidebarCollapsed.value = collapsed
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not save sidebar collapsed preference; keeping it for this session',
      cause,
    })
  }
}

export function useSidebarLayout() {
  return {
    sidebarFullHeight: readonly(sidebarFullHeight),
    setSidebarFullHeight,
    sidebarCollapsed: readonly(sidebarCollapsed),
    setSidebarCollapsed,
  }
}
