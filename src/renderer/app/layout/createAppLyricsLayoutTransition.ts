import { nextTick, type Ref } from 'vue'
import {
  createLyricsAlbumTransitionCoordinator,
  type AlbumLayoutTransitionParticipant,
  type LyricsAlbumTransitionTicket,
} from './lyricsAlbumTransitionCoordinator'
import { createSidebarLayoutTransition } from './sidebarLayoutTransition'
import { createPlayerBarLayoutTransition } from './createPlayerBarLayoutTransition'
import {
  animateLyricsPanelSlide,
  animateLyricsPlayerTranslation,
  getLyricsSlideDuration,
} from './lyricsPanelSlideMotion'
import { MODERN_PLAYER_BAR_MAX_WIDTH_PX } from '@renderer/features/playback/utils/modernPlayerBarLayout'
import { ALBUM_GRID_REFLOW_DURATION_MS } from '@renderer/features/albums/utils/albumGridReflowMotion'

export interface AppLyricsLayoutState {
  lyricsProgress: Ref<number>
  shouldMountLyrics: Ref<boolean>
  isLyricsCollapsed: Ref<boolean>
  isLyricsInteractive: Ref<boolean>
  isLyricsResizing: Ref<boolean>
  isAlbumLayoutTransitioning: Ref<boolean>
  renderedSidebarRail: Ref<boolean>
}
interface AppLyricsLayoutTransitionOptions {
  state: AppLyricsLayoutState
  shellRef: Ref<HTMLElement | null>
  activeAlbumsPage: Ref<AlbumLayoutTransitionParticipant | null>
  canLayoutLyricsPanel: Readonly<Ref<boolean>>
  isFloatingLyrics: Readonly<Ref<boolean>>
  canAnimateAlbums: Readonly<Ref<boolean>>
  isReducedMotion(): boolean
  prepareForDisplay(): Promise<void> | undefined
}

export function createAppLyricsLayoutTransition({
  state,
  shellRef,
  activeAlbumsPage,
  canLayoutLyricsPanel,
  isFloatingLyrics,
  canAnimateAlbums,
  isReducedMotion,
  prepareForDisplay,
}: AppLyricsLayoutTransitionOptions) {
  const {
    lyricsProgress,
    shouldMountLyrics,
    isLyricsCollapsed,
    isLyricsInteractive,
    isLyricsResizing,
    isAlbumLayoutTransitioning,
    renderedSidebarRail,
  } = state
  const initialLyricsActive = shouldMountLyrics.value
  const playerBar = createPlayerBarLayoutTransition(shellRef)
  const lyricsAlbumTransition = createLyricsAlbumTransitionCoordinator()
  const sidebarLayoutTransition = createSidebarLayoutTransition()
  let activeAlbumTransitionTicket: LyricsAlbumTransitionTicket | null = null
  let stopAlbumTransitionAnimation: (() => void) | null = null
  let lyricsVisualProgress = initialLyricsActive ? 1 : 0
  let lyricsPanelTravelPx = 0
  let activeLyricsPanel: HTMLElement | null = null
  let activeLyricsContent: HTMLElement | null = null
  let stopLyricsAnimation: (() => void) | null = null
  let genericLyricsTransitionRevision = 0
  let isGenericLyricsTransitioning = false
  let activeAlbumParticipant: AlbumLayoutTransitionParticipant | null = null
  function clearPlayerBarTransition(): void {
    playerBar.clear()
    activeLyricsPanel = null
    activeLyricsContent = null
  }
  function beginLyricsResize(): void {
    isLyricsResizing.value = true
  }

  function cancelLyricsAnimation(): void {
    genericLyricsTransitionRevision += 1
    stopLyricsAnimation?.()
    stopLyricsAnimation = null
  }

  function positionLyricsPanel(panel: HTMLElement, rect: DOMRect): void {
    // Floating lyrics stay in the main grid area, which already provides their bounds.
    if (isFloatingLyrics.value) return
    const shellRect = shellRef.value?.getBoundingClientRect()
    if (!shellRect) return
    Object.assign(panel.style, {
      position: 'absolute',
      right: 'auto',
      bottom: 'auto',
      left: `${rect.left - shellRect.left}px`,
      top: `${rect.top - shellRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '24',
      transformOrigin: 'left center',
    })
  }

  function resetLyricsPanelPosition(panel: HTMLElement | null): void {
    if (!panel) return
    for (const property of [
      'position',
      'right',
      'bottom',
      'left',
      'top',
      'width',
      'height',
      'z-index',
      'transform-origin',
      'transform',
      'opacity',
      'visibility',
      'will-change',
    ]) {
      panel.style.removeProperty(property)
    }
    panel.querySelector<HTMLElement>('.now-playing-panel-content')?.style.removeProperty('opacity')
  }

  function setLyricsVisualProgress(progress: number): void {
    lyricsVisualProgress = Math.max(0, Math.min(1, progress))
    const panel = activeLyricsPanel
    if (panel) {
      panel.style.opacity = String(lyricsVisualProgress)
    }
  }

  function onTransitionPointerDown(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Element && target.closest('[data-lyrics-toggle], [data-sidebar-toggle]'))
      return
    const button = target instanceof Element ? target.closest('button') : null
    if (button && playerBar.activeIsland?.contains(button)) {
      // Keep pointerup/click on the pressed control while the live island moves.
      button.setPointerCapture(event.pointerId)
      return
    }
    void settleAlbumLyricsTransition()
  }

  function onTransitionClick(event: MouseEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-lyrics-toggle], [data-sidebar-toggle]')
    )
      return
    // Bubble after the control has handled its click, before clearing its transform.
    void settleAlbumLyricsTransition()
  }

  function removeTransitionPointerListener(): void {
    document.removeEventListener('pointerdown', onTransitionPointerDown, true)
    document.removeEventListener('click', onTransitionClick)
  }

  function usesAlbumLayoutTransition(): boolean {
    return canAnimateAlbums.value && activeAlbumsPage.value !== null
  }

  function setLyricsTargetState(expanded: boolean): void {
    lyricsProgress.value = expanded ? 1 : 0
    lyricsVisualProgress = expanded ? 1 : 0
    if (expanded) {
      shouldMountLyrics.value = true
      isLyricsCollapsed.value = false
      isLyricsInteractive.value = true
    } else {
      shouldMountLyrics.value = false
      isLyricsCollapsed.value = true
      isLyricsInteractive.value = false
    }
  }

  async function finishAlbumLyricsTransition(ticket: LyricsAlbumTransitionTicket): Promise<void> {
    if (!lyricsAlbumTransition.isCurrent(ticket)) return
    stopAlbumTransitionAnimation = null
    cancelLyricsAnimation()
    const expanded = ticket.to >= 0.5
    const panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
    setLyricsVisualProgress(ticket.to)
    setLyricsTargetState(expanded)
    sidebarLayoutTransition.clear()
    clearPlayerBarTransition()
    removeTransitionPointerListener()
    resetLyricsPanelPosition(panel)
    const participant = activeAlbumParticipant
    if (participant) await participant.finishLyricsLayoutTransition(ticket.revision)
    if (!lyricsAlbumTransition.complete(ticket)) return
    activeAlbumTransitionTicket = null
    activeAlbumParticipant = null
    isAlbumLayoutTransitioning.value = false
    isLyricsResizing.value = false
    isGenericLyricsTransitioning = false
    stopLyricsAnimation = null
  }

  async function runAlbumLyricsTransition(expanded: boolean, sidebarRail?: boolean): Promise<void> {
    const participant = activeAlbumsPage.value
    if (!participant || !usesAlbumLayoutTransition()) return
    // Read the painted position before cancelling compositor animations on reversal.
    const previousPanel = activeLyricsPanel
    const previousPanelRect = previousPanel?.getBoundingClientRect()
    const previousStyle = previousPanel ? getComputedStyle(previousPanel) : null
    const previousTranslation = previousStyle
      ? new DOMMatrixReadOnly(previousStyle.transform).m41
      : 0
    const from =
      previousPanelRect && previousPanelRect.width > 0
        ? Math.max(0, Math.min(1, 1 - previousTranslation / previousPanelRect.width))
        : lyricsVisualProgress
    const fromOpacity = previousStyle
      ? Number(previousStyle.opacity)
      : shouldMountLyrics.value
        ? 1
        : 0
    const startingIslandRect = playerBar.getIsland()?.getBoundingClientRect() ?? null
    stopAlbumTransitionAnimation?.()
    stopAlbumTransitionAnimation = null
    cancelLyricsAnimation()

    const to = expanded ? 1 : 0
    const animatesSidebar = sidebarRail !== undefined || sidebarLayoutTransition.isActive()
    // Even zero-distance reversals must restore the target columns while the grid is locked.

    const ticket = lyricsAlbumTransition.begin(from, to)
    activeAlbumTransitionTicket = ticket
    activeAlbumParticipant = participant
    activeLyricsPanel = null
    activeLyricsContent = null
    isLyricsResizing.value = true
    isAlbumLayoutTransitioning.value = true
    const translatesPlayerBar =
      animatesSidebar ||
      (startingIslandRect !== null &&
        Math.abs(startingIslandRect.width - MODERN_PLAYER_BAR_MAX_WIDTH_PX) < 1)
    if (translatesPlayerBar) {
      // At the width cap, lyrics toggles only change the island's position; keep its live surface.
      clearPlayerBarTransition()
      playerBar.activeIsland = playerBar.getIsland()
    } else {
      playerBar.capture()
      playerBar.mount(startingIslandRect)
    }

    if (animatesSidebar) {
      const sidebar = shellRef.value?.querySelector<HTMLElement>('.app-sidebar')
      if (sidebar) sidebarLayoutTransition.prepare(sidebar)
    }

    let panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
    const paintedPanelRect = previousPanelRect ?? panel?.getBoundingClientRect()
    const startingPanelRect = paintedPanelRect
      ? new DOMRect(
          paintedPanelRect.left - previousTranslation,
          paintedPanelRect.top,
          paintedPanelRect.width,
          paintedPanelRect.height,
        )
      : undefined
    if (panel) {
      if (expanded) {
        resetLyricsPanelPosition(panel)
        panel.style.visibility = 'hidden'
      } else if (startingPanelRect && startingPanelRect.width > 0) {
        panel.style.visibility = 'hidden'
        panel.style.removeProperty('transform')
        positionLyricsPanel(panel, startingPanelRect)
      }
    }
    if (expanded) {
      shouldMountLyrics.value = true
      isLyricsCollapsed.value = false
      isLyricsInteractive.value = false
    } else {
      isLyricsInteractive.value = false
    }

    if (!participant.prepareLyricsLayoutTransition(ticket.revision)) {
      if (sidebarRail !== undefined) renderedSidebarRail.value = sidebarRail
      applyImmediateState(expanded)
      lyricsAlbumTransition.cancel()
      activeAlbumTransitionTicket = null
      activeAlbumParticipant = null
      isAlbumLayoutTransitioning.value = false
      return
    }
    document.addEventListener('pointerdown', onTransitionPointerDown, true)
    document.addEventListener('click', onTransitionClick)

    // Commit the shell's final column once, while AlbumsPage keeps its geometry locked.
    if (sidebarRail !== undefined) renderedSidebarRail.value = sidebarRail

    await nextTick()
    if (!lyricsAlbumTransition.isCurrent(ticket)) return
    panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
    if (panel) panel.style.visibility = 'hidden'
    lyricsProgress.value = to
    await nextTick()
    if (!lyricsAlbumTransition.isCurrent(ticket)) return

    const committed = await participant.commitLyricsLayoutTransition(ticket.revision)
    if (!committed || !lyricsAlbumTransition.isCurrent(ticket)) {
      if (lyricsAlbumTransition.isCurrent(ticket)) await settleAlbumLyricsTransition()
      return
    }
    if (animatesSidebar) sidebarLayoutTransition.commit()

    if (expanded) {
      await prepareForDisplay()
      if (!lyricsAlbumTransition.isCurrent(ticket)) return
    }

    panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
    const targetPanelRect = panel?.getBoundingClientRect()
    if (panel && targetPanelRect && targetPanelRect.width > 0) {
      activeLyricsPanel = panel
      activeLyricsContent = panel.querySelector<HTMLElement>('.now-playing-panel-content')
      panel.style.visibility = 'hidden'
      positionLyricsPanel(panel, targetPanelRect)
      lyricsPanelTravelPx = targetPanelRect.width
      panel.style.opacity = String(fromOpacity)
      panel.style.willChange = 'transform, opacity'
      activeLyricsContent?.style.setProperty('opacity', '1')
      panel.style.transform = `translate3d(${lyricsPanelTravelPx * (1 - from)}px, 0, 0)`
      panel.style.visibility = 'visible'
    }

    const targetIsland = playerBar.getIsland()
    if (targetIsland) {
      playerBar.activeIsland = targetIsland
      const targetRect = targetIsland.getBoundingClientRect()
      if (translatesPlayerBar) {
        playerBar.translationOffset = {
          x: startingIslandRect
            ? startingIslandRect.left +
              startingIslandRect.width / 2 -
              targetRect.left -
              targetRect.width / 2
            : 0,
          y: startingIslandRect ? startingIslandRect.top - targetRect.top : 0,
        }
      } else {
        playerBar.retarget(targetRect)
      }
    } else {
      playerBar.activeIsland = null
      clearPlayerBarTransition()
    }

    if (translatesPlayerBar && playerBar.translationOffset && playerBar.activeIsland)
      playerBar.activeIsland.style.transform = `translate3d(${playerBar.translationOffset.x}px, ${playerBar.translationOffset.y}px, 0)`
    lyricsVisualProgress = from
    // Keep the source still while the fixed surfaces receive their initial paint.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    if (!lyricsAlbumTransition.isCurrent(ticket)) return
    if (!lyricsAlbumTransition.start(ticket)) return

    const duration = ALBUM_GRID_REFLOW_DURATION_MS
    const slide = activeLyricsPanel
      ? animateLyricsPanelSlide(
          activeLyricsPanel,
          from,
          to,
          fromOpacity,
          lyricsPanelTravelPx,
          duration,
        )
      : null
    const playerMovement =
      playerBar.translationOffset && playerBar.activeIsland
        ? animateLyricsPlayerTranslation(
            playerBar.activeIsland,
            playerBar.translationOffset,
            duration,
          )
        : null
    const playerFades: Animation[] = []
    if (!translatesPlayerBar) {
      for (const layer of playerBar.layers) {
        const dx = Number(layer.dataset.transitionDx) || 0
        const dy = Number(layer.dataset.transitionDy) || 0
        playerFades.push(
          layer.animate(
            [
              {
                opacity: Number(layer.dataset.startOpacity) || 0,
                transform: 'translate3d(0, 0, 0)',
              },
              { opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0)` },
            ],
            { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
          ),
        )
      }
      if (playerBar.activeIsland)
        playerFades.push(
          playerBar.activeIsland.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration,
            fill: 'forwards',
          }),
        )
    }
    stopLyricsAnimation = () => {
      slide?.cancel()
      playerMovement?.cancel()
      playerFades.forEach((animation) => animation.cancel())
    }
    let cancelled = false
    stopAlbumTransitionAnimation = () => {
      cancelled = true
    }
    await Promise.all([
      participant.animateLyricsLayoutTransition(ticket.revision, duration),
      sidebarLayoutTransition.animate(duration),
      ...[slide?.movement, playerMovement, ...playerFades].flatMap((animation) =>
        animation ? [animation.finished.catch(() => undefined)] : [],
      ),
    ])
    if (!cancelled && lyricsAlbumTransition.isCurrent(ticket))
      await finishAlbumLyricsTransition(ticket)
  }

  async function settleAlbumLyricsTransition(): Promise<void> {
    const ticket = activeAlbumTransitionTicket
    if (!ticket) return
    stopAlbumTransitionAnimation?.()
    stopAlbumTransitionAnimation = null
    cancelLyricsAnimation()
    lyricsAlbumTransition.cancel()
    const participant = activeAlbumParticipant
    participant?.cancelLyricsLayoutTransition(ticket.revision)
    const expanded = ticket.to >= 0.5 && canLayoutLyricsPanel.value
    setLyricsTargetState(expanded)
    setLyricsVisualProgress(expanded ? 1 : 0)
    sidebarLayoutTransition.clear()
    resetLyricsPanelPosition(
      shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null,
    )
    clearPlayerBarTransition()
    removeTransitionPointerListener()
    activeAlbumTransitionTicket = null
    activeAlbumParticipant = null
    isAlbumLayoutTransitioning.value = false
    isLyricsResizing.value = false
    stopLyricsAnimation = null
  }

  function applyImmediateState(expanded: boolean): void {
    isGenericLyricsTransitioning = false
    const ticket = activeAlbumTransitionTicket
    if (ticket) {
      stopAlbumTransitionAnimation?.()
      stopAlbumTransitionAnimation = null
      lyricsAlbumTransition.cancel()
      activeAlbumParticipant?.cancelLyricsLayoutTransition(ticket.revision)
      activeAlbumTransitionTicket = null
      activeAlbumParticipant = null
    }
    sidebarLayoutTransition.clear()
    clearPlayerBarTransition()
    removeTransitionPointerListener()
    resetLyricsPanelPosition(
      shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null,
    )
    isAlbumLayoutTransitioning.value = false
    cancelLyricsAnimation()
    isLyricsResizing.value = false
    if (expanded) {
      lyricsProgress.value = 1
      shouldMountLyrics.value = true
      isLyricsCollapsed.value = false
      isLyricsInteractive.value = true
    } else {
      lyricsProgress.value = 0
      shouldMountLyrics.value = false
      isLyricsCollapsed.value = true
      isLyricsInteractive.value = false
    }
    setLyricsVisualProgress(expanded ? 1 : 0)
  }

  async function runGenericLyricsTransition(expanded: boolean): Promise<void> {
    const panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel')
    if (!panel) {
      applyImmediateState(expanded)
      return
    }
    // Capture the current painted position before cancelling a reversed animation.
    const panelStyle = getComputedStyle(panel)
    const from = isGenericLyricsTransitioning
      ? Math.max(
          0,
          Math.min(
            1,
            1 -
              new DOMMatrixReadOnly(panelStyle.transform).m41 / panel.getBoundingClientRect().width,
          ),
        )
      : lyricsVisualProgress
    const fromOpacity = shouldMountLyrics.value ? Number(panelStyle.opacity) : 0
    const startingIslandRect = playerBar.getIsland()?.getBoundingClientRect() ?? null
    cancelLyricsAnimation()
    const revision = genericLyricsTransitionRevision
    clearPlayerBarTransition()
    resetLyricsPanelPosition(panel)
    isGenericLyricsTransitioning = true
    beginLyricsResize()
    shouldMountLyrics.value = true
    isLyricsCollapsed.value = false
    isLyricsInteractive.value = false
    // Measure the full panel once; layout commits to the destination before motion starts.
    panel.style.visibility = 'hidden'
    lyricsProgress.value = 1
    await nextTick()
    if (revision !== genericLyricsTransitionRevision) return
    const rect = panel.getBoundingClientRect()
    positionLyricsPanel(panel, rect)
    const to = expanded ? 1 : 0
    const fromTransform = `translate3d(${rect.width * (1 - from)}px, 0, 0)`
    panel.style.transform = fromTransform
    panel.style.opacity = String(fromOpacity)
    panel.style.willChange = 'transform, opacity'
    panel
      .querySelector<HTMLElement>('.now-playing-panel-content')
      ?.style.setProperty('opacity', '1')
    lyricsProgress.value = to
    await nextTick()
    if (revision !== genericLyricsTransitionRevision) return
    if (expanded) {
      await prepareForDisplay()
      if (revision !== genericLyricsTransitionRevision) return
    }
    panel.style.removeProperty('visibility')
    const duration = getLyricsSlideDuration(from, to)
    const slide = animateLyricsPanelSlide(panel, from, to, fromOpacity, rect.width, duration)
    let playerMovement: Animation | null = null
    const island = playerBar.getIsland()
    if (island && startingIslandRect) {
      const targetRect = island.getBoundingClientRect()
      playerMovement = animateLyricsPlayerTranslation(
        island,
        {
          x: startingIslandRect.left - targetRect.left,
          y: startingIslandRect.top - targetRect.top,
        },
        duration,
      )
    }
    stopLyricsAnimation = () => {
      slide.cancel()
      playerMovement?.cancel()
    }
    slide.movement.onfinish = () => {
      if (revision !== genericLyricsTransitionRevision) return
      stopLyricsAnimation?.()
      stopLyricsAnimation = null
      isGenericLyricsTransitioning = false
      resetLyricsPanelPosition(panel)
      setLyricsTargetState(expanded)
      // The layout already reached its destination before the compositor animation.
      isLyricsResizing.value = false
    }
  }

  async function expandWithAnimation(): Promise<void> {
    if (!isFloatingLyrics.value && !isReducedMotion() && usesAlbumLayoutTransition()) {
      await runAlbumLyricsTransition(true)
      return
    }
    if (isReducedMotion()) {
      applyImmediateState(true)
      return
    }

    await runGenericLyricsTransition(true)
  }

  function collapseWithAnimation(): void {
    if (!isFloatingLyrics.value && !isReducedMotion() && usesAlbumLayoutTransition()) {
      void runAlbumLyricsTransition(false)
      return
    }
    if (isReducedMotion()) {
      applyImmediateState(false)
      return
    }

    void runGenericLyricsTransition(false)
  }
  function dispose(): void {
    void settleAlbumLyricsTransition()
    cancelLyricsAnimation()
    clearPlayerBarTransition()
    removeTransitionPointerListener()
  }
  return {
    get isGenericTransitioning() {
      return isGenericLyricsTransitioning
    },
    get hasAlbumTransition() {
      return activeAlbumTransitionTicket !== null
    },
    usesAlbumLayoutTransition,
    runAlbumLyricsTransition,
    settleAlbumLyricsTransition,
    applyImmediateState,
    expandWithAnimation,
    collapseWithAnimation,
    dispose,
  }
}
