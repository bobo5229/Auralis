<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import './app/styles/cdCanvasTransition.css'
import { router } from './app/router'
import AppSidebar from './app/layout/AppSidebar.vue'
import WindowTrafficLights from './app/layout/WindowTrafficLights.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import SettingsDialog from '@renderer/features/settings/components/SettingsDialog.vue'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { MODERN_PLAYER_BAR_MAX_WIDTH_PX } from '@renderer/features/playback/utils/modernPlayerBarLayout'
import { useLyricsPanelVisibility } from '@renderer/features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelLayout, computeLyricsTargetWidth } from './app/layout/useLyricsPanelLayout'
import { animateProgress } from '@renderer/shared/animation/motion'
import {
  createLyricsAlbumTransitionCoordinator,
  type AlbumLayoutTransitionParticipant,
  type LyricsAlbumTransitionTicket,
} from './app/layout/lyricsAlbumTransitionCoordinator'
import { createAlbumDetailEntryTransition } from './app/layout/albumDetailEntryTransition'
import { findAlbumTransitionFocusTarget } from './features/albums/utils/albumGridTransitionPlan'
import { albumIdentityKey } from './features/albums/utils/albumIdentity'
import { createSidebarLayoutTransition } from './app/layout/sidebarLayoutTransition'
import { hasCdViewSwitchTransition } from './features/albums/utils/cdViewSwitchTransition'
import {
  animateLyricsPanelSlide,
  animateLyricsPlayerTranslation,
  getLyricsSlideDuration,
} from './app/layout/lyricsPanelSlideMotion'

const route = useRoute()
const { cdCanvasTheme } = useCdCanvasTheme()
useSystemMediaIntegration()
const { displayMode } = usePlayerDisplayMode()
const { isSettingsOpen, closeSettings } = useSettingsDialog()

watch(() => route.fullPath, closeSettings, { flush: 'sync' })
watch(
  displayMode,
  (mode) => {
    if (mode === 'fullscreen') closeSettings()
  },
  { flush: 'sync' },
)

const { lyricsPanelExpanded } = useLyricsPanelVisibility()
const { canLayoutLyricsPanel } = useLyricsPanelLayout()

const shellRef = ref<HTMLElement | null>(null)
const mainRef = ref<HTMLElement | null>(null)
const initialLyricsActive = canLayoutLyricsPanel.value && lyricsPanelExpanded.value
const lyricsProgress = ref(initialLyricsActive ? 1 : 0)
const shouldMountLyrics = ref(initialLyricsActive)
const isLyricsCollapsed = ref(!initialLyricsActive)
const isLyricsInteractive = ref(initialLyricsActive)
const lyricsTargetWidthPx = ref(computeLyricsTargetWidth())
const isLyricsResizing = ref(false)
const isAlbumLayoutTransitioning = ref(false)
const activeAlbumsPage = ref<AlbumLayoutTransitionParticipant | null>(null)
const lyricsAlbumTransition = createLyricsAlbumTransitionCoordinator()
const sidebarLayoutTransition = createSidebarLayoutTransition()
let activeAlbumTransitionTicket: LyricsAlbumTransitionTicket | null = null
let stopAlbumTransitionAnimation: (() => void) | null = null
let lyricsVisualProgress = initialLyricsActive ? 1 : 0
let playerBarTransitionVisuals: Array<{
  node: HTMLElement
  rect: DOMRect
  opacity: number
}> = []
let playerBarTransitionLayers: HTMLElement[] = []
let playerBarTranslationOffset: { x: number; y: number } | null = null
let lyricsPanelTravelPx = 0
let activeLyricsPanel: HTMLElement | null = null
let activeLyricsContent: HTMLElement | null = null
let activePlayerBarIsland: HTMLElement | null = null
function beginLyricsResize(): void {
  isLyricsResizing.value = true
}

let stopLyricsAnimation: (() => void) | null = null
let reducedMotionMedia: MotionQuery | null = null
let genericLyricsTransitionRevision = 0
let isGenericLyricsTransitioning = false

function cancelLyricsAnimation(): void {
  genericLyricsTransitionRevision += 1
  stopLyricsAnimation?.()
  stopLyricsAnimation = null
}

function setActiveAlbumsPage(instance: unknown): void {
  activeAlbumsPage.value =
    instance && typeof instance === 'object' ? (instance as AlbumLayoutTransitionParticipant) : null
}

function getPlayerBarIsland(): HTMLElement | null {
  return shellRef.value?.querySelector<HTMLElement>('.player-bar-island') ?? null
}

function capturePlayerBarTransitionVisuals(): void {
  playerBarTransitionVisuals = []
  for (const layer of playerBarTransitionLayers) {
    const island = layer.querySelector<HTMLElement>('.player-bar-island')
    if (!island) continue
    const rect = island.getBoundingClientRect()
    const opacity = Number.parseFloat(getComputedStyle(layer).opacity)
    if (rect.width > 0 && rect.height > 0 && opacity > 0.001) {
      playerBarTransitionVisuals.push({
        node: island.cloneNode(true) as HTMLElement,
        rect,
        opacity,
      })
    }
  }
  const current = getPlayerBarIsland()
  if (current) {
    const rect = current.getBoundingClientRect()
    const opacity = Number.parseFloat(getComputedStyle(current).opacity)
    if (rect.width > 0 && rect.height > 0 && opacity > 0.001) {
      playerBarTransitionVisuals.push({
        node: current.cloneNode(true) as HTMLElement,
        rect,
        opacity: Number.isFinite(opacity) ? opacity : 1,
      })
    }
  }
}

function removePlayerBarTransitionLayers(): void {
  playerBarTransitionLayers.forEach((layer) => layer.remove())
  playerBarTransitionLayers = []
}

function clonePlayerBarSnapshot(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
  clone.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
    element.tabIndex = -1
  })
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.margin = '0'
  // The wrapper owns opacity; a reversal must not multiply it by the captured island's opacity.
  clone.style.opacity = '1'
  return clone
}

function mountPlayerBarTransitionLayers(targetRect: DOMRect | null): void {
  removePlayerBarTransitionLayers()
  const host = shellRef.value?.querySelector<HTMLElement>('.player-bar')
  const hostStyle = host ? getComputedStyle(host) : null
  for (const visual of playerBarTransitionVisuals) {
    const layer = document.createElement('div')
    layer.className = 'player-bar lyrics-layout-playerbar-snapshot'
    layer.setAttribute('aria-hidden', 'true')
    layer.inert = true
    if (hostStyle) {
      for (let index = 0; index < hostStyle.length; index += 1) {
        const property = hostStyle.item(index)
        if (property.startsWith('--')) {
          layer.style.setProperty(property, hostStyle.getPropertyValue(property))
        }
      }
    }
    Object.assign(layer.style, {
      position: 'fixed',
      left: `${visual.rect.left}px`,
      top: `${visual.rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${visual.rect.width}px`,
      height: `${visual.rect.height}px`,
      zIndex: '45',
      opacity: String(visual.opacity),
      overflow: 'visible',
      pointerEvents: 'none',
      transform: 'translate3d(0, 0, 0)',
    })
    layer.dataset.startOpacity = String(visual.opacity)
    layer.append(clonePlayerBarSnapshot(visual.node))
    document.body.append(layer)
    playerBarTransitionLayers.push(layer)
    const dx = targetRect ? targetRect.left - visual.rect.left : 0
    const dy = targetRect ? targetRect.top - visual.rect.top : 0
    layer.dataset.originLeft = String(visual.rect.left)
    layer.dataset.originTop = String(visual.rect.top)
    layer.dataset.targetLeft = String(targetRect?.left ?? visual.rect.left)
    layer.dataset.targetTop = String(targetRect?.top ?? visual.rect.top)
    layer.dataset.transitionDx = String(targetRect ? dx : 0)
    layer.dataset.transitionDy = String(targetRect ? dy : 0)
  }
  playerBarTransitionVisuals = []
  const current = getPlayerBarIsland()
  if (current) {
    activePlayerBarIsland = current
    current.style.opacity = '0'
  }
}

function retargetPlayerBarTransitionLayers(targetRect: DOMRect): void {
  for (const layer of playerBarTransitionLayers) {
    const originLeft = Number(layer.dataset.originLeft) || 0
    const originTop = Number(layer.dataset.originTop) || 0
    layer.dataset.targetLeft = String(targetRect.left)
    layer.dataset.targetTop = String(targetRect.top)
    layer.dataset.transitionDx = String(targetRect.left - originLeft)
    layer.dataset.transitionDy = String(targetRect.top - originTop)
  }
}

function renderPlayerBarTransition(progress: number): void {
  if (playerBarTranslationOffset && activePlayerBarIsland) {
    const remaining = Math.pow(1 - progress, 3)
    activePlayerBarIsland.style.transform = `translate3d(${playerBarTranslationOffset.x * remaining}px, ${playerBarTranslationOffset.y * remaining}px, 0)`
    return
  }
  for (const layer of playerBarTransitionLayers) {
    const dx = Number(layer.dataset.transitionDx) || 0
    const dy = Number(layer.dataset.transitionDy) || 0
    const initialOpacity = Number.parseFloat(layer.dataset.startOpacity ?? '') || 0
    layer.style.transform = `translate3d(${dx * progress}px, ${dy * progress}px, 0)`
    layer.style.opacity = String(initialOpacity * (1 - progress))
  }
  if (activePlayerBarIsland) activePlayerBarIsland.style.opacity = String(progress)
}

function clearPlayerBarTransition(): void {
  removePlayerBarTransitionLayers()
  playerBarTransitionVisuals = []
  playerBarTranslationOffset = null
  if (activePlayerBarIsland) {
    activePlayerBarIsland.style.removeProperty('opacity')
    activePlayerBarIsland.style.removeProperty('pointer-events')
    activePlayerBarIsland.style.removeProperty('transform')
  }
  activePlayerBarIsland = null
  activeLyricsPanel = null
  activeLyricsContent = null
}

function positionLyricsPanel(panel: HTMLElement, rect: DOMRect): void {
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
  void settleAlbumLyricsTransition()
}

function removeTransitionPointerListener(): void {
  document.removeEventListener('pointerdown', onTransitionPointerDown, true)
}

function usesAlbumLayoutTransition(): boolean {
  return (
    route.name === 'albums' && displayMode.value === 'normal' && activeAlbumsPage.value !== null
  )
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

let activeAlbumParticipant: AlbumLayoutTransitionParticipant | null = null
async function runAlbumLyricsTransition(expanded: boolean, sidebarRail?: boolean): Promise<void> {
  const participant = activeAlbumsPage.value
  if (!participant || !usesAlbumLayoutTransition()) return
  // Read the painted position before cancelling compositor animations on reversal.
  const previousPanel = activeLyricsPanel
  const previousPanelRect = previousPanel?.getBoundingClientRect()
  const previousStyle = previousPanel ? getComputedStyle(previousPanel) : null
  const previousTranslation = previousStyle ? new DOMMatrixReadOnly(previousStyle.transform).m41 : 0
  const from =
    previousPanelRect && previousPanelRect.width > 0
      ? Math.max(0, Math.min(1, 1 - previousTranslation / previousPanelRect.width))
      : lyricsVisualProgress
  const fromOpacity = previousStyle
    ? Number(previousStyle.opacity)
    : shouldMountLyrics.value
      ? 1
      : 0
  const startingIslandRect = getPlayerBarIsland()?.getBoundingClientRect() ?? null
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
    activePlayerBarIsland = getPlayerBarIsland()
  } else {
    capturePlayerBarTransitionVisuals()
    mountPlayerBarTransitionLayers(startingIslandRect)
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

  const targetIsland = getPlayerBarIsland()
  if (targetIsland) {
    activePlayerBarIsland = targetIsland
    const targetRect = targetIsland.getBoundingClientRect()
    if (translatesPlayerBar) {
      playerBarTranslationOffset = {
        x: startingIslandRect
          ? startingIslandRect.left +
            startingIslandRect.width / 2 -
            targetRect.left -
            targetRect.width / 2
          : 0,
        y: startingIslandRect ? startingIslandRect.top - targetRect.top : 0,
      }
    } else {
      retargetPlayerBarTransitionLayers(targetRect)
    }
  } else {
    activePlayerBarIsland = null
    clearPlayerBarTransition()
  }

  participant.renderLyricsLayoutTransition(ticket.revision, 0)
  if (translatesPlayerBar && playerBarTranslationOffset) renderPlayerBarTransition(0)
  lyricsVisualProgress = from
  if (!lyricsAlbumTransition.start(ticket)) return

  const duration = animatesSidebar ? 280 : getLyricsSlideDuration(from, to)
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
    slide && playerBarTranslationOffset && activePlayerBarIsland
      ? animateLyricsPlayerTranslation(activePlayerBarIsland, playerBarTranslationOffset, duration)
      : null
  if (slide) {
    stopLyricsAnimation = () => {
      slide.cancel()
      playerMovement?.cancel()
    }
  }
  stopAlbumTransitionAnimation = animateProgress(
    duration,
    (progress) => {
      const eased =
        slide?.movement.effect?.getComputedTiming().progress ?? 1 - Math.pow(1 - progress, 3)
      const visualProgress = from + (to - from) * eased
      lyricsVisualProgress = visualProgress
      participant.renderLyricsLayoutTransition(ticket.revision, slide ? eased : progress)
      if (!playerMovement) renderPlayerBarTransition(progress)
      sidebarLayoutTransition.render(progress)
    },
    () => void finishAlbumLyricsTransition(ticket),
  )
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
  resetLyricsPanelPosition(shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null)
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
  resetLyricsPanelPosition(shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null)
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
          1 - new DOMMatrixReadOnly(panelStyle.transform).m41 / panel.getBoundingClientRect().width,
        ),
      )
    : lyricsVisualProgress
  const fromOpacity = shouldMountLyrics.value ? Number(panelStyle.opacity) : 0
  const startingIslandRect = getPlayerBarIsland()?.getBoundingClientRect() ?? null
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
  panel.querySelector<HTMLElement>('.now-playing-panel-content')?.style.setProperty('opacity', '1')
  lyricsProgress.value = to
  await nextTick()
  if (revision !== genericLyricsTransitionRevision) return
  panel.style.removeProperty('visibility')
  const duration = getLyricsSlideDuration(from, to)
  const slide = animateLyricsPanelSlide(panel, from, to, fromOpacity, rect.width, duration)
  let playerMovement: Animation | null = null
  const island = getPlayerBarIsland()
  if (island && startingIslandRect) {
    const targetRect = island.getBoundingClientRect()
    playerMovement = animateLyricsPlayerTranslation(
      island,
      { x: startingIslandRect.left - targetRect.left, y: startingIslandRect.top - targetRect.top },
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
  if (!reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
    await runAlbumLyricsTransition(true)
    return
  }
  if (reducedMotionMedia?.matches) {
    applyImmediateState(true)
    return
  }

  await runGenericLyricsTransition(true)
}

function collapseWithAnimation(): void {
  if (!reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
    void runAlbumLyricsTransition(false)
    return
  }
  if (reducedMotionMedia?.matches) {
    applyImmediateState(false)
    return
  }

  void runGenericLyricsTransition(false)
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

function updateLyricsTargetWidth(): void {
  if (isGenericLyricsTransitioning) {
    applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
  }
  if (activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
  lyricsTargetWidthPx.value = computeLyricsTargetWidth(shellRef.value?.clientWidth)
}

function handleReducedMotionChange(): void {
  if (reducedMotionMedia?.matches && activeAlbumTransitionTicket) {
    void settleAlbumLyricsTransition()
  } else if (reducedMotionMedia?.matches && isGenericLyricsTransitioning) {
    applyImmediateState(lyricsPanelExpanded.value && canLayoutLyricsPanel.value)
  }
}

const shellStyle = computed<CSSProperties>(() => ({
  '--auralis-lyrics-progress': String(lyricsProgress.value),
  '--auralis-lyrics-target-width': `${lyricsTargetWidthPx.value}px`,
  '--auralis-lyrics-column-width': `calc(20% * ${lyricsProgress.value})`,
}))

/** 成功导航的来源；与目标路由在同一轮渲染前更新。 */
const previousRouteName = ref(route.name)
const cdIndexSlideDirection = ref<'enter' | 'leave' | null>(null)
/** 仅在导航成功后锁定交互，加载失败或守卫取消不产生过渡状态。 */
const isAlbumDetailEntering = ref(false)
const isAlbumRouteTransitioning = ref(false)
const isFirstAlbumDetailTransition = ref(false)
let albumRouteRevision = 0
const enteringRevisions = new WeakMap<Element, number>()
const leavingInertStates = new WeakMap<HTMLElement, boolean>()
let shouldRestoreRouteFocus = false
let albumListReturnFocus: { albumKey: string; selector: string } | null = null
let hasPreparedAlbumDetail = false
const albumDetailEntryTransition = createAlbumDetailEntryTransition(() => {
  hasPreparedAlbumDetail = true
})
const firstAlbumDetailTransitionHooks = computed(() =>
  isFirstAlbumDetailTransition.value
    ? {
        onBeforeEnter: albumDetailEntryTransition.beforeEnter,
        onEnter: albumDetailEntryTransition.enter,
        onLeave: albumDetailEntryTransition.leave,
        onLeaveCancelled: albumDetailEntryTransition.cancel,
      }
    : {},
)

const removeBeforeEach = router.beforeEach(() => {
  if (isGenericLyricsTransitioning) {
    applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
  }
})

const removeAfterEach = router.afterEach((to, from, failure) => {
  if (failure) return
  albumDetailEntryTransition.cancel()
  albumRouteRevision += 1
  const focused = document.activeElement
  const mainHasFocus = focused instanceof HTMLElement && !!mainRef.value?.contains(focused)
  if (from.name === 'albums' && to.name === 'album-detail') {
    const albumKey =
      typeof to.query.artist === 'string' && typeof to.query.title === 'string'
        ? albumIdentityKey(to.query.artist, to.query.title)
        : null
    const focusedAlbumKey =
      focused instanceof HTMLElement
        ? focused.closest<HTMLElement>('.album-card[data-album-key]')?.dataset.albumKey
        : null
    albumListReturnFocus = albumKey
      ? {
          albumKey,
          selector:
            focusedAlbumKey === albumKey && focused?.matches('.album-card-play')
              ? '.album-card-play'
              : '.cover-stage',
        }
      : null
  }
  previousRouteName.value = from.name
  cdIndexSlideDirection.value =
    from.name === 'cd-albums' &&
    to.name === 'cd-album-index' &&
    hasCdViewSwitchTransition('browse', 'index')
      ? 'enter'
      : from.name === 'cd-album-index' &&
          to.name === 'cd-albums' &&
          hasCdViewSwitchTransition('index', 'browse')
        ? 'leave'
        : null
  isAlbumDetailEntering.value = to.name === 'album-detail' && from.name === 'albums'
  isFirstAlbumDetailTransition.value = isAlbumDetailEntering.value && !hasPreparedAlbumDetail
  isAlbumRouteTransitioning.value =
    isAlbumDetailEntering.value || (to.name === 'albums' && from.name === 'album-detail')
  shouldRestoreRouteFocus =
    (isAlbumRouteTransitioning.value && mainHasFocus) ||
    (shouldRestoreRouteFocus && (mainHasFocus || focused === document.body))
})

onMounted(() => {
  reducedMotionMedia = createReducedMotionQuery()
  reducedMotionMedia.addEventListener('change', handleReducedMotionChange)
  window.addEventListener('resize', updateLyricsTargetWidth)
  updateLyricsTargetWidth()
})

onBeforeUnmount(() => {
  removeBeforeEach()
  removeAfterEach()
  albumRouteRevision += 1
  shouldRestoreRouteFocus = false
  albumDetailEntryTransition.cancel()
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
  void settleAlbumLyricsTransition()
  cancelLyricsAnimation()
  clearPlayerBarTransition()
  removeTransitionPointerListener()
  reducedMotionMedia?.removeEventListener('change', handleReducedMotionChange)
  window.removeEventListener('resize', updateLyricsTargetWidth)
})

const isAlbumDetail = computed(() => {
  return route.name === 'album-detail'
})

const isCdCanvas = computed(() => {
  return route.name === 'cd-albums' || route.name === 'cd-album-index'
})

/** 全高布局下的收起图标栏；驱动 Shell 列宽、播放栏左边界与背景裁切。 */
const { sidebarFullHeight, sidebarCollapsed } = useSidebarLayout()
const isSidebarRail = computed(
  () => sidebarFullHeight.value && sidebarCollapsed.value && !isCdCanvas.value,
)
const renderedSidebarRail = ref(isSidebarRail.value)

watch(isSidebarRail, (rail) => {
  if (isGenericLyricsTransitioning) {
    applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
  }
  if (sidebarFullHeight.value && !reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
    void runAlbumLyricsTransition(canLayoutLyricsPanel.value && lyricsPanelExpanded.value, rail)
  } else {
    if (activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
    renderedSidebarRail.value = rail
  }
})

watch(sidebarFullHeight, (fullHeight) => {
  if (!fullHeight && activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
})

/**
 * 路由过渡规则：
 * 1. 专辑列表 ➔ 专辑详情：景深穿梭与黑胶破土浮升 (album-detail-enter-matrix)
 * 2. 专辑详情 ➔ 专辑列表：黑胶沉降与景深聚拢归位 (album-detail-exit-matrix)
 * 3. CD 浏览与封面检索切换：检索页面从右侧滑入，返回时向右滑出
 * 4. 唱片室其余进入与离开：短淡入淡出，首次展开动画由页面控制
 * 5. 其余路由切换：不使用 CSS 过渡，立即完成
 */
const transitionName = computed(() => {
  if (route.name === 'album-detail' && previousRouteName.value === 'albums') {
    return 'album-detail-enter-matrix'
  }
  if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
    return 'album-detail-exit-matrix'
  }
  if (cdIndexSlideDirection.value === 'enter') return 'cd-index-slide'
  if (cdIndexSlideDirection.value === 'leave') return 'cd-index-slide-return'
  if (route.name === 'cd-albums' || previousRouteName.value === 'cd-albums') {
    return 'cd-canvas-fade'
  }
  return null
})

function onTransitionBeforeEnter(element: Element): void {
  enteringRevisions.set(element, albumRouteRevision)
}

function onTransitionBeforeLeave(element: Element): void {
  if (!isAlbumRouteTransitioning.value) return
  const node = element as HTMLElement
  if (!leavingInertStates.has(node)) leavingInertStates.set(node, node.inert)
  node.inert = true
}

function restoreLeavingInteractivity(element: Element): void {
  const node = element as HTMLElement
  const previous = leavingInertStates.get(node)
  if (previous === undefined) return
  node.inert = previous
  leavingInertStates.delete(node)
}

async function restoreRouteFocus(revision: number): Promise<void> {
  await nextTick()
  if (revision !== albumRouteRevision || !shouldRestoreRouteFocus) return
  shouldRestoreRouteFocus = false
  const main = mainRef.value
  const focused = document.activeElement
  // Respect focus moved to the Playbar or Sidebar while the page was inert.
  if (!main?.isConnected || (focused !== document.body && !main.contains(focused))) return
  const returnTarget =
    route.name === 'albums' && albumListReturnFocus
      ? findAlbumTransitionFocusTarget(
          main.querySelectorAll<HTMLElement>('.album-card[data-album-key]'),
          albumListReturnFocus.albumKey,
          albumListReturnFocus.selector,
        )
      : null
  const target =
    returnTarget ??
    (route.name === 'album-detail' ? main.querySelector<HTMLElement>('.album-detail-back') : null)
  ;(target ?? main).focus({ preventScroll: true })
}

function onTransitionAfterEnter(element: Element): void {
  if (enteringRevisions.get(element) !== albumRouteRevision) return
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
  void restoreRouteFocus(albumRouteRevision)
}

function onTransitionEnterCancelled(element: Element): void {
  if (enteringRevisions.get(element) !== albumRouteRevision) return
  albumDetailEntryTransition.cancel()
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
  void restoreRouteFocus(albumRouteRevision)
}

watch(
  () => route.name,
  (name) => {
    if (name !== 'albums' && activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
  },
)

watch(displayMode, (mode) => {
  if (mode !== 'normal' && isGenericLyricsTransitioning) {
    applyImmediateState(canLayoutLyricsPanel.value && lyricsPanelExpanded.value)
  }
  if (mode !== 'normal' && activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
})
</script>

<template>
  <div
    class="app-window"
    :inert="displayMode === 'fullscreen' || isSettingsOpen"
    :class="{
      'is-cd-albums': isCdCanvas,
      'is-cd-albums-dark': isCdCanvas && cdCanvasTheme === 'dark',
    }"
    data-app-shell-root
  >
    <div
      ref="shellRef"
      class="app-shell relative"
      :class="{
        'is-album-detail': isAlbumDetail,
        'is-cd-albums': isCdCanvas,
        'is-cd-albums-dark': isCdCanvas && cdCanvasTheme === 'dark',
        'is-sidebar-collapsed': renderedSidebarRail,
        'is-lyrics-collapsed': isLyricsCollapsed,
        'is-lyrics-resizing': isLyricsResizing,
        'is-album-layout-transitioning': isAlbumLayoutTransitioning,
      }"
      :style="shellStyle"
    >
      <div
        class="shell-drag-region"
        :class="{ 'shell-drag-region--cd': isCdCanvas }"
        aria-hidden="true"
      />
      <WindowTrafficLights :cd-canvas="isCdCanvas" />

      <AppSidebar v-if="!isCdCanvas" class="relative z-10" />

      <main
        ref="mainRef"
        class="app-main relative z-10"
        tabindex="-1"
        :inert="isAlbumRouteTransitioning"
      >
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition
            :name="transitionName ?? undefined"
            :css="transitionName !== null && !isFirstAlbumDetailTransition"
            v-bind="firstAlbumDetailTransitionHooks"
            @before-enter="onTransitionBeforeEnter"
            @before-leave="onTransitionBeforeLeave"
            @after-leave="restoreLeavingInteractivity"
            @leave-cancelled="restoreLeavingInteractivity"
            @after-enter="onTransitionAfterEnter"
            @enter-cancelled="onTransitionEnterCancelled"
          >
            <KeepAlive include="AlbumsPage" :max="1">
              <component
                :is="Component"
                :key="String(viewRoute.name)"
                :ref="viewRoute.name === 'albums' ? setActiveAlbumsPage : undefined"
                v-bind="
                  viewRoute.name === 'album-detail'
                    ? { isEntering: isAlbumDetailEntering }
                    : viewRoute.name === 'albums'
                      ? {
                          isTransitioning: isAlbumRouteTransitioning,
                          isLayoutResizing: isLyricsResizing,
                        }
                      : {}
                "
                @cancel-layout-transition="settleAlbumLyricsTransition"
              />
            </KeepAlive>
          </Transition>
        </RouterView>
      </main>

      <NowPlayingPanel
        v-if="!isCdCanvas"
        class="relative z-10"
        :should-mount-lyrics="shouldMountLyrics"
        :is-collapsed="isLyricsCollapsed"
        :is-interactive="isLyricsInteractive"
        :target-width-px="lyricsTargetWidthPx"
      />
      <PlayerBar v-if="!isCdCanvas" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
  <SettingsDialog />
</template>

<style scoped>
.app-window.is-cd-albums {
  background: #eeeeec;
  box-shadow: none;
}

.app-shell.is-cd-albums {
  grid-template-columns: minmax(0, 1fr) !important;
  background: #eeeeec;
}

.app-window.is-cd-albums-dark,
.app-shell.is-cd-albums-dark {
  background: #2b2d30;
}

@media (min-width: 1280px) {
  .app-shell.is-cd-albums {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
</style>
