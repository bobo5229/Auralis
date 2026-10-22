import { computed, ref, watch, type Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import {
  createPageParameters,
  providePageParameters,
} from '@renderer/features/appearance/composables/usePageParameters'

export function useAppOverlays(
  route: RouteLocationNormalizedLoaded,
  displayMode: Readonly<Ref<PlayerDisplayMode>>,
  startupAlbumActive: Readonly<Ref<boolean>>,
) {
  const { isSettingsOpen, closeSettings } = useSettingsDialog()
  const isLyricsEditOpen = ref(false)
  const lyricsEditPanelRef = ref<{ requestClose(): void } | null>(null)
  const lyricsEditReturnFocus = ref<HTMLElement | null>(null)

  function openLyricsEditPanel(trigger: HTMLElement | null): void {
    lyricsEditReturnFocus.value = trigger
    closeSettings()
    isLyricsEditOpen.value = true
  }

  function closeLyricsEditPanel(): void {
    if (isLyricsEditOpen.value) lyricsEditPanelRef.value?.requestClose()
  }

  const pageParameters = createPageParameters(
    computed(() => route.name),
    computed(
      () =>
        isSettingsOpen.value ||
        isLyricsEditOpen.value ||
        displayMode.value === 'fullscreen' ||
        startupAlbumActive.value,
    ),
  )
  providePageParameters(pageParameters)

  watch(
    () => route.fullPath,
    () => {
      closeSettings()
      closeLyricsEditPanel()
    },
    { flush: 'sync' },
  )
  watch(
    isSettingsOpen,
    (open) => {
      if (open && isLyricsEditOpen.value) {
        closeSettings()
        closeLyricsEditPanel()
      }
    },
    { flush: 'sync' },
  )
  watch(
    displayMode,
    (mode) => {
      if (mode === 'fullscreen') {
        closeSettings()
        closeLyricsEditPanel()
      }
    },
    { flush: 'sync' },
  )

  return {
    isSettingsOpen,
    isLyricsEditOpen,
    lyricsEditPanelRef,
    lyricsEditReturnFocus,
    openLyricsEditPanel,
    pageParameters,
  }
}
