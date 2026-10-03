<script setup lang="ts">
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { router } from './app/router'
import AppSidebar from './app/layout/AppSidebar.vue'
import WindowTrafficLights from './app/layout/WindowTrafficLights.vue'
import NowPlayingPanel from './app/layout/NowPlayingPanel.vue'
import PlayerBar from './app/layout/PlayerBar.vue'
import FullscreenPlayerOverlay from './app/layout/FullscreenPlayerOverlay.vue'
import FluidArtworkBackground from './features/playback/components/FluidArtworkBackground.vue'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useCdCanvasTheme } from '@renderer/features/albums/composables/useCdCanvasTheme'
import { useSystemMediaIntegration } from '@renderer/features/playback/composables/useSystemMediaIntegration'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { useLyricsPanelVisibility } from '@renderer/features/appearance/composables/useLyricsPanelVisibility'
import { useLyricsPanelLayout, computeLyricsTargetWidth } from './app/layout/useLyricsPanelLayout'
import { animateLyricsPanelExpansion, animateProgress } from '@renderer/shared/animation/motion'
import {
  createLyricsAlbumTransitionCoordinator,
  type AlbumLayoutTransitionParticipant,
  type LyricsAlbumTransitionTicket,
} from './app/layout/lyricsAlbumTransitionCoordinator'
import { createAlbumDetailEntryTransition } from './app/layout/albumDetailEntryTransition'

const route = useRoute()
const playback = usePlayback()
const { shellFluidBackgroundEnabled } = useShellFluidBackground()
const { cdCanvasTheme } = useCdCanvasTheme()
useSystemMediaIntegration()
const { displayMode } = usePlayerDisplayMode()

const { lyricsPanelExpanded } = useLyricsPanelVisibility()
const { canDisplayLyricsPanel } = useLyricsPanelLayout()

const shellRef = ref<HTMLElement | null>(null)
const initialLyricsActive = canDisplayLyricsPanel.value && lyricsPanelExpanded.value
const lyricsProgress = ref(initialLyricsActive ? 1 : 0)
const shouldMountLyrics = ref(initialLyricsActive)
const isLyricsCollapsed = ref(!initialLyricsActive)
const isLyricsInteractive = ref(initialLyricsActive)
const lyricsTargetWidthPx = ref(computeLyricsTargetWidth())
const isLyricsResizing = ref(false)
const isAlbumLayoutTransitioning = ref(false)
const activeAlbumsPage = ref<AlbumLayoutTransitionParticipant | null>(null)
const lyricsAlbumTransition = createLyricsAlbumTransitionCoordinator()
let activeAlbumTransitionTicket: LyricsAlbumTransitionTicket | null = null
let stopAlbumTransitionAnimation: (() => void) | null = null
let lyricsVisualProgress = initialLyricsActive ? 1 : 0
let playerBarTransitionVisuals: Array<{
  node: HTMLElement
  rect: DOMRect
  opacity: number
}> = []
let playerBarTransitionLayers: HTMLElement[] = []
let lyricsPanelTravelPx = 0
let lyricsPanelTransformFromPx = 0
let lyricsPanelTransformToPx = 0
let activeLyricsPanel: HTMLElement | null = null
let activeLyricsContent: HTMLElement | null = null
let activePlayerBarIsland: HTMLElement | null = null
let lyricsResizeFrame: number | null = null

function cancelLyricsResizeFrame(): void {
  if (lyricsResizeFrame !== null) cancelAnimationFrame(lyricsResizeFrame)
  lyricsResizeFrame = null
}

function beginLyricsResize(): void {
  cancelLyricsResizeFrame()
  isLyricsResizing.value = true
}

function finishLyricsResize(): void {
  // 终点列宽先绘制，再恢复侧边栏的 CSS 过渡和专辑网格测量。
  lyricsResizeFrame = requestAnimationFrame(() => {
    lyricsResizeFrame = requestAnimationFrame(() => {
      lyricsResizeFrame = null
      isLyricsResizing.value = false
    })
  })
}

let stopLyricsAnimation: (() => void) | null = null
let animationTarget: boolean | null = null
let reducedMotionMedia: MotionQuery | null = null

function cancelLyricsAnimation(): void {
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
  if (target instanceof Element && target.closest('[data-lyrics-toggle]')) return
  void settleAlbumLyricsTransition()
}

function removeTransitionPointerListener(): void {
  document.removeEventListener('pointerdown', onTransitionPointerDown, true)
}

function usesAlbumLayoutTransition(): boolean {
  return (
    route.name === 'albums' &&
    displayMode.value === 'normal' &&
    canDisplayLyricsPanel.value &&
    activeAlbumsPage.value !== null
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
  const expanded = ticket.to >= 0.5
  const panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
  setLyricsVisualProgress(ticket.to)
  setLyricsTargetState(expanded)
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
  animationTarget = null
  stopLyricsAnimation = null
}

let activeAlbumParticipant: AlbumLayoutTransitionParticipant | null = null
async function runAlbumLyricsTransition(expanded: boolean): Promise<void> {
  const participant = activeAlbumsPage.value
  if (!participant || !usesAlbumLayoutTransition()) return
  stopAlbumTransitionAnimation?.()
  stopAlbumTransitionAnimation = null
  cancelLyricsAnimation()

  const from = lyricsVisualProgress
  const to = expanded ? 1 : 0
  if (Math.abs(to - from) < 0.001) {
    applyImmediateState(expanded)
    return
  }

  const ticket = lyricsAlbumTransition.begin(from, to)
  activeAlbumTransitionTicket = ticket
  activeAlbumParticipant = participant
  activeLyricsPanel = null
  activeLyricsContent = null
  activePlayerBarIsland = null
  animationTarget = expanded
  isLyricsResizing.value = true
  isAlbumLayoutTransitioning.value = true
  capturePlayerBarTransitionVisuals()
  const startingIslandRect = getPlayerBarIsland()?.getBoundingClientRect() ?? null
  mountPlayerBarTransitionLayers(startingIslandRect)

  let panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
  const startingPanelRect = panel?.getBoundingClientRect()
  if (panel) {
    if (expanded) {
      resetLyricsPanelPosition(panel)
      panel.style.visibility = 'hidden'
    } else if (startingPanelRect && startingPanelRect.width > 0) {
      panel.style.visibility = 'hidden'
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
    applyImmediateState(expanded)
    lyricsAlbumTransition.cancel()
    activeAlbumTransitionTicket = null
    activeAlbumParticipant = null
    isAlbumLayoutTransitioning.value = false
    return
  }
  document.addEventListener('pointerdown', onTransitionPointerDown, true)

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

  panel = shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null
  const targetPanelRect = panel?.getBoundingClientRect()
  if (panel && targetPanelRect && targetPanelRect.width > 0) {
    activeLyricsPanel = panel
    activeLyricsContent = panel.querySelector<HTMLElement>('.now-playing-panel-content')
    panel.style.visibility = 'hidden'
    positionLyricsPanel(panel, targetPanelRect)
    lyricsPanelTravelPx = targetPanelRect.width
    lyricsPanelTransformFromPx = expanded ? lyricsPanelTravelPx * (1 - from) : 0
    lyricsPanelTransformToPx = expanded ? 0 : lyricsPanelTravelPx
    panel.style.opacity = String(from)
    activeLyricsContent?.style.setProperty('opacity', '1')
    panel.style.transform = `translate3d(${lyricsPanelTransformFromPx}px, 0, 0)`
    panel.style.visibility = 'visible'
  }

  const targetIsland = getPlayerBarIsland()
  if (targetIsland) {
    activePlayerBarIsland = targetIsland
    const targetRect = targetIsland.getBoundingClientRect()
    retargetPlayerBarTransitionLayers(targetRect)
  } else {
    activePlayerBarIsland = null
    clearPlayerBarTransition()
  }

  participant.renderLyricsLayoutTransition(ticket.revision, 0)
  setLyricsVisualProgress(from)
  if (!lyricsAlbumTransition.start(ticket)) return

  const duration = 200 * Math.abs(to - from)
  stopAlbumTransitionAnimation = animateProgress(
    duration,
    (progress) => {
      const eased = 1 - Math.pow(1 - progress, 3)
      const visualProgress = from + (to - from) * eased
      setLyricsVisualProgress(visualProgress)
      if (activeLyricsPanel) {
        const panelOffset =
          lyricsPanelTransformFromPx +
          (lyricsPanelTransformToPx - lyricsPanelTransformFromPx) * eased
        activeLyricsPanel.style.transform = `translate3d(${panelOffset}px, 0, 0)`
      }
      participant.renderLyricsLayoutTransition(ticket.revision, progress)
      renderPlayerBarTransition(progress)
    },
    () => void finishAlbumLyricsTransition(ticket),
  )
}

async function settleAlbumLyricsTransition(): Promise<void> {
  const ticket = activeAlbumTransitionTicket
  if (!ticket) return
  stopAlbumTransitionAnimation?.()
  stopAlbumTransitionAnimation = null
  lyricsAlbumTransition.cancel()
  const participant = activeAlbumParticipant
  participant?.cancelLyricsLayoutTransition(ticket.revision)
  const expanded = ticket.to >= 0.5 && canDisplayLyricsPanel.value
  setLyricsTargetState(expanded)
  setLyricsVisualProgress(expanded ? 1 : 0)
  resetLyricsPanelPosition(shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null)
  clearPlayerBarTransition()
  removeTransitionPointerListener()
  activeAlbumTransitionTicket = null
  activeAlbumParticipant = null
  isAlbumLayoutTransitioning.value = false
  isLyricsResizing.value = false
  animationTarget = null
  stopLyricsAnimation = null
}

function applyImmediateState(expanded: boolean): void {
  const ticket = activeAlbumTransitionTicket
  if (ticket) {
    stopAlbumTransitionAnimation?.()
    stopAlbumTransitionAnimation = null
    lyricsAlbumTransition.cancel()
    activeAlbumParticipant?.cancelLyricsLayoutTransition(ticket.revision)
    activeAlbumTransitionTicket = null
    activeAlbumParticipant = null
  }
  clearPlayerBarTransition()
  removeTransitionPointerListener()
  resetLyricsPanelPosition(shellRef.value?.querySelector<HTMLElement>('.now-playing-panel') ?? null)
  isAlbumLayoutTransitioning.value = false
  cancelLyricsAnimation()
  cancelLyricsResizeFrame()
  isLyricsResizing.value = false
  animationTarget = null
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

async function expandWithAnimation(): Promise<void> {
  animationTarget = true
  if (!reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
    await runAlbumLyricsTransition(true)
    return
  }
  cancelLyricsAnimation()

  if (reducedMotionMedia?.matches) {
    applyImmediateState(true)
    return
  }

  beginLyricsResize()

  if (!shouldMountLyrics.value) {
    shouldMountLyrics.value = true
    isLyricsCollapsed.value = false
    isLyricsInteractive.value = false
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    if (animationTarget !== true || !canDisplayLyricsPanel.value) return
  }

  stopLyricsAnimation = animateLyricsPanelExpansion(
    lyricsProgress.value,
    1,
    Boolean(reducedMotionMedia?.matches),
    (progress) => {
      lyricsProgress.value = progress
      lyricsVisualProgress = progress
    },
    () => {
      stopLyricsAnimation = null
      lyricsVisualProgress = 1
      isLyricsInteractive.value = true
      finishLyricsResize()
    },
  )
}

function collapseWithAnimation(): void {
  animationTarget = false
  if (!reducedMotionMedia?.matches && usesAlbumLayoutTransition()) {
    void runAlbumLyricsTransition(false)
    return
  }
  cancelLyricsAnimation()
  isLyricsInteractive.value = false

  if (reducedMotionMedia?.matches) {
    applyImmediateState(false)
    return
  }

  beginLyricsResize()

  stopLyricsAnimation = animateLyricsPanelExpansion(
    lyricsProgress.value,
    0,
    Boolean(reducedMotionMedia?.matches),
    (progress) => {
      lyricsProgress.value = progress
      lyricsVisualProgress = progress
    },
    () => {
      stopLyricsAnimation = null
      lyricsVisualProgress = 0
      shouldMountLyrics.value = false
      isLyricsCollapsed.value = true
      finishLyricsResize()
    },
  )
}

watch(lyricsPanelExpanded, (expanded) => {
  if (!canDisplayLyricsPanel.value) {
    applyImmediateState(false)
    return
  }
  if (expanded) {
    void expandWithAnimation()
  } else {
    collapseWithAnimation()
  }
})

watch(canDisplayLyricsPanel, (canDisplay) => {
  applyImmediateState(canDisplay && lyricsPanelExpanded.value)
})

function updateLyricsTargetWidth(): void {
  if (activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
  lyricsTargetWidthPx.value = computeLyricsTargetWidth(shellRef.value?.clientWidth)
}

function handleReducedMotionChange(): void {
  if (reducedMotionMedia?.matches && activeAlbumTransitionTicket) {
    void settleAlbumLyricsTransition()
  } else if (reducedMotionMedia?.matches && stopLyricsAnimation) {
    applyImmediateState(lyricsPanelExpanded.value && canDisplayLyricsPanel.value)
  }
}

const shellStyle = computed<CSSProperties>(() => ({
  '--auralis-lyrics-progress': String(lyricsProgress.value),
  '--auralis-lyrics-target-width': `${lyricsTargetWidthPx.value}px`,
  '--auralis-lyrics-column-width': `calc(20% * ${lyricsProgress.value})`,
}))

/** 上一导航来源路由名；在 beforeEach 中更新，供 Transition 在目标路由已切换时仍能判断方向 */
const previousRouteName = ref(route.name)
/** Albums ➔ AlbumDetail 专属进入过渡标记；在 beforeEach 提早设为 true，并在 after-enter/cancelled 时复位 */
const isAlbumDetailEntering = ref(false)
const isAlbumRouteTransitioning = ref(false)
const isFirstAlbumDetailTransition = ref(false)
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

const removeBeforeEach = router.beforeEach((to, from) => {
  albumDetailEntryTransition.cancel()
  previousRouteName.value = from.name
  isAlbumDetailEntering.value = to.name === 'album-detail' && from.name === 'albums'
  isFirstAlbumDetailTransition.value = isAlbumDetailEntering.value && !hasPreparedAlbumDetail
  isAlbumRouteTransitioning.value =
    isAlbumDetailEntering.value || (to.name === 'albums' && from.name === 'album-detail')
})

onMounted(() => {
  reducedMotionMedia = createReducedMotionQuery()
  reducedMotionMedia.addEventListener('change', handleReducedMotionChange)
  window.addEventListener('resize', updateLyricsTargetWidth)
  updateLyricsTargetWidth()
})

onBeforeUnmount(() => {
  removeBeforeEach()
  albumDetailEntryTransition.cancel()
  isAlbumDetailEntering.value = false
  void settleAlbumLyricsTransition()
  cancelLyricsAnimation()
  cancelLyricsResizeFrame()
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

const isArchiveCanvas = computed(() => route.name === 'archive')
const isStandaloneCanvas = computed(() => isCdCanvas.value || isArchiveCanvas.value)

/** 全高布局下的收起图标栏；驱动 Shell 列宽、播放栏左边界与背景裁切。 */
const { sidebarFullHeight, sidebarCollapsed } = useSidebarLayout()
const isSidebarRail = computed(
  () => sidebarFullHeight.value && sidebarCollapsed.value && !isStandaloneCanvas.value,
)

const artworkUrl = computed(() =>
  getArtworkUrl(playback.state.currentTrack?.artworkCacheKey ?? null),
)
const shouldRenderShellArtwork = computed(
  () =>
    shellFluidBackgroundEnabled.value &&
    displayMode.value === 'normal' &&
    !isStandaloneCanvas.value &&
    artworkUrl.value !== null,
)

/**
 * 路由过渡规则：
 * 1. 专辑列表 ➔ 专辑详情：景深穿梭与黑胶破土浮升 (album-detail-enter-matrix)
 * 2. 专辑详情 ➔ 专辑列表：黑胶沉降与景深聚拢归位 (album-detail-exit-matrix)
 * 3. 其余路由切换：不使用 CSS 过渡，立即完成
 */
const transitionName = computed(() => {
  if (route.name === 'album-detail' && previousRouteName.value === 'albums') {
    return 'album-detail-enter-matrix'
  }
  if (route.name === 'albums' && previousRouteName.value === 'album-detail') {
    return 'album-detail-exit-matrix'
  }
  return null
})

function onTransitionAfterEnter(): void {
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
}

function onTransitionEnterCancelled(): void {
  albumDetailEntryTransition.cancel()
  isAlbumDetailEntering.value = false
  isAlbumRouteTransitioning.value = false
}

watch(
  () => route.name,
  (name) => {
    if (name !== 'albums' && activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
  },
)

watch(displayMode, (mode) => {
  if (mode !== 'normal' && activeAlbumTransitionTicket) void settleAlbumLyricsTransition()
})
</script>

<template>
  <div
    class="app-window"
    :inert="displayMode === 'fullscreen'"
    :class="{
      'is-cd-albums': isCdCanvas,
      'is-archive-canvas': isArchiveCanvas,
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
        'is-archive-canvas': isArchiveCanvas,
        'is-cd-albums-dark': isCdCanvas && cdCanvasTheme === 'dark',
        'has-artwork': shouldRenderShellArtwork,
        'is-sidebar-collapsed': isSidebarRail,
        'is-lyrics-resizing': isLyricsResizing,
        'is-album-layout-transitioning': isAlbumLayoutTransitioning,
      }"
      :style="shellStyle"
    >
      <div
        class="shell-drag-region"
        :class="{ 'shell-drag-region--cd': isStandaloneCanvas }"
        aria-hidden="true"
      />
      <WindowTrafficLights :cd-canvas="isStandaloneCanvas" />

      <FluidArtworkBackground
        v-if="shouldRenderShellArtwork"
        :artwork-url="artworkUrl"
        :active="true"
        :playing="playback.state.isPlaying"
        class="app-shell-bg-fluid"
      />
      <div v-if="shouldRenderShellArtwork" class="app-shell-bg-overlay" aria-hidden="true" />

      <AppSidebar v-if="!isStandaloneCanvas" class="relative z-10" />

      <main class="app-main relative z-10">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition
            :name="transitionName ?? undefined"
            :css="transitionName !== null && !isFirstAlbumDetailTransition"
            v-bind="firstAlbumDetailTransitionHooks"
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
        v-if="!isStandaloneCanvas"
        class="relative z-10"
        :should-mount-lyrics="shouldMountLyrics"
        :is-collapsed="isLyricsCollapsed"
        :is-interactive="isLyricsInteractive"
        :target-width-px="lyricsTargetWidthPx"
      />
      <PlayerBar v-if="!isStandaloneCanvas" />
    </div>
    <FullscreenPlayerOverlay />
  </div>
</template>

<style scoped>
.app-window.is-archive-canvas {
  --auralis-main-corner-radius: 0px;
  --auralis-playbar-safe-area: 0px;
  background: #030305;
}
.app-shell.is-archive-canvas {
  grid-template-columns: minmax(0, 1fr) !important;
  background: #030305;
}
.app-shell.is-archive-canvas > .app-main {
  padding: 0;
  border-radius: 0;
  overflow: hidden;
}
.app-shell.is-archive-canvas > .shell-drag-region {
  top: 0;
  right: 112px;
  left: 0;
  width: auto;
  height: 20px;
}

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

.app-shell-bg-fluid,
.app-shell-bg-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.app-shell-bg-fluid {
  z-index: 0;
}

.app-shell-bg-overlay {
  z-index: 1;
  background: var(--auralis-shell-overlay-bg, color-mix(in srgb, #0c0b0a 65%, transparent));
  backdrop-filter: var(--auralis-overlay-blur, blur(20px) saturate(1.45) contrast(1.02));
  -webkit-backdrop-filter: var(--auralis-overlay-blur, blur(20px) saturate(1.45) contrast(1.02));
}
</style>
