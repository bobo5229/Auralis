import { nextTick, ref, watch } from 'vue'
import { animateProgress } from '@renderer/shared/animation/motion'
import type { MotionQuery } from '@renderer/shared/animation/motionPreference'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'
import type { CdCanvasTheme } from './useCdCanvasTheme'
import { createCdStage, type CdPlaybackRingState } from '../utils/cdStageController'
import {
  moveSurfaceIndicator as moveSurfaceIndicatorAnimation,
  resetSurfaceIndicator,
  type CdSurfaceIndicatorMotionState,
} from '../utils/cdSurfaceIndicator'

interface Options {
  canvasTheme: () => CdCanvasTheme
  reducedMotion: MotionQuery
  isDisposed: () => boolean
  isLoading: () => boolean
  hasFailed: () => boolean
  settleInfo: () => void
  setRapidBrowse: (running: boolean) => void
  reduceBrowsingPlaybackMotion: () => void
  playbackRing: () => CdPlaybackRingState
  togglePlayback: () => boolean
  back: () => void
  claimStartupEntry: () => Promise<{ firstEntry: boolean }>
  requestedAlbumKey: string | null
  fromIndexViewSwitch: boolean
}

/** Owns the imperative stage, its input, entry policy and cancellable scene effects. */
export function useCdRoomScene(options: Options) {
  const { reducedMotion, settleInfo, setRapidBrowse, back } = options
  const pageRef = ref<HTMLElement | null>(null)
  const stageRef = ref<HTMLElement | null>(null)
  const trackPanelRef = ref<HTMLElement | null>(null)
  const controlsRef = ref<HTMLElement | null>(null)
  const surfaceSwitchRef = ref<HTMLElement | null>(null)
  const surfaceIndicatorRef = ref<HTMLElement | null>(null)
  const focused = ref(false)
  const focusSettled = ref(false)
  const selected = ref(0)
  const infoSelected = ref(0)
  const starting = ref(false)
  const repeatEntry = ref(false)
  const discSurface = ref<'cd' | 'vinyl'>('cd')
  const motionReduced = ref(reducedMotion.matches)
  let entryInitialized = false
  let vinylBlend = 0
  let cancelSurfaceAnimation: (() => void) | null = null
  const surfaceIndicatorMotion: CdSurfaceIndicatorMotionState = {
    edges: null,
    cancelAnimation: null,
  }
  let controller: ReturnType<typeof createCdStage> | null = null
  let stopPlaybackRingWatch: (() => void) | null = null

  async function presentAlbums(albums: CdAlbumInfo[]): Promise<void> {
    const initialEntry = !entryInitialized && albums.length > 0
    let firstRuntimeEntry = false
    if (initialEntry) {
      const entry = await options.claimStartupEntry()
      if (options.isDisposed()) return
      firstRuntimeEntry = entry.firstEntry
      repeatEntry.value = !firstRuntimeEntry
      entryInitialized = true
    }
    const targetKey =
      initialEntry && albums.some((album) => album.key === options.requestedAlbumKey)
        ? options.requestedAlbumKey
        : null
    controller?.setAlbums(
      albums,
      firstRuntimeEntry && !targetKey && !options.fromIndexViewSwitch,
      targetKey ?? undefined,
    )
    if (targetKey) controller?.setFocused(true, 'fade')
  }

  async function restoreBrowseFocus(): Promise<void> {
    await nextTick()
    if (!options.isDisposed() && document.activeElement === document.body) {
      stageRef.value?.focus({ preventScroll: true })
    }
  }

  function returnToBrowse(): void {
    controller?.setFocused(false)
  }

  function focusAlbum(index: number): void {
    if (index < 0 || options.isLoading() || starting.value || focused.value) return
    controller?.focusAlbum(index)
  }

  function focusChange(progress: number, settled: boolean): void {
    const wasFocused = focused.value
    focused.value = progress > 0 || !settled
    focusSettled.value = progress === 1 && settled
    stageRef.value?.style.setProperty('--cd-focus', String(progress))
    if (!wasFocused && focused.value) settleInfo()
    const p = Math.max(0, Math.min(1, (progress - 0.72) / 0.28))
    const reveal = p * p * p * (10 + p * (-15 + 6 * p))
    if (trackPanelRef.value) {
      trackPanelRef.value.style.opacity = String(reveal)
      trackPanelRef.value.style.transform = `translateX(${(1 - reveal) * 16}px)`
      trackPanelRef.value.style.visibility = reveal > 0 ? 'visible' : 'hidden'
    }
    if (controlsRef.value) controlsRef.value.style.opacity = String(1 - Math.min(1, progress / 0.5))
    if (settled && !options.isDisposed() && progress !== 1)
      stageRef.value?.focus({ preventScroll: true })
  }
  function setDiscSurface(surface: 'cd' | 'vinyl'): void {
    discSurface.value = surface
    cancelSurfaceAnimation?.()
    cancelSurfaceAnimation = null
    const from = vinylBlend
    const to = surface === 'vinyl' ? 1 : 0
    const update = (value: number): void => {
      vinylBlend = value
      stageRef.value?.style.setProperty('--cd-vinyl', String(value))
      syncMaterialAppearance()
    }
    if (reducedMotion.matches || from === to) {
      update(to)
      return
    }
    cancelSurfaceAnimation = animateProgress(
      280,
      (progress) => update(from + (to - from) * (1 - (1 - progress) ** 3)),
      () => {
        update(to)
        cancelSurfaceAnimation = null
      },
    )
  }

  function syncMaterialAppearance(): void {
    controller?.setMaterialAppearance({ dark: options.canvasTheme() === 'dark', vinyl: vinylBlend })
  }
  watch(options.canvasTheme, syncMaterialAppearance)

  function onMotionPreferenceChange(): void {
    motionReduced.value = reducedMotion.matches
    settleInfo()
    if (reducedMotion.matches) {
      options.reduceBrowsingPlaybackMotion()
      setDiscSurface(discSurface.value)
      moveSurfaceIndicator(false)
    }
  }

  function moveSurfaceIndicator(animate: boolean): void {
    const group = surfaceSwitchRef.value
    const line = surfaceIndicatorRef.value
    const button = group?.querySelector<HTMLElement>('button[aria-pressed="true"]')
    moveSurfaceIndicatorAnimation(surfaceIndicatorMotion, {
      group,
      line,
      targetButton: button ?? null,
      animate,
      reducedMotion: reducedMotion.matches,
    })
  }

  watch(discSurface, () => moveSurfaceIndicator(true), { flush: 'post' })
  watch(
    surfaceSwitchRef,
    (element, _, onCleanup) => {
      if (!element) return
      moveSurfaceIndicator(false)
      const observer = new ResizeObserver(() => moveSurfaceIndicator(false))
      observer.observe(element)
      onCleanup(() => {
        observer.disconnect()
        resetSurfaceIndicator(surfaceIndicatorMotion)
      })
    },
    { flush: 'post' },
  )

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (target instanceof HTMLElement &&
        (target.matches('input, textarea, select') ||
          target.isContentEditable ||
          target.closest('[role="menu"], [role="dialog"]')))
    ) {
      controller?.stopKeyboardNavigation()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      controller?.stopKeyboardNavigation()
    if (event.key === 'Escape' && focused.value) {
      event.preventDefault()
      event.stopPropagation()
      back()
      return
    }
    if (focused.value) return
    if (event.key === 'Enter' && event.target === stageRef.value) {
      event.preventDefault()
      controller?.setFocused(true)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat && !options.isLoading() && !options.hasFailed() && !starting.value) {
      controller?.startKeyboardNavigation(event.key === 'ArrowRight' ? 1 : -1)
    }
  }

  function onBrowseFocusOut(event: FocusEvent): void {
    const target = event.relatedTarget
    if (target instanceof Node && pageRef.value?.contains(target)) return
    controller?.stopKeyboardNavigation()
  }

  function syncPlaybackRing(): void {
    controller?.setPlayback(options.playbackRing())
  }

  function mount(): boolean {
    if (!stageRef.value) return false
    reducedMotion.addEventListener('change', onMotionPreferenceChange)
    window.addEventListener('resize', settleInfo)
    controller = createCdStage(
      stageRef.value,
      (index) => {
        selected.value = index
        infoSelected.value = index
      },
      (index) => {
        infoSelected.value = index
      },
      (running) => {
        starting.value = running
      },
      setRapidBrowse,
      {
        geometry: () => {
          const stage = stageRef.value!.getBoundingClientRect()
          const page = pageRef.value!.getBoundingClientRect()
          // offsetLeft is unaffected by the panel's entry transform.
          return {
            cx: page.left + page.width / 2 - stage.left,
            cy: page.top + page.height / 2 - stage.top,
            rightBoundary: trackPanelRef.value!.offsetLeft,
          }
        },
        change: focusChange,
        togglePlayback: options.togglePlayback,
      },
    )
    syncMaterialAppearance()
    syncPlaybackRing()
    stopPlaybackRingWatch = watch(options.playbackRing, syncPlaybackRing)
    if (!document.activeElement?.closest('.cd-view-switch')) {
      stageRef.value.focus({ preventScroll: true })
    }
    return true
  }

  function dispose(leaving: boolean): void {
    // Disposal removes imperative disc nodes before Vue finishes its leave fade.
    // Keep inert copies for that short visual tail; all controllers still stop now.
    const departingDiscs =
      leaving && !reducedMotion.matches
        ? Array.from(stageRef.value?.children ?? [], (node) => node.cloneNode(true))
        : []
    // cloneNode does not copy the WebGL backing buffer. The inert leave tail uses CSS.
    for (const node of departingDiscs) {
      if (!(node instanceof Element)) continue
      node.querySelectorAll('.cd-material-canvas').forEach((canvas) => canvas.remove())
      node
        .querySelectorAll('[data-material-ready]')
        .forEach((disc) => disc.removeAttribute('data-material-ready'))
    }
    if (leaving && pageRef.value) pageRef.value.inert = true
    settleInfo()
    cancelSurfaceAnimation?.()
    cancelSurfaceAnimation = null
    reducedMotion.removeEventListener('change', onMotionPreferenceChange)
    window.removeEventListener('resize', settleInfo)
    stopPlaybackRingWatch?.()
    stopPlaybackRingWatch = null
    controller?.dispose()
    controller = null
    stageRef.value?.append(...departingDiscs)
  }

  return {
    pageRef,
    stageRef,
    trackPanelRef,
    controlsRef,
    surfaceSwitchRef,
    surfaceIndicatorRef,
    focused,
    focusSettled,
    selected,
    infoSelected,
    starting,
    repeatEntry,
    discSurface,
    motionReduced,
    presentAlbums,
    restoreBrowseFocus,
    returnToBrowse,
    focusAlbum,
    setDiscSurface,
    onKeydown,
    onBrowseFocusOut,
    mount,
    dispose,
    setVibrationOffset: (offset: number) => controller?.setVibrationOffset(offset),
  }
}
