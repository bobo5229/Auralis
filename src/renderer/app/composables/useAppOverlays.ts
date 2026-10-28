import { computed, ref, watch, type Ref } from 'vue'
import { provideTrackEditor } from '@renderer/features/trackEditor/trackEditor'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import {
  usePlayerDisplayMode,
  type PlayerDisplayMode,
} from '@renderer/features/playback/composables/usePlayerDisplayMode'
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
  const trackEditor = provideTrackEditor(() => closeSettings())
  const isTrackEditorOpen = computed(() => trackEditor.request.value !== null)
  const trackEditorRef = ref<{ requestClose(): void } | null>(null)

  function openLyricsEditPanel(trigger: HTMLElement | null): void {
    const { currentTrackId: trackId, currentTrack } = usePlayback().state
    if (trackId !== null)
      trackEditor.open({
        trackId,
        initialTab: 'lyrics',
        artworkCacheKey: currentTrack?.id === trackId ? currentTrack.artworkCacheKey : null,
        returnFocusTo: trigger,
      })
  }

  function requestCloseTrackEditor(): void {
    if (isTrackEditorOpen.value) trackEditorRef.value?.requestClose()
  }

  const pageParameters = createPageParameters(
    computed(() => route.name),
    computed(
      () =>
        isSettingsOpen.value ||
        isTrackEditorOpen.value ||
        displayMode.value === 'fullscreen' ||
        startupAlbumActive.value,
    ),
  )
  providePageParameters(pageParameters)

  watch(
    () => route.fullPath,
    () => {
      closeSettings()
      requestCloseTrackEditor()
    },
    { flush: 'sync' },
  )
  watch(
    isSettingsOpen,
    (open) => {
      if (open && isTrackEditorOpen.value) {
        closeSettings()
        requestCloseTrackEditor()
      }
    },
    { flush: 'sync' },
  )
  watch(
    displayMode,
    (mode) => {
      if (mode === 'fullscreen') {
        closeSettings()
        if (isTrackEditorOpen.value) {
          // Resolve the modal before allowing another surface to take its focus.
          usePlayerDisplayMode().showNormalPlayer()
          requestCloseTrackEditor()
        }
      }
    },
    { flush: 'sync' },
  )

  return {
    isSettingsOpen,
    isTrackEditorOpen,
    trackEditorRef,
    trackEditorRequest: trackEditor.request,
    closeTrackEditor: trackEditor.close,
    openLyricsEditPanel,
    pageParameters,
  }
}
