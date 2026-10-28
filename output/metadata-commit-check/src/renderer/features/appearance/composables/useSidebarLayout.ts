import { readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const STORAGE_KEY = 'auralis-sidebar-full-height'
const COLLAPSED_STORAGE_KEY = 'auralis-sidebar-collapsed'
const WIDTH_STORAGE_KEY = 'auralis-sidebar-width'

/** 展开宽度对应 Shell 左列；悬浮卡片在列内保留原有外边距。 */
export const SIDEBAR_WIDTH = { default: 260, min: 240, max: 480 } as const

export function clampSidebarWidth(width: number, max: number = SIDEBAR_WIDTH.max): number {
  const finiteWidth = Number.isFinite(width) ? width : SIDEBAR_WIDTH.default
  return Math.round(Math.max(SIDEBAR_WIDTH.min, Math.min(max, finiteWidth)))
}

function readPersistedWidth(): number {
  try {
    const saved = localStorage.getItem(WIDTH_STORAGE_KEY)
    return saved?.trim() ? clampSidebarWidth(Number(saved)) : SIDEBAR_WIDTH.default
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not read sidebar width preference',
      cause,
    })
    return SIDEBAR_WIDTH.default
  }
}

const sidebarWidth = ref(readPersistedWidth())

/** 拖动期间只更新内存，结束后再持久化，避免每帧写入 localStorage。 */
function setSidebarWidth(width: number, persist = true): void {
  sidebarWidth.value = clampSidebarWidth(width)
  if (!persist) return
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(sidebarWidth.value))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.sidebar',
      message: 'Could not save sidebar width preference; keeping it for this session',
      cause,
    })
  }
}

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
    sidebarWidth: readonly(sidebarWidth),
    setSidebarWidth,
  }
}
