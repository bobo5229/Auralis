import { computed, watch, type Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { type PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import {
  createPageParameters,
  providePageParameters,
} from '@renderer/features/appearance/composables/usePageParameters'

export function useAppOverlays(
  route: RouteLocationNormalizedLoaded,
  displayMode: Readonly<Ref<PlayerDisplayMode>>,
) {
  const { isSettingsOpen, closeSettings } = useSettingsDialog()
  const pageParameters = createPageParameters(
    computed(() => route.name),
    computed(() => isSettingsOpen.value || displayMode.value === 'fullscreen'),
  )
  providePageParameters(pageParameters)

  watch(
    () => route.fullPath,
    () => {
      closeSettings()
    },
    { flush: 'sync' },
  )
  watch(
    displayMode,
    (mode) => {
      if (mode === 'fullscreen') {
        closeSettings()
      }
    },
    { flush: 'sync' },
  )

  return {
    isSettingsOpen,
    pageParameters,
  }
}
