import { computed } from 'vue'
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH,
  useSidebarLayout,
} from '@renderer/features/appearance/composables/useSidebarLayout'
import { usePanelResize, type PanelResizeOptions } from './usePanelResize'

type SidebarResizeOptions = Pick<PanelResizeOptions, 'disabled' | 'maxWidth' | 'onActiveChange'>

export function useSidebarResize(options: SidebarResizeOptions) {
  const { sidebarWidth, setSidebarWidth } = useSidebarLayout()
  return usePanelResize({
    ...options,
    preferredWidth: sidebarWidth,
    width: computed(() => clampSidebarWidth(sidebarWidth.value, options.maxWidth.value)),
    minWidth: SIDEBAR_WIDTH.min,
    direction: 1,
    setWidth: setSidebarWidth,
    resetPreference: () =>
      setSidebarWidth(clampSidebarWidth(SIDEBAR_WIDTH.default, options.maxWidth.value)),
  })
}
