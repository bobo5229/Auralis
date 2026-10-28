import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
  type Ref,
} from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import { useElementSize } from '@vueuse/core'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import type { PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import type { PageParameters } from '@renderer/features/appearance/composables/usePageParameters'
import { useLyricsPanelVisibility } from '@renderer/features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelMode } from '@renderer/features/appearance/composables/useLyricsPanelMode'
import {
  useLyricsPanelWidth,
  clampLyricsPanelWidth,
  LYRICS_PANEL_WIDTH,
} from '@renderer/features/appearance/composables/useLyricsPanelWidth'
import {
  useSidebarLayout,
  clampSidebarWidth,
} from '@renderer/features/appearance/composables/useSidebarLayout'
import { useLyricsPanelLayout, computeLyricsTargetWidth } from '../layout/useLyricsPanelLayout'
import type { AlbumLayoutTransitionParticipant } from '@renderer/shared/animation/albumLayoutTransition'
import { createAppLyricsLayoutTransition } from '../layout/createAppLyricsLayoutTransition'
import { usePanelResize } from './usePanelResize'
import { useAppRouteTransitions } from './useAppRouteTransitions'

interface AppShellLayoutOptions {
  route: RouteLocationNormalizedLoaded
  router: Router
  shellRef: Ref<HTMLElement | null>
  mainRef: Ref<HTMLElement | null>
  displayMode: Readonly<Ref<PlayerDisplayMode>>
  isSettingsOpen: Readonly<Ref<boolean>>
  isTrackEditorOpen: Readonly<Ref<boolean>>
  startupAlbumActive: Readonly<Ref<boolean>>
  pageParameters: PageParameters
  prepareForDisplay(): Promise<void> | undefined
  syncCdViewSwitch(): void
}

export function useAppShellLayout({
  route,
  router,
  shellRef,
  mainRef,
  displayMode,
  isSettingsOpen,
  isTrackEditorOpen,
  startupAlbumActive,
  pageParameters,
  prepareForDisplay,
  syncCdViewSwitch,
}: AppShellLayoutOptions) {
  const { lyricsPanelExpanded } = useLyricsPanelVisibility()
  const { mode: lyricsPanelMode } = useLyricsPanelMode()
  const { lyricsPanelWidth, setLyricsPanelWidth } = useLyricsPanelWidth()
  const isFloatingLyrics = computed(() => lyricsPanelMode.value === 'floating')
  const { canLayoutLyricsPanel } = useLyricsPanelLayout()

  const { width: shellWidth } = useElementSize(shellRef, {
    width: computeLyricsTargetWidth() * 5,
    height: 0,
  })
  const isSidebarResizing = ref(false)
  const isLyricsWidthResizing = ref(false)

  // Avoid a body :has() dependency: archive motion inserts transient nodes, which
  // would otherwise invalidate the inherited cursor styles across the whole page.
  watch(
    [isSidebarResizing, isLyricsWidthResizing],
    ([sidebar, lyrics]) => document.body.classList.toggle('is-column-resizing', sidebar || lyrics),
    { flush: 'sync' },
  )

  function onSidebarResizeActiveChange(active: boolean): void {
    // Resolve the last width while transitions are disabled, including keyboard changes.
    if (!active && isSidebarResizing.value) shellRef.value?.getBoundingClientRect()
    isSidebarResizing.value = active
  }

  function onLyricsWidthResizeActiveChange(active: boolean): void {
    if (!active && isLyricsWidthResizing.value) shellRef.value?.getBoundingClientRect()
    isLyricsWidthResizing.value = active
  }
  const initialLyricsActive = canLayoutLyricsPanel.value && lyricsPanelExpanded.value
  const lyricsProgress = ref(initialLyricsActive ? 1 : 0)
  const shouldMountLyrics = ref(initialLyricsActive)
  const isLyricsCollapsed = ref(!initialLyricsActive)
  const isLyricsInteractive = ref(initialLyricsActive)
  const lyricsTargetWidthPx = computed(() =>
    clampLyricsPanelWidth(
      lyricsPanelWidth.value || computeLyricsTargetWidth(shellWidth.value),
      maxLyricsPanelWidth.value,
    ),
  )
  const isLyricsResizing = ref(false)
  const isAlbumLayoutTransitioning = ref(false)
  const activeAlbumsPage = ref<AlbumLayoutTransitionParticipant | null>(null)
  const isAlbumDetail = computed(() => {
    return route.name === 'album-detail'
  })

  const isCdCanvas = computed(() => {
    return route.name === 'cd-albums' || route.name === 'cd-album-index'
  })

  const { sidebarFullHeight, sidebarCollapsed, sidebarWidth } = useSidebarLayout()
  const MAIN_CONTENT_MIN_WIDTH_PX = 480
  // Keep at least 480px for content and reserve the lyrics area in either lyrics mode.
  const maxSidebarWidth = computed(() =>
    clampSidebarWidth(
      shellWidth.value -
        (canLayoutLyricsPanel.value ? lyricsTargetWidthPx.value * lyricsProgress.value : 0) -
        MAIN_CONTENT_MIN_WIDTH_PX,
    ),
  )
  /** 全高布局下的收起图标栏；驱动 Shell 列宽、播放栏左边界与背景裁切。 */
  const isSidebarRail = computed(
    () => sidebarFullHeight.value && sidebarCollapsed.value && !isCdCanvas.value,
  )
  const renderedSidebarRail = ref(isSidebarRail.value)

  // Use the preferred sidebar width, rather than its lyrics-dependent constrained width,
  // so the two panels' maximum widths never form a reactive feedback loop.
  const maxLyricsPanelWidth = computed(() => {
    const sidebarSpace = renderedSidebarRail.value
      ? Number.parseFloat(
          shellRef.value
            ? getComputedStyle(shellRef.value).getPropertyValue('--auralis-sidebar-rail-width')
            : '',
        ) || 60
      : sidebarWidth.value
    return clampLyricsPanelWidth(shellWidth.value - sidebarSpace - MAIN_CONTENT_MIN_WIDTH_PX)
  })

  let reducedMotionMedia: MotionQuery | null = null
  const transition = createAppLyricsLayoutTransition({
    state: {
      lyricsProgress,
      shouldMountLyrics,
      isLyricsCollapsed,
      isLyricsInteractive,
      isLyricsResizing,
      isAlbumLayoutTransitioning,
      renderedSidebarRail,
    },
    shellRef,
    activeAlbumsPage,
    canLayoutLyricsPanel,
    isFloatingLyrics,
    canAnimateAlbums: computed(() => route.name === 'albums' && displayMode.value === 'normal'),
    isReducedMotion: () => reducedMotionMedia?.matches ?? false,
    prepareForDisplay,
  })
  const {
    applyImmediateState,
    expandWithAnimation,
    collapseWithAnimation,
    settleAlbumLyricsTransition,
    usesAlbumLayoutTransition,
    runAlbumLyricsTransition,
  } = transition
  function setActiveAlbumsPage(instance: unknown): void {
    activeAlbumsPage.value =
      instance && typeof instance === 'object'
        ? (instance as AlbumLayoutTransitionParticipant)
        : null
  }
  watch(lyricsPanelExpanded, (expanded) => {
    if (!canLayoutLyricsPanel.value) {
      applyImmediateState(false)
      return
    }
    if (expanded) {
      void expandWithAnimation()
    } else {
      collapseWithAnimation()
    }
  })

  watch(canLayoutLyricsPanel, (canDisplay) => {
    applyImmediateState(canDisplay && lyricsPanelExpanded.value)
  })

  watch(
    lyricsPanelMode,
    () => {
      // Settle any pending column animation before switching between reserved and overlay space.
      applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
      isLyricsResizing.value = true
      void nextTick(() => {
        if (!transition.isGenericTransitioning && !transition.hasAlbumTransition) {
          isLyricsResizing.value = false
        }
      })
    },
    { flush: 'sync' },
  )

  function settleLyricsLayoutForResize(): void {
    if (transition.isGenericTransitioning) {
      applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
    }
    if (transition.hasAlbumTransition) void settleAlbumLyricsTransition()
  }

  function handleReducedMotionChange(): void {
    if (reducedMotionMedia?.matches && transition.hasAlbumTransition) {
      void settleAlbumLyricsTransition()
    } else if (reducedMotionMedia?.matches && transition.isGenericTransitioning) {
      applyImmediateState(lyricsPanelExpanded.value && canLayoutLyricsPanel.value)
    }
  }

  const shellStyle = computed<CSSProperties>(() => ({
    '--auralis-sidebar-expanded-width': `${Math.min(sidebarWidth.value, maxSidebarWidth.value)}px`,
    '--auralis-lyrics-progress': String(lyricsProgress.value),
    '--auralis-lyrics-target-width': `${lyricsTargetWidthPx.value}px`,
    '--auralis-lyrics-column-width': isFloatingLyrics.value
      ? '0px'
      : `${lyricsTargetWidthPx.value * lyricsProgress.value}px`,
    '--auralis-player-lyrics-inset': `${lyricsTargetWidthPx.value * lyricsProgress.value}px`,
  }))

  const routeTransitions = useAppRouteTransitions({
    route,
    router,
    mainRef,
    syncCdViewSwitch,
    beforeNavigate: () => {
      if (transition.isGenericTransitioning)
        applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
    },
  })
  const {
    cdIndexSlideDirection,
    isAlbumDetailEntering,
    isAlbumRouteTransitioning,
    albumDetailTransitionHooks,
    transitionName,
    onTransitionBeforeEnter,
    onTransitionEnter,
    onTransitionBeforeLeave,
    restoreLeavingInteractivity,
    onTransitionAfterEnter,
    onTransitionEnterCancelled,
  } = routeTransitions
  onMounted(() => {
    reducedMotionMedia = createReducedMotionQuery()
    reducedMotionMedia.addEventListener('change', handleReducedMotionChange)
    window.addEventListener('resize', settleLyricsLayoutForResize)
    settleLyricsLayoutForResize()
  })

  onBeforeUnmount(() => {
    document.body.classList.remove('is-column-resizing')
    routeTransitions.dispose()
    transition.dispose()
    reducedMotionMedia?.removeEventListener('change', handleReducedMotionChange)
    window.removeEventListener('resize', settleLyricsLayoutForResize)
  })

  const lyricsWidthResizeDisabled = computed(
    () =>
      !canLayoutLyricsPanel.value ||
      !lyricsPanelExpanded.value ||
      !shouldMountLyrics.value ||
      !isLyricsInteractive.value ||
      displayMode.value !== 'normal' ||
      isLyricsResizing.value ||
      isAlbumRouteTransitioning.value ||
      isSidebarResizing.value ||
      isSettingsOpen.value ||
      isTrackEditorOpen.value ||
      pageParameters.open.value ||
      startupAlbumActive.value,
  )
  const {
    isResizing: isLyricsWidthDragging,
    onPointerDown: onLyricsWidthPointerDown,
    onKeyDown: onLyricsWidthKeyDown,
    resetWidth: resetLyricsWidth,
    cancel: cancelLyricsWidthResize,
  } = usePanelResize({
    preferredWidth: lyricsPanelWidth,
    width: lyricsTargetWidthPx,
    minWidth: LYRICS_PANEL_WIDTH.min,
    maxWidth: maxLyricsPanelWidth,
    direction: -1,
    disabled: lyricsWidthResizeDisabled,
    setWidth: setLyricsPanelWidth,
    resetPreference: () => setLyricsPanelWidth(0),
    onActiveChange: onLyricsWidthResizeActiveChange,
  })

  watch(
    [() => route.fullPath, lyricsPanelMode, sidebarFullHeight, sidebarCollapsed],
    cancelLyricsWidthResize,
    { flush: 'sync' },
  )

  watch(isSidebarRail, (rail) => {
    if (transition.isGenericTransitioning) {
      applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
    }
    if (sidebarFullHeight.value && !reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
      void runAlbumLyricsTransition(canLayoutLyricsPanel.value && lyricsPanelExpanded.value, rail)
    } else {
      if (transition.hasAlbumTransition) void settleAlbumLyricsTransition()
      renderedSidebarRail.value = rail
    }
  })

  watch(sidebarFullHeight, (fullHeight) => {
    if (!fullHeight && transition.hasAlbumTransition) void settleAlbumLyricsTransition()
  })

  watch(
    () => route.name,
    (name) => {
      if (name !== 'albums' && transition.hasAlbumTransition) void settleAlbumLyricsTransition()
    },
  )

  watch(displayMode, (mode) => {
    if (mode !== 'normal' && transition.isGenericTransitioning) {
      applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
    }
    if (mode !== 'normal' && transition.hasAlbumTransition) void settleAlbumLyricsTransition()
  })

  return {
    shellStyle,
    isAlbumDetail,
    isCdCanvas,
    sidebarFullHeight,
    renderedSidebarRail,
    isFloatingLyrics,
    isLyricsCollapsed,
    isLyricsResizing,
    isSidebarResizing,
    isLyricsWidthResizing,
    isAlbumLayoutTransitioning,
    maxSidebarWidth,
    onSidebarResizeActiveChange,
    setActiveAlbumsPage,
    settleAlbumLyricsTransition,
    shouldMountLyrics,
    isLyricsInteractive,
    lyricsTargetWidthPx,
    maxLyricsPanelWidth,
    lyricsWidthResizeDisabled,
    isLyricsWidthDragging,
    onLyricsWidthPointerDown,
    onLyricsWidthKeyDown,
    resetLyricsWidth,
    cdIndexSlideDirection,
    isAlbumDetailEntering,
    isAlbumRouteTransitioning,
    albumDetailTransitionHooks,
    transitionName,
    onTransitionBeforeEnter,
    onTransitionEnter,
    onTransitionBeforeLeave,
    restoreLeavingInteractivity,
    onTransitionAfterEnter,
    onTransitionEnterCancelled,
  }
}
