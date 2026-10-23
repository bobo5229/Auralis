<script setup lang="ts">
import '../styles/cdTypography.css'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { splitDelimitedValues } from '@renderer/features/library/utils/formatDelimitedValues'
import {
  formatPlaybackClock,
  PLAYBACK_CLOCK_EMPTY,
} from '@renderer/features/playback/utils/formatPlaybackClock'
import { cdAlbumCatalogSession } from '../composables/cdAlbumCatalogSession'
import { useCdAlbumLoadSession } from '../composables/useCdAlbumLoadSession'
import { useCdInfoTransition } from '../composables/useCdInfoTransition'
import {
  cdFocusBackTarget,
  isCdAlbumIndexSource,
  shouldShowCdFocusedPlayback,
} from '../utils/cdAlbumIndex'
import { clearCdIndexReturn } from '../utils/cdAlbumIndexReturn'
import {
  moveSurfaceIndicator as moveSurfaceIndicatorAnimation,
  resetSurfaceIndicator,
  type CdSurfaceIndicatorMotionState,
} from '../utils/cdSurfaceIndicator'
import { useCdViewSwitchVisibility } from '../composables/useCdViewSwitchVisibility'
import CdSpectrumPreview from '../components/CdSpectrumPreview.vue'
import { albumIdentityKey } from '../utils/albumIdentity'
import {
  buildCdPlaybackPlan,
  getNextCdPlaybackMode,
  type CdPlaybackMode,
} from '../utils/cdPlaybackQueue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlaybackSpectrum } from '@renderer/features/playback/composables/usePlaybackSpectrum'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'
import { createCdVibrationMotion } from '../utils/cdVibrationMotion'
import { useCdVibration } from '../composables/useCdVibration'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import CdTrackList from '../components/CdTrackList.vue'
import CdFocusLyrics from '../components/CdFocusLyrics.vue'
import { createCdStage } from '../utils/cdStageController'
import { useCdCanvasTheme } from '../composables/useCdCanvasTheme'
import { useCdCanvasColors } from '../composables/useCdCanvasColors'
import { formatCdAccent } from '../utils/cdAccent'
import { presentCdTrackComposers } from '../utils/cdTrackComposers'
import { animateProgress } from '@renderer/shared/animation/motion'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const requestedAlbumKey =
  typeof route.query.artist === 'string' && typeof route.query.title === 'string'
    ? albumIdentityKey(route.query.artist, route.query.title)
    : null
const fromIndex = computed(() => isCdAlbumIndexSource(route.query.from))
const fromIndexViewSwitch = route.query.entry === 'index'
const playback = usePlayback()
const { cdCanvasTheme, setCdCanvasTheme } = useCdCanvasTheme()
const themeToggleLabel = computed(() =>
  t(cdCanvasTheme.value === 'dark' ? 'albums.cd.theme.toLight' : 'albums.cd.theme.toDark'),
)
const themeTooltip = computed(() => t(`albums.cd.theme.${cdCanvasTheme.value}`))
const pageRef = ref<HTMLElement | null>(null)
const trackPanelRef = ref<HTMLElement | null>(null)
const controlsRef = ref<HTMLElement | null>(null)
const focusedPlaybackFrameRef = ref<HTMLElement | null>(null)
const focused = ref(false)
const { cdVibrationEnabled, toggleCdVibration, cdVibrationStyle, setCdVibrationStyle } =
  useCdVibration()
const vibrationToggleLabel = computed(() =>
  t(cdVibrationEnabled.value ? 'albums.cd.vibration.turnOff' : 'albums.cd.vibration.turnOn'),
)
const vibrationTooltip = computed(() =>
  cdVibrationEnabled.value
    ? t(`albums.cd.vibration.${cdVibrationStyle.value}`)
    : t('albums.cd.vibration.disabled'),
)
function handleVibrationContextMenu(): void {
  if (!cdVibrationEnabled.value) {
    toggleCdVibration()
    return
  }
  setCdVibrationStyle(cdVibrationStyle.value === 'smooth' ? 'elastic' : 'smooth')
}
const focusSettled = ref(false)
const cdMode = ref<CdPlaybackMode>('catalog-sequential')
const discSurface = ref<'cd' | 'vinyl'>('cd')
const surfaceSwitchRef = ref<HTMLElement | null>(null)
const surfaceIndicatorRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const { albumInfo, loading, failed, count, repeatEntry, loadAlbums } = useCdAlbumLoadSession({
  catalogSession: cdAlbumCatalogSession,
  claimStartupEntry: () => auralis.app.claimCdStartupEntry(),
  getController: () => controller,
  requestedAlbumKey,
  fromIndexViewSwitch,
  stageRef,
  isDisposed: () => disposed,
})
const selected = ref(0)
const focusedAlbum = computed(() => albumInfo.value[selected.value] ?? null)
const focusedComposer = computed(() => {
  if (!focusSettled.value || displayedAlbum.value?.key !== focusedAlbum.value?.key) return null
  const trackId = playback.state.currentTrackId
  if (trackId === null) return null
  const track = focusedAlbum.value?.tracks.find((item) => item.id === trackId)
  return presentCdTrackComposers(track?.composer)
})
const browsingPlaybackAlbumIndex = computed(() => {
  const trackId = playback.state.currentTrackId
  if (trackId === null) return -1
  return albumInfo.value.findIndex((album) => album.tracks.some((track) => track.id === trackId))
})
const ringTrackMatches = computed(() => {
  const trackId = playback.state.currentTrackId
  return (
    trackId !== null && Boolean(focusedAlbum.value?.tracks.some((track) => track.id === trackId))
  )
})
const ringArtworkKey = computed(() =>
  ringTrackMatches.value ? (playback.state.currentTrack?.artworkCacheKey ?? null) : null,
)
const { palette: ringPalette } = useArtworkPalette(ringArtworkKey, {
  enabled: ringTrackMatches,
})
const ringAccent = computed(() => {
  const accent = ringPalette.value.accents[0]?.rgb
  const rgb = ringPalette.value.quality === 'fallback' || !accent ? null : accent
  return formatCdAccent(rgb, cdCanvasTheme.value === 'dark')
})

function playCdTrack(id: number): void {
  const tracks = focusedAlbum.value?.tracks
  if (!tracks?.some((track) => track.id === id)) return
  const plan = buildCdPlaybackPlan(albumInfo.value, id, cdMode.value)
  if (!plan) return
  void playback.playTrackFromQueue(plan.queue, id, {
    source: 'cd',
    shufflePool: plan.shufflePool,
    shuffleCycle: plan.shuffleCycle,
    playbackMode: plan.playbackMode,
    replaceHistory: true,
  })
}
function cycleMode(): void {
  cdMode.value = getNextCdPlaybackMode(cdMode.value)
  const currentTrackId = playback.state.currentTrackId
  const session = playback.queueSession.value
  if (currentTrackId === null || session?.source !== 'cd') {
    return
  }
  const plan = buildCdPlaybackPlan(albumInfo.value, currentTrackId, cdMode.value)
  if (!plan) {
    return
  }
  playback.replaceCurrentPlaybackQueue({
    expectedSessionId: session.id,
    expectedTrackId: currentTrackId,
    expectedQueueTrackIds: playback.state.queue.map((track) => track.id),
    queue: plan.queue,
    playbackMode: plan.playbackMode,
    shufflePool: plan.shufflePool,
    shuffleCycle: plan.shuffleCycle,
  })
}
function returnToBrowse(): void {
  controller?.setFocused(false)
}

function returnToIndex(): void {
  void router.push({ name: 'cd-album-index' })
}

function back(): void {
  const target = cdFocusBackTarget(focused.value)
  if (target === 'browse') {
    returnToBrowse()
    return
  }
  clearCdIndexReturn()
  void router.push({ name: 'albums' })
}
function focusBrowsingPlaybackAlbum(): void {
  if (browsingPlaybackAlbumIndex.value < 0 || loading.value || starting.value || focused.value)
    return
  controller?.focusAlbum(browsingPlaybackAlbumIndex.value)
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
  if (settled && !disposed && progress !== 1) stageRef.value?.focus({ preventScroll: true })
}
const infoRef = ref<HTMLElement | null>(null)
const starting = ref(false)
useCdViewSwitchVisibility(computed(() => !focused.value && !starting.value))
useCdCanvasColors(pageRef, cdCanvasTheme, () =>
  ringTrackMatches.value &&
  ringPalette.value.key === ringArtworkKey.value &&
  ringPalette.value.quality !== 'fallback'
    ? (ringPalette.value.accents[0]?.rgb ?? null)
    : null,
)
const infoSelected = ref(0)
const currentAlbum = computed(() => albumInfo.value[infoSelected.value] ?? null)
const { displayedAlbum, infoSuppressed, transitionInfo, settleInfo, setRapidBrowse } =
  useCdInfoTransition({
    currentAlbum,
    infoRef,
    reducedMotion: () => reducedMotion.matches,
    isDisposed: () => disposed,
  })
const displayedCopyrightValues = computed(() =>
  splitDelimitedValues(displayedAlbum.value?.copyright),
)
const playbackInformation = computed(() => {
  const track = playback.state.currentTrack
  if (!track) return null
  const title = track.title?.trim() || t('albums.detail.unknownTitle')
  const artist = formatArtist(track.artist)
  return {
    song: artist ? `${title} - ${artist}` : title,
    album: track.album?.trim() ?? '',
  }
})
const browsingPlayback = computed(() => (focused.value ? null : playbackInformation.value))
const browsingPlaybackCurrentTime = computed(() => formatPlaybackClock(playback.state.currentTime))
const browsingPlaybackDuration = computed(() =>
  playback.state.duration > 0 ? formatPlaybackClock(playback.state.duration) : PLAYBACK_CLOCK_EMPTY,
)
const focusedPlaybackIdentity = computed(() => {
  const track = playback.state.currentTrack
  const album = focusedAlbum.value
  if (
    !shouldShowCdFocusedPlayback(
      focused.value,
      focusSettled.value,
      loading.value,
      failed.value,
      track,
      album,
    ) ||
    !track ||
    !album
  ) {
    return null
  }
  return `${album.key}\u0000${track.id}`
})
const focusedPlayback = computed(() =>
  focusedPlaybackIdentity.value === null ? null : playbackInformation.value,
)
const browsingPlaybackProgress = computed(() => {
  const duration = playback.state.duration
  const currentTime = playback.state.currentTime
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0
  return Math.min(1, Math.max(0, currentTime / duration))
})
const browsingPlaybackProgressPath = [
  'M 2 6.2 C 18 6.4, 22 4.8, 39 5.1',
  'C 55 5.4, 61 7, 78 6.4 C 96 5.6, 102 4.4, 119 5',
  'C 135 5.7, 144 6.9, 160 6.1 C 178 5.2, 182 4.7, 198 5.4',
  'C 214 6.2, 226 6.7, 238 5.7',
].join(' ')
const browsingPlaybackRef = ref<HTMLElement | null>(null)
const focusedPlaybackInfoVisible = ref(false)
let focusedPlaybackInfoTimer: ReturnType<typeof setTimeout> | null = null

function clearFocusedPlaybackInfoTimer(): void {
  if (focusedPlaybackInfoTimer !== null) {
    clearTimeout(focusedPlaybackInfoTimer)
    focusedPlaybackInfoTimer = null
  }
}

function showFocusedPlaybackInfo(duration: number | null): void {
  const identity = focusedPlaybackIdentity.value
  if (identity === null) return
  clearFocusedPlaybackInfoTimer()
  focusedPlaybackInfoVisible.value = true
  if (duration === null) return
  focusedPlaybackInfoTimer = setTimeout(() => {
    focusedPlaybackInfoTimer = null
    if (!disposed && focusedPlaybackIdentity.value === identity) {
      focusedPlaybackInfoVisible.value = false
    }
  }, duration)
}

function toggleFocusedPlaybackInfo(): void {
  if (focusedPlaybackInfoVisible.value) {
    clearFocusedPlaybackInfoTimer()
    focusedPlaybackInfoVisible.value = false
    return
  }
  showFocusedPlaybackInfo(null)
}

watch(focusedPlaybackIdentity, async (identity) => {
  clearFocusedPlaybackInfoTimer()
  if (identity === null) {
    focusedPlaybackInfoVisible.value = false
    return
  }
  focusedPlaybackInfoVisible.value = false
  await nextTick()
  if (!disposed && focusedPlaybackIdentity.value === identity) {
    if (reducedMotion.matches) {
      showFocusedPlaybackInfo(4_000)
    } else {
      focusedPlaybackFrameRef.value?.getBoundingClientRect()
      showFocusedPlaybackInfo(4_000)
    }
  }
})

const reducedMotion = createReducedMotionQuery()
const motionReduced = ref(reducedMotion.matches)
let vinylBlend = 0
let cancelSurfaceAnimation: (() => void) | null = null
const surfaceIndicatorMotion: CdSurfaceIndicatorMotionState = {
  edges: null,
  cancelAnimation: null,
}
let cancelBrowsingPlaybackAnimation: (() => void) | null = null
let controller: ReturnType<typeof createCdStage> | null = null
let unsubscribe: (() => void) | null = null
let disposed = false
const spectrumFrame = shallowRef<PlaybackSpectrumFrame | null>(null)
const vibration = createCdVibrationMotion(
  (offset) => controller?.setVibrationOffset(offset),
  () => cdVibrationStyle.value,
)
const spectrumActive = computed(
  () =>
    focusSettled.value &&
    ringTrackMatches.value &&
    !loading.value &&
    !failed.value &&
    !motionReduced.value &&
    (cdVibrationEnabled.value || route.query.spectrum === '1'),
)
usePlaybackSpectrum({
  enabled: spectrumActive,
  onFrame(frame) {
    if (route.query.spectrum === '1') spectrumFrame.value = frame
    if (cdVibrationEnabled.value && spectrumActive.value) vibration.receive(frame)
    else vibration.stop()
  },
})
watch([cdVibrationEnabled, spectrumActive, cdVibrationStyle], () => vibration.stop(), {
  flush: 'sync',
})

watch(
  browsingPlaybackRef,
  (element, _, onCleanup) => {
    if (!element) return
    element.style.opacity = '0'
    if (reducedMotion.matches) {
      element.style.opacity = '1'
      return
    }
    const cancel = animateProgress(
      1500,
      (progress) => {
        element.style.opacity = String(progress)
      },
      () => {
        element.style.opacity = '1'
        cancelBrowsingPlaybackAnimation = null
      },
    )
    cancelBrowsingPlaybackAnimation = cancel
    onCleanup(() => {
      cancel()
      if (cancelBrowsingPlaybackAnimation === cancel) cancelBrowsingPlaybackAnimation = null
    })
  },
  { flush: 'post' },
)

function toggleCdCanvasTheme(): void {
  const nextTheme = cdCanvasTheme.value === 'dark' ? 'light' : 'dark'
  const transitionDocument = document as Document & {
    startViewTransition?: (update: () => void | Promise<void>) => unknown
  }

  if (createReducedMotionQuery().matches || !transitionDocument.startViewTransition) {
    setCdCanvasTheme(nextTheme)
    return
  }

  transitionDocument.startViewTransition(() => {
    setCdCanvasTheme(nextTheme)
    return nextTick()
  })
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
  controller?.setMaterialAppearance({ dark: cdCanvasTheme.value === 'dark', vinyl: vinylBlend })
}
watch(cdCanvasTheme, syncMaterialAppearance)

function onMotionPreferenceChange(): void {
  motionReduced.value = reducedMotion.matches
  settleInfo()
  if (reducedMotion.matches) {
    cancelBrowsingPlaybackAnimation?.()
    cancelBrowsingPlaybackAnimation = null
    if (browsingPlaybackRef.value) browsingPlaybackRef.value.style.opacity = '1'
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

function syncPlaybackRing(): void {
  const duration = playback.state.duration
  controller?.setPlayback({
    visible: focusSettled.value && ringTrackMatches.value,
    playing: playback.state.isPlaying,
    progress: Number.isFinite(duration) && duration > 0 ? playback.state.currentTime / duration : 0,
    accent: `var(--cd-wave-accent, ${ringAccent.value})`,
  })
}

watch(
  [
    focusSettled,
    ringTrackMatches,
    () => playback.state.isPlaying,
    () => playback.state.currentTime,
    () => playback.state.duration,
    ringAccent,
  ],
  syncPlaybackRing,
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
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') controller?.stopKeyboardNavigation()
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
  if (!event.repeat && !loading.value && !failed.value && !starting.value) {
    controller?.startKeyboardNavigation(event.key === 'ArrowRight' ? 1 : -1)
  }
}

function onBrowseFocusOut(event: FocusEvent): void {
  const target = event.relatedTarget
  if (target instanceof Node && pageRef.value?.contains(target)) return
  controller?.stopKeyboardNavigation()
}

watch([currentAlbum, infoSuppressed], ([album, suppressed], [, wasSuppressed]) => {
  if (!suppressed) void transitionInfo(album, wasSuppressed)
})
onMounted(() => {
  if (!stageRef.value) return
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
      togglePlayback: () => {
        if (!ringTrackMatches.value || loading.value || failed.value) return false
        void playback.togglePlayPause()
        return true
      },
    },
  )
  syncMaterialAppearance()
  syncPlaybackRing()
  if (!document.activeElement?.closest('.cd-view-switch')) {
    stageRef.value.focus({ preventScroll: true })
  }
  unsubscribe = cdAlbumCatalogSession.subscribe(() => {
    void loadAlbums()
  })
  void loadAlbums()
})

onBeforeUnmount(() => {
  disposed = true
  vibration.stop()
  clearFocusedPlaybackInfoTimer()
  unsubscribe?.()
  const routeName = router.currentRoute.value.name
  // Disposal removes imperative disc nodes before Vue finishes its leave fade.
  // Keep inert copies for that short visual tail; all controllers still stop now.
  const departingDiscs =
    routeName !== 'cd-albums' && !reducedMotion.matches
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
  if (routeName !== 'cd-albums' && pageRef.value) pageRef.value.inert = true
  if (routeName !== 'cd-albums' && routeName !== 'cd-album-index') {
    cdAlbumCatalogSession.clear()
    clearCdIndexReturn()
  }
  settleInfo()
  cancelSurfaceAnimation?.()
  cancelSurfaceAnimation = null
  reducedMotion.removeEventListener('change', onMotionPreferenceChange)
  window.removeEventListener('resize', settleInfo)
  controller?.dispose()
  controller = null
  stageRef.value?.append(...departingDiscs)
})
</script>

<template>
  <section
    ref="pageRef"
    class="cd-page"
    :class="{
      'cd-page--loading': loading && !count && !failed,
      'cd-page--starting': starting,
      'cd-page--focused': focused,
      'cd-page--entry-fade': repeatEntry && !fromIndexViewSwitch && !loading && !failed,
    }"
    :data-theme="cdCanvasTheme"
    :aria-label="t('albums.cd.title')"
    @keydown="onKeydown"
    @focusout="onBrowseFocusOut"
  >
    <header class="cd-header">
      <nav
        v-if="focused && fromIndex"
        class="cd-focus-nav"
        :aria-label="t('albums.cd.returnToBrowse')"
      >
        <button type="button" class="cd-focus-nav-button" @click="returnToBrowse">
          {{ t('albums.cd.focusReturnBrowse') }}
        </button>
        <span class="cd-focus-nav-separator" aria-hidden="true">/</span>
        <button type="button" class="cd-focus-nav-button" @click="returnToIndex">
          {{ t('albums.cd.focusReturnIndex') }}
        </button>
      </nav>
      <button
        v-else
        type="button"
        class="cd-back"
        :aria-label="t(focused ? 'albums.cd.returnToBrowse' : 'albums.detail.returnToAlbums')"
        @click="back"
      >
        <span :class="focused ? 'i-lucide-chevron-left' : 'i-lucide-x'" aria-hidden="true"></span>
      </button>
      <div
        v-if="focused"
        ref="surfaceSwitchRef"
        class="cd-surface-switch"
        role="group"
        :aria-label="t('albums.cd.surface.label')"
      >
        <button type="button" :aria-pressed="discSurface === 'cd'" @click="setDiscSurface('cd')">
          {{ t('albums.cd.surface.cd') }}
        </button>
        <button
          type="button"
          :aria-pressed="discSurface === 'vinyl'"
          @click="setDiscSurface('vinyl')"
        >
          {{ t('albums.cd.surface.vinyl') }}
        </button>
        <span ref="surfaceIndicatorRef" class="cd-surface-indicator" aria-hidden="true"></span>
      </div>
    </header>
    <div class="cd-content">
      <aside
        v-if="displayedAlbum && !loading && !failed"
        ref="infoRef"
        class="cd-info"
        :class="{
          'cd-info--suppressed': infoSuppressed,
          'cd-info--with-composer': focusedComposer,
        }"
        :aria-hidden="infoSuppressed"
        :aria-label="t('albums.cd.information')"
      >
        <div class="cd-info-title-row">
          <h1 class="cd-info-title" dir="auto">{{ displayedAlbum.title }}</h1>
          <span class="cd-info-count">{{
            t('albums.cd.trackCount', { count: displayedAlbum.trackCount })
          }}</span>
        </div>
        <dl class="cd-info-fields">
          <div class="cd-info-row">
            <dt>{{ t('albums.cd.artist') }}</dt>
            <dd dir="auto">{{ formatArtist(displayedAlbum.artist) }}</dd>
          </div>
          <div v-if="displayedAlbum.releaseDate" class="cd-info-row">
            <dt>{{ t('albums.cd.releaseDate') }}</dt>
            <dd class="cd-info-date">{{ displayedAlbum.releaseDate }}</dd>
          </div>
          <div v-if="displayedAlbum.copyright" class="cd-info-row cd-info-copyright">
            <dt>{{ t('albums.cd.copyright') }}</dt>
            <dd dir="auto">
              <span
                v-for="(value, index) in displayedCopyrightValues"
                :key="`${index}-${value}`"
                class="cd-info-copyright-value"
              >
                {{ value }}
              </span>
            </dd>
          </div>
          <div v-if="focusedComposer" class="cd-info-row cd-info-composer">
            <dt>{{ t('albums.cd.composer.label') }}</dt>
            <dd dir="auto">
              <span
                v-for="(name, index) in focusedComposer"
                :key="`${index}-${name}`"
                class="cd-composer-name"
              >
                {{ name }}
              </span>
            </dd>
          </div>
        </dl>
      </aside>
      <div
        v-if="
          browsingPlayback && displayedAlbum && !loading && !failed && !starting && !infoSuppressed
        "
        ref="browsingPlaybackRef"
        class="cd-browsing-playback"
        role="status"
      >
        <div class="cd-browsing-playback-heading">
          <button
            type="button"
            class="cd-browsing-playback-toggle"
            :aria-label="t(playback.state.isPlaying ? 'player.pause' : 'player.play')"
            @click="playback.togglePlayPause()"
          >
            <span
              :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            ></span>
          </button>
          <span class="cd-browsing-playback-song" :title="browsingPlayback.song" dir="auto">{{
            browsingPlayback.song
          }}</span>
        </div>
        <button
          v-if="browsingPlayback.album"
          type="button"
          class="cd-browsing-playback-album"
          :disabled="browsingPlaybackAlbumIndex < 0"
          :title="browsingPlayback.album"
          @click="focusBrowsingPlaybackAlbum"
        >
          <span class="cd-browsing-playback-album-name" dir="auto">{{
            browsingPlayback.album
          }}</span>
          <span class="i-lucide-arrow-up-right h-3 w-3 shrink-0" aria-hidden="true"></span>
        </button>
        <div class="cd-browsing-playback-timeline">
          <span class="cd-browsing-playback-time" dir="ltr">{{ browsingPlaybackCurrentTime }}</span>
          <svg
            class="cd-browsing-playback-progress"
            viewBox="0 0 240 12"
            aria-hidden="true"
            focusable="false"
          >
            <path
              :d="browsingPlaybackProgressPath"
              fill="none"
              stroke="var(--cd-border-row)"
              stroke-width="1.4"
              stroke-linecap="round"
            />
            <path
              :d="browsingPlaybackProgressPath"
              pathLength="100"
              :stroke-dasharray="`${browsingPlaybackProgress * 100} 100`"
              fill="none"
              stroke="var(--cd-progress-fill)"
              stroke-width="1.7"
              stroke-linecap="round"
            />
          </svg>
          <span class="cd-browsing-playback-time cd-browsing-playback-time--duration" dir="ltr">{{
            browsingPlaybackDuration
          }}</span>
        </div>
      </div>
      <div
        ref="stageRef"
        class="cd-stage"
        :class="{ 'cd-stage--unavailable': loading || failed || !count }"
        :tabindex="loading || failed || !count ? -1 : 0"
        role="region"
        :aria-label="t('albums.cd.stage')"
        :aria-busy="loading || starting"
      ></div>
      <section
        ref="trackPanelRef"
        class="cd-tracks"
        :inert="!focusSettled"
        :aria-hidden="!focused"
        :aria-label="t('albums.cd.tracks')"
      >
        <CdTrackList
          v-if="focused && focusedAlbum"
          :tracks="focusedAlbum.tracks"
          :album-artist="focusedAlbum.artist"
          :mode="cdMode"
          :current-track-id="playback.state.currentTrackId"
          :is-playing="playback.state.isPlaying"
          @play="playCdTrack"
          @mode="cycleMode"
        />
        <p v-if="playback.state.error" class="cd-playback-error" role="alert">
          {{ playback.state.error }}
        </p>
      </section>
      <CdFocusLyrics
        :active="focusSettled && ringTrackMatches && !loading && !failed"
        accent="var(--cd-lyrics-color)"
        :stage="stageRef"
        :information="infoRef"
        :tracks="trackPanelRef"
      />
      <div
        v-if="focusedPlayback"
        ref="focusedPlaybackFrameRef"
        class="cd-focused-playback"
        :class="{ 'cd-focused-playback--expanded': focusedPlaybackInfoVisible }"
      >
        <button
          type="button"
          class="cd-focused-playback-handle"
          :aria-label="t('playback.nowPlaying')"
          :aria-expanded="focusedPlaybackInfoVisible"
          @click="toggleFocusedPlaybackInfo"
        >
          <span
            class="cd-focused-playback-chevron i-lucide-chevron-right h-4 w-4"
            aria-hidden="true"
          ></span>
        </button>
        <Transition name="cd-focused-playback-fade" appear>
          <div
            v-if="focusedPlaybackInfoVisible"
            class="cd-focused-playback-info"
            :aria-hidden="!focusedPlaybackInfoVisible"
            role="status"
          >
            <span class="cd-browsing-playback-song" dir="auto">{{ focusedPlayback.song }}</span>
            <span class="cd-focused-playback-album" dir="auto">{{ focusedPlayback.album }}</span>
            <svg
              class="cd-browsing-playback-progress cd-focused-playback-progress"
              viewBox="1.15 3.4 237.7 4.6"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                :d="browsingPlaybackProgressPath"
                fill="none"
                stroke="var(--cd-border-row)"
                stroke-width="1.4"
                stroke-linecap="round"
              />
              <path
                :d="browsingPlaybackProgressPath"
                pathLength="100"
                :stroke-dasharray="`${browsingPlaybackProgress * 100} 100`"
                fill="none"
                stroke="var(--cd-progress-fill)"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
          </div>
        </Transition>
      </div>
      <div v-if="loading || failed || !count" class="cd-status" role="status">
        <template v-if="failed">
          <p>{{ t('albums.status.loadError') }}</p>
          <button type="button" @click="loadAlbums">{{ t('albums.status.retry') }}</button>
        </template>
        <p v-else>{{ t(loading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
      </div>
    </div>
    <footer ref="controlsRef" class="cd-controls" :inert="starting || focused">
      <span class="sr-only" role="status" aria-live="polite">
        {{ count ? t('albums.cd.position', { index: selected + 1, total: count }) : '' }}
      </span>
    </footer>
    <button
      v-tooltip.feedback="themeTooltip"
      type="button"
      class="cd-theme-toggle"
      :aria-label="themeToggleLabel"
      @click="toggleCdCanvasTheme"
    >
      <span
        v-if="cdCanvasTheme === 'dark'"
        class="i-lucide-sun cd-control-icon"
        aria-hidden="true"
      ></span>
      <span v-else class="i-lucide-moon cd-control-icon" aria-hidden="true"></span>
    </button>
    <CdSpectrumPreview v-if="route.query.spectrum === '1'" :frame="spectrumFrame" />
    <button
      v-if="focused && !starting"
      v-tooltip.feedback="vibrationTooltip"
      type="button"
      class="cd-vibration-toggle"
      :aria-label="vibrationToggleLabel"
      :aria-pressed="cdVibrationEnabled"
      @click="toggleCdVibration"
      @contextmenu.prevent="handleVibrationContextMenu"
    >
      <span class="i-lucide-vibrate cd-control-icon" aria-hidden="true"></span>
    </button>
  </section>
</template>

<style scoped>
.cd-page--entry-fade {
  /* Begin when catalog loading finishes, even if the route fade has already ended. */
  animation: cd-ready-entry-fade 240ms ease-out;
}
@keyframes cd-ready-entry-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
:where([data-reduced-motion='true']) .cd-page--entry-fade {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .cd-page--entry-fade {
    animation: none;
  }
}

.cd-page--loading .cd-content > :not(.cd-status),
.cd-page--loading > :not(.cd-header):not(.cd-content) {
  visibility: hidden;
}
.cd-tracks {
  position: absolute;
  right: 32px;
  top: 32px;
  bottom: 32px;
  height: max-content;
  max-height: min(560px, calc(100% - 64px));
  margin-block: auto;
  width: min(320px, 23vw);
  min-height: 0;
  min-width: 0;
  z-index: 6;
  opacity: 0;
  visibility: hidden;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color-scheme: inherit;
}
.cd-tracks :deep(.cd-track-panel) {
  flex: 0 1 auto;
  min-height: 0;
}
.cd-playback-error {
  flex: 0 0 auto;
  font-size: var(--cd-type-error-size);
  line-height: var(--cd-type-error-line-height);
  color: var(--cd-error, #8c4034);
}
@media (max-width: 800px) {
  .cd-tracks {
    right: 20px;
    width: 24vw;
  }
}
.cd-info--suppressed {
  visibility: hidden;
  pointer-events: none;
}
.cd-info,
.cd-controls,
.cd-theme-toggle {
  transition: opacity 300ms ease;
}
.cd-page--starting .cd-info,
.cd-page--starting .cd-controls,
.cd-page--starting .cd-theme-toggle {
  opacity: 0;
  pointer-events: none;
  transition: none;
}
.cd-stage :deep(.cd-startup-vinyl) {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: 50%;
  pointer-events: none;
  will-change: opacity;
  background:
    radial-gradient(circle, #272727 0 15%, transparent 15.5%),
    conic-gradient(
      from 25deg,
      transparent,
      #ffffff18,
      transparent 22%,
      #0008 40%,
      #ffffff20 58%,
      transparent 75%
    ),
    repeating-radial-gradient(circle, #171717 0 1px, #292929 1.4px 1.8px, #131313 2.2px 3px);
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-startup-vinyl) {
  background:
    radial-gradient(circle, #1a1a1a 0 15%, transparent 15.5%),
    conic-gradient(
      from 25deg,
      transparent,
      #ffffff22,
      transparent 22%,
      #000a 40%,
      #ffffff28 58%,
      transparent 75%
    ),
    repeating-radial-gradient(circle, #0e0e0e 0 1px, #2a2a2a 1.4px 1.8px, #0a0a0a 2.2px 3px);
}
:where([data-reduced-motion='true']) .cd-info,
:where([data-reduced-motion='true']) .cd-controls,
:where([data-reduced-motion='true']) .cd-theme-toggle {
  transition: none;
}
/* CD canvas is local to this page. Light values match the approved demo. */
.cd-page {
  --cd-control-icon-size: 20px;
  --auralis-playbar-safe-area: 0px;
  --cd-bg: #eeeeec;
  --cd-bg-image: none;
  --cd-text: #292929;
  --cd-text-muted: #62625b;
  --cd-lyrics-color: var(--cd-text-muted);
  --cd-text-subtle: #64645d;
  --cd-text-faint: #85857d;
  --cd-text-count: #55554f;
  --cd-text-browsing: #42423d;
  --cd-text-album: #6f6f67;
  --cd-border: #bdbdb9;
  --cd-border-strong: #8e8e88;
  --cd-border-row: #aaa9a3;
  --cd-border-track: #aaa9a333;
  --cd-hover-bg: #e1e1de;
  --cd-focus-ring: #292929;
  --cd-wave-track: #b7b7b0;
  --cd-wave-progress: #62625b;
  --cd-progress-fill: #585753;
  --cd-disc-body: #aaa;
  --cd-disc-rim: #858586;
  --cd-shadow-fill: #3a3b38;
  box-sizing: border-box;
  padding-bottom: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--cd-bg);
  background-image: var(--cd-bg-image);
  color: var(--cd-text);
  color-scheme: light;
  view-transition-name: cd-canvas;
}
.cd-page[data-theme='dark'] {
  --cd-bg: #2b2d30;
  --cd-bg-image: repeating-linear-gradient(
    135deg,
    rgba(224, 226, 230, 0.045) 0 1px,
    transparent 1px 7px
  );
  --cd-text: #e6e4de;
  --cd-text-muted: #a8a69f;
  --cd-text-subtle: #a4a29c;
  --cd-text-faint: #7d7b75;
  --cd-text-count: #b3b1ab;
  --cd-text-browsing: #d4d2cc;
  --cd-text-album: #b0aea8;
  --cd-border: #5c6168;
  --cd-border-strong: #6e737a;
  --cd-border-row: #4a4f56;
  --cd-border-track: rgba(186, 190, 196, 0.2);
  --cd-hover-bg: #35383d;
  --cd-focus-ring: #d8d6d0;
  --cd-wave-track: #7c8188;
  --cd-wave-progress: #c6c4be;
  --cd-progress-fill: #c6c4be;
  --cd-disc-body: #8a9098;
  --cd-disc-rim: #b3b9c1;
  --cd-shadow-fill: #000;
  color-scheme: dark;
}
.cd-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding: 16px 24px 8px;
}
.cd-page button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-size: var(--cd-type-action-size);
  line-height: var(--cd-type-action-line-height);
  color: inherit;
  border: 1px solid var(--cd-border);
  background: transparent;
  border-radius: 3px;
  padding: 10px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.cd-page button:hover:not(:disabled) {
  background: var(--cd-hover-bg);
}
.cd-page button:disabled {
  opacity: 0.4;
  cursor: default;
}
.cd-page button:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}
.cd-surface-switch {
  position: relative;
  grid-column: 2;
  display: inline-flex;
  gap: 24px;
  -webkit-app-region: no-drag;
}
.cd-page .cd-surface-switch button {
  padding: 6px 0;
  font-family: var(--cd-font-text);
  line-height: var(--cd-type-nav-line-height);
  font-size: var(--cd-type-nav-size);
  font-weight: 400;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--cd-text-muted);
}
.cd-page .cd-surface-switch button:hover:not(:disabled) {
  background: transparent;
  color: var(--cd-text);
}
.cd-page .cd-surface-switch button[aria-pressed='true'] {
  color: var(--cd-text);
}
.cd-surface-indicator {
  position: absolute;
  left: 0;
  bottom: 2px;
  width: 0;
  height: 1px;
  border-radius: 999px;
  background: var(--cd-text);
  pointer-events: none;
}
.cd-content {
  position: relative;
  flex: 1;
  min-height: 0;
  container-type: inline-size;
}
.cd-page .cd-back {
  justify-self: start;
  width: 32px;
  height: 32px;
  padding: 0;
  border-color: transparent;
  -webkit-app-region: no-drag;
}
.cd-focus-nav {
  grid-column: 1;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  -webkit-app-region: no-drag;
}
.cd-page .cd-focus-nav-button {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--cd-text-muted);
  font-family: var(--cd-font-text);
  font-size: var(--cd-type-nav-size);
  font-weight: 400;
  line-height: var(--cd-type-nav-line-height);
  cursor: pointer;
  white-space: nowrap;
}
.cd-page .cd-focus-nav-button:hover:not(:disabled) {
  background: transparent;
  box-shadow: none;
  color: var(--cd-text);
}
.cd-page .cd-focus-nav-button:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}
.cd-focus-nav-separator {
  color: var(--cd-text-muted);
  font-family: var(--cd-font-text);
  font-size: var(--cd-type-nav-size);
  font-weight: 400;
  line-height: var(--cd-type-nav-line-height);
  user-select: none;
  pointer-events: none;
}
.cd-info {
  position: absolute;
  top: 8px;
  left: 32px;
  z-index: 5;
  width: min(380px, 31vw);
  max-height: 48%;
  overflow-y: auto;
  scrollbar-width: thin;
  color-scheme: inherit;
}
.cd-info--with-composer {
  max-height: calc(100% - 40px);
}
.cd-info-title-row {
  position: relative;
  box-sizing: border-box;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid transparent;
}
.cd-info-title-row::after,
.cd-info-row + .cd-info-row::before {
  position: absolute;
  right: 0;
  left: 0;
  height: 0;
  content: '';
  opacity: var(--cd-info-divider-progress, 1);
  transform: scaleX(var(--cd-info-divider-progress, 1));
  transform-origin: left center;
  pointer-events: none;
  border-top: 1px solid var(--cd-border-row);
}
.cd-info-title-row::after {
  bottom: 0;
  border-top: 1px solid var(--cd-info-title-border, #292929);
}
.cd-page[data-theme='dark'] .cd-info-title-row::after {
  border-top-color: var(--cd-info-title-border, #c6c4be);
}
.cd-info-row + .cd-info-row::before {
  top: 0;
}
.cd-info-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-bottom: 3px;
  font-family: var(--cd-font-display);
  font-size: var(--cd-type-title-size);
  font-weight: 400;
  font-style: italic;
  font-synthesis: none;
  line-height: var(--cd-type-title-line-height);
  overflow-wrap: anywhere;
}
.cd-info-count {
  flex-shrink: 0;
  padding-bottom: 6px;
  font-family: var(--cd-font-number);
  font-size: var(--cd-type-count-size);
  white-space: nowrap;
  color: var(--cd-text-count);
  line-height: var(--cd-type-count-line-height);
}
.cd-info-fields {
  margin: 0;
}
.cd-browsing-playback {
  position: absolute;
  right: clamp(16px, 2.3cqw, 32px);
  bottom: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(40cqw - 32px));
  max-width: calc(100% - 32px);
  z-index: 4;
  align-items: stretch;
  gap: 8px;
  margin: 0;
  font-family: var(--cd-font-display);
  font-size: var(--cd-type-playback-size);
  line-height: var(--cd-type-playback-line-height);
  color: var(--cd-text-browsing);
  white-space: nowrap;
  pointer-events: none;
}
.cd-browsing-playback-heading {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cd-browsing-playback-heading .cd-browsing-playback-song {
  text-align: right;
}
.cd-page .cd-browsing-playback-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cd-text-browsing);
  pointer-events: auto;
}
.cd-page .cd-browsing-playback-toggle:hover {
  background: transparent;
  color: var(--cd-text);
}
.cd-browsing-playback-toggle:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 2px;
}
.cd-focused-playback {
  --cd-focused-playback-info-width: min(
    356px,
    max(0px, calc(31cqw - 24px)),
    max(0px, calc(32cqw - 84px))
  );
  position: absolute;
  left: 0;
  bottom: 32px;
  z-index: 7;
  box-sizing: border-box;
  width: 24px;
  height: 60px;
  overflow: hidden;
  border: 1px solid var(--cd-border-row);
  border-left: 0;
  pointer-events: none;
  transition: width 460ms cubic-bezier(0.22, 1, 0.36, 1);
}
.cd-focused-playback--expanded {
  width: calc(var(--cd-focused-playback-info-width) + 48px);
}
.cd-focused-playback-chevron {
  transition: transform 460ms cubic-bezier(0.22, 1, 0.36, 1);
}
.cd-focused-playback--expanded .cd-focused-playback-chevron {
  transform: rotate(180deg);
}
.cd-page .cd-focused-playback-handle {
  position: absolute;
  top: -1px;
  right: -1px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  box-sizing: border-box;
  width: 24px;
  min-width: 24px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--cd-text-muted);
  pointer-events: auto;
}
.cd-page .cd-focused-playback-handle:hover:not(:disabled) {
  background: transparent;
  box-shadow: none;
  color: var(--cd-text);
}
.cd-page .cd-focused-playback-handle:focus-visible {
  outline-offset: 2px;
}
.cd-focused-playback-info {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: var(--cd-type-focus-rows);
  align-content: space-between;
  height: 60px;
  padding: 8px 0;
  /* Keep the left column clear of the focused disc as the canvas narrows. */
  width: var(--cd-focused-playback-info-width);
  min-width: 0;
  margin: 0;
  font-family: var(--cd-font-display);
  color: var(--cd-text-browsing);
  pointer-events: none;
}
.cd-focused-playback-fade-enter-active,
.cd-focused-playback-fade-leave-active {
  transition: opacity 180ms ease;
}
.cd-focused-playback-fade-enter-active {
  transition: opacity 460ms cubic-bezier(0.22, 1, 0.36, 1);
}
.cd-focused-playback-fade-enter-from,
.cd-focused-playback-fade-leave-to {
  opacity: 0;
}
.cd-focused-playback-info .cd-browsing-playback-song {
  display: block;
  width: 100%;
  min-width: 0;
  height: var(--cd-type-focus-song-line-height);
  line-height: var(--cd-type-focus-song-line-height);
  margin: 0;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: var(--cd-type-focus-song-size);
  font-family: var(--cd-font-display);
}
.cd-focused-playback-album {
  display: block;
  width: 100%;
  min-width: 0;
  height: var(--cd-type-focus-album-line-height);
  line-height: var(--cd-type-focus-album-line-height);
  margin: 0;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--cd-font-display);
  font-size: var(--cd-type-focus-album-size);
  font-weight: 400;
  font-style: italic;
  font-synthesis: none;
  text-align: center;
  color: var(--cd-text-album);
}
.cd-focused-playback-info .cd-browsing-playback-progress {
  display: block;
  width: 72%;
  height: 5px;
  justify-self: center;
  margin: 0;
  padding: 0;
  overflow: visible;
}
:where([data-reduced-motion='true']) .cd-focused-playback-fade-enter-active,
:where([data-reduced-motion='true']) .cd-focused-playback-fade-leave-active {
  transition: none;
}
:where([data-reduced-motion='true']) .cd-focused-playback {
  transition: none;
}
:where([data-reduced-motion='true']) .cd-focused-playback-chevron {
  transition: none;
}
.cd-browsing-playback-timeline {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 16px;
  line-height: var(--cd-type-time-line-height);
}
.cd-browsing-playback-time {
  min-width: 0;
  overflow: hidden;
  color: var(--cd-text-muted);
  font-family: var(--cd-font-number);
  font-size: var(--cd-type-time-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--cd-type-time-line-height);
  white-space: nowrap;
}
.cd-browsing-playback-time--duration {
  text-align: right;
}
.cd-browsing-playback-timeline .cd-browsing-playback-progress {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: auto;
  margin: 0;
}
.cd-browsing-playback-song {
  width: 100%;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
.cd-page .cd-browsing-playback-album {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: auto;
  cursor: pointer;
  font-family: var(--cd-font-display);
  font-size: var(--cd-type-playback-size);
  font-weight: 400;
  font-style: italic;
  font-synthesis: none;
  line-height: var(--cd-type-playback-album-line-height);
  text-align: right;
  color: var(--cd-text-album);
}
.cd-browsing-playback-album-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-page .cd-browsing-playback-album:hover:not(:disabled) {
  background: transparent;
  box-shadow: none;
  color: var(--cd-text);
  text-decoration: none;
}
.cd-browsing-playback-album:focus-visible:not(:disabled) {
  color: var(--cd-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.cd-browsing-playback-album:disabled {
  cursor: default;
}
.cd-browsing-playback-progress {
  display: block;
  flex: none;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin-top: 4px;
  overflow: visible;
}
.cd-info-row {
  position: relative;
  box-sizing: border-box;
  min-height: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: start;
  gap: 20px;
  padding: 11px 0;
}
.cd-info-row + .cd-info-row {
  border-top: 1px solid transparent;
}
.cd-info-row dt {
  font-family: var(--cd-font-text);
  font-size: var(--cd-type-label-size);
  color: var(--cd-text-muted);
  line-height: var(--cd-type-label-line-height);
}
.cd-info-row dd {
  margin: 0;
  font-family: var(--cd-font-display);
  font-size: var(--cd-type-value-size);
  line-height: var(--cd-type-value-line-height);
  text-align: right;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.cd-info-copyright dd {
  font-size: var(--cd-type-fine-size);
  font-family: var(--cd-font-text);
  line-height: var(--cd-type-fine-line-height);
}
.cd-info-copyright-value {
  display: block;
}
.cd-composer-name {
  display: block;
}
@container (max-width: 600px) {
  .cd-info {
    left: 24px;
    width: min(300px, 31vw);
  }
  .cd-focused-playback {
    left: 0;
    --cd-focused-playback-info-width: min(
      276px,
      max(0px, calc(31cqw - 24px)),
      max(0px, calc(32cqw - 84px))
    );
  }
  .cd-info-title {
    font-size: var(--cd-type-title-compact-size);
    font-family: var(--cd-font-display);
    line-height: var(--cd-type-title-line-height);
  }
}
.cd-stage {
  position: absolute;
  z-index: 1;
  inset: 0;
  /* Discs can extend beyond the stage; the page owns the outer clipping edge. */
  overflow: visible;
  touch-action: pan-y;
  user-select: none;
  /* Keep the stage focusable for keyboard browsing without framing the entire canvas. */
  outline: none;
}
.cd-stage--unavailable {
  visibility: hidden;
}
.cd-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  font-size: var(--cd-type-status-size);
  line-height: var(--cd-type-status-line-height);
  font-family: var(--cd-font-text);
}
.cd-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 16px 24px 24px 64px;
}
.cd-page :deep(.cd-control-icon) {
  display: inline-flex;
  width: var(--cd-control-icon-size);
  height: var(--cd-control-icon-size);
  flex-shrink: 0;
}
.cd-page .cd-theme-toggle {
  position: absolute;
  left: 24px;
  bottom: 24px;
  z-index: 8;
  width: 32px;
  height: 32px;
  padding: 0;
  border-color: transparent;
  color: var(--cd-text-muted);
  -webkit-app-region: no-drag;
}
.cd-page .cd-theme-toggle:hover:not(:disabled) {
  color: var(--cd-text);
  background: transparent;
  box-shadow: none;
}
.cd-page .cd-vibration-toggle {
  padding: 0;
  color: var(--cd-text-muted);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.cd-page .cd-vibration-toggle[aria-pressed='true'] {
  color: var(--cd-text);
}
.cd-page .cd-vibration-toggle:hover:not(:disabled) {
  color: var(--cd-text);
  background: transparent;
  box-shadow: none;
}
.cd-page .cd-vibration-toggle {
  position: absolute;
  left: 72px;
  bottom: 24px;
  z-index: 8;
  width: 32px;
  height: 32px;
  -webkit-app-region: no-drag;
}
:global(::view-transition-group(cd-canvas)) {
  animation-duration: 260ms;
  animation-timing-function: ease-in-out;
}
:global(::view-transition-old(cd-canvas)),
:global(::view-transition-new(cd-canvas)) {
  animation-duration: 260ms;
  animation-timing-function: ease-in-out;
  mix-blend-mode: normal;
}
.cd-stage :deep(.cd-position) {
  position: absolute;
  left: 0;
  top: 0;
  width: 400px;
  height: 400px;
  transform-origin: 0 0;
  pointer-events: none;
}
.cd-stage :deep(.cd-hover) {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  transform: perspective(1100px) rotateX(0deg) rotateY(0deg);
}
.cd-stage :deep(.cd-disc-shadow) {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 400px;
  height: 400px;
  overflow: visible;
  pointer-events: none;
  fill: var(--cd-shadow-fill);
}
.cd-stage :deep(.cd-disc) {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--cd-disc-body);
  isolation: isolate;
  pointer-events: auto;
  mask-image: radial-gradient(circle, transparent 0 6.8%, #000 7.1%);
  box-shadow: inset 0 0 0 2px var(--cd-disc-rim);
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-disc) {
  box-shadow: inset 0 0 0 1.5px var(--cd-disc-rim);
}
.cd-stage :deep(.cd-sidewall) {
  position: absolute;
  inset: 0;
  width: 400px;
  height: 400px;
  overflow: visible;
  pointer-events: none;
}
.cd-stage :deep(.cd-art) {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  overflow: hidden;
  background: conic-gradient(from 35deg, #777d81, #bdc1bf, #666e72, #a7afaf, #777d81);
}
.cd-stage :deep(.cd-art img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: none;
}
.cd-stage :deep(.cd-disc > *) {
  pointer-events: none;
}
.cd-stage :deep(.cd-material-canvas) {
  position: absolute;
  inset: 4px;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  z-index: 1;
  border-radius: 50%;
  pointer-events: none;
}
.cd-stage :deep(.cd-disc::before) {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 50%;
  pointer-events: none;
  background: linear-gradient(120deg, #fff3, transparent 30%, #0001 65%, #fff2);
  box-shadow:
    inset 1px 1px 0 2px #ffffff80,
    inset -2px -2px 0 3px #42424280,
    inset 0 0 0 5px #dadbd550;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-disc::before) {
  background: linear-gradient(
    122deg,
    rgba(228, 236, 244, 0.34) 0%,
    rgba(228, 236, 244, 0.08) 18%,
    transparent 32%,
    transparent 58%,
    rgba(6, 8, 12, 0.22) 100%
  );
  box-shadow:
    inset 1px 1px 0 1px rgba(214, 222, 230, 0.38),
    inset -1px -2px 0 2px rgba(8, 10, 14, 0.5),
    inset 0 0 0 3px rgba(154, 162, 172, 0.22);
}
.cd-stage :deep(.cd-disc::after) {
  content: '';
  position: absolute;
  inset: 4px;
  z-index: 1;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  background:
    repeating-radial-gradient(
      circle at center,
      #08080830 0 0.65px,
      #ffffff14 0.85px 1.15px,
      transparent 1.4px 2.8px
    ),
    conic-gradient(
      from 25deg,
      #08080818,
      #ffffff20 16%,
      #08080830 32%,
      #08080810 47%,
      #ffffff24 65%,
      #08080830 82%,
      #08080818
    );
  box-shadow: inset 0 0 0 2px #10101038;
}
.cd-stage :deep(.cd-position[data-selected='true'] .cd-disc::after) {
  opacity: calc(var(--cd-vinyl, 0) * var(--cd-focus, 0));
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-disc::after) {
  background:
    repeating-radial-gradient(
      circle at center,
      #00000055 0 0.65px,
      #ffffff18 0.85px 1.15px,
      transparent 1.4px 2.8px
    ),
    conic-gradient(
      from 25deg,
      #00000022,
      #ffffff28 16%,
      #00000038 32%,
      #00000014 47%,
      #ffffff2a 65%,
      #00000038 82%,
      #00000022
    );
  box-shadow: inset 0 0 0 2px #d8dce422;
}
/* Override both themes only after a valid draw; original coatings remain the fallback. */
.cd-page .cd-stage :deep(.cd-disc[data-material-ready='true']::before) {
  background: none;
}
.cd-page
  .cd-stage
  :deep(.cd-position[data-selected='true'] .cd-disc[data-material-ready='true']::after) {
  opacity: 0;
}
.cd-stage :deep(.cd-hub) {
  position: absolute;
  z-index: 2;
  width: 25%;
  height: 25%;
  left: 37.5%;
  top: 37.5%;
  border-radius: 50%;
  background: conic-gradient(
    from 30deg,
    #bdc1c6,
    #e2e4e4,
    #a0a6b1,
    #ccd5d8,
    #eeece8,
    #989da6,
    #bdc1c6
  );
  box-shadow:
    0 0 0 2px #eeeeee70,
    0 0 0 7px #b7b7b744,
    inset 0 0 0 3px #888b9290;
}
.cd-stage :deep(.cd-hub::after) {
  content: '';
  position: absolute;
  inset: 14%;
  border-radius: 50%;
  border: 5px solid #f8f8f890;
  box-shadow: 0 0 0 2px #6c747b60;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-hub) {
  background: conic-gradient(
    from 30deg,
    #8b9199,
    #c4c8cc,
    #6a7078,
    #a6abb2,
    #d2d4d6,
    #5a6068,
    #8b9199
  );
  box-shadow:
    0 0 0 2px #2c313866,
    0 0 0 6px #9aa3ad30,
    inset 0 0 0 3px #4a505a99;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-hub::after) {
  border-color: #c8ccd090;
  box-shadow: 0 0 0 2px #3a404866;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-sidewall path:nth-child(1)) {
  fill: #a8b0b6;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-sidewall path:nth-child(2)) {
  fill: #5a6168;
}
.cd-page[data-theme='dark'] .cd-stage :deep(.cd-sidewall path:nth-child(3)) {
  fill: #7c848a;
}
.cd-stage :deep(.cd-wave-ring) {
  position: absolute;
  left: -28px;
  top: -28px;
  width: 456px;
  height: 456px;
  overflow: visible;
  pointer-events: none;
  opacity: 0;
  transform-box: border-box;
  transform-origin: center;
}
.cd-stage :deep(.cd-wave-ring path) {
  fill: none;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.cd-stage :deep(.cd-wave-track) {
  stroke: var(--cd-wave-track);
}
.cd-stage :deep(.cd-wave-progress) {
  stroke: var(--cd-wave-progress);
}
@media (max-width: 800px) {
  .cd-controls {
    flex-wrap: wrap;
    padding: 12px 16px 12px 56px;
  }
  .cd-page .cd-theme-toggle {
    left: 16px;
    bottom: 16px;
  }
  .cd-page .cd-vibration-toggle {
    left: 64px;
    bottom: 16px;
  }
}
.cd-info-row .cd-info-date {
  font-family: var(--cd-font-number);
  font-variant-numeric: lining-nums tabular-nums;
}
.cd-info-count,
.cd-browsing-playback-time {
  font-variant-numeric: lining-nums tabular-nums;
}
</style>
