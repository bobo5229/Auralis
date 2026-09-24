<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { groupAlbums, selectAlbumTracks } from '../utils/albumGrouping'
import { albumIdentityKey } from '../utils/albumIdentity'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import CdTrackList from '../components/CdTrackList.vue'
import CdFocusLyrics from '../components/CdFocusLyrics.vue'
import { createCdStage, type CdAlbum } from '../utils/cdStageController'
import { useCdCanvasTheme } from '../composables/useCdCanvasTheme'
import { formatCdAccent } from '../utils/cdAccent'
import { presentCdTrackComposers } from '../utils/cdTrackComposers'
import { animatePlaybackTextShimmer, animateProgress } from '@renderer/shared/animation/motion'

interface CdAlbumInfo extends CdAlbum {
  title: string
  artist: string
  releaseDate: string | null
  trackCount: number
  copyright: string | null
  tracks: TrackListItem[]
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const requestedAlbumKey =
  typeof route.query.artist === 'string' && typeof route.query.title === 'string'
    ? albumIdentityKey(route.query.artist, route.query.title)
    : null
const playback = usePlayback()
const { cdCanvasTheme, setCdCanvasTheme } = useCdCanvasTheme()
const themeToggleLabel = computed(() =>
  t(cdCanvasTheme.value === 'dark' ? 'albums.cd.theme.toLight' : 'albums.cd.theme.toDark'),
)
const pageRef = ref<HTMLElement | null>(null)
const trackPanelRef = ref<HTMLElement | null>(null)
const controlsRef = ref<HTMLElement | null>(null)
const focused = ref(false)
const focusSettled = ref(false)
const cdMode = ref<PlaybackMode>('repeat-all')
const discSurface = ref<'cd' | 'vinyl'>('cd')
const surfaceSwitchRef = ref<HTMLElement | null>(null)
const surfaceIndicatorRef = ref<HTMLElement | null>(null)
const albumInfo = shallowRef<CdAlbumInfo[]>([])
const selected = ref(0)
let queueOwned = false
let ownedIds: number[] = []
const focusedAlbum = computed(() => albumInfo.value[selected.value] ?? null)
const composerExpanded = ref(false)
const focusedComposer = computed(() => {
  if (!focusSettled.value || displayedAlbum.value?.key !== focusedAlbum.value?.key) return null
  const trackId = playback.state.currentTrackId
  if (trackId === null) return null
  const track = focusedAlbum.value?.tracks.find((item) => item.id === trackId)
  return presentCdTrackComposers(track?.composer)
})
watch([() => playback.state.currentTrackId, selected, focused], () => {
  composerExpanded.value = false
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

watch(
  () => playback.state.queue,
  (queue) => {
    if (
      queue.length !== ownedIds.length ||
      queue.some((track, index) => track.id !== ownedIds[index])
    )
      queueOwned = false
  },
)
function playCdTrack(id: number): void {
  const tracks = focusedAlbum.value?.tracks
  if (!tracks?.some((track) => track.id === id)) return
  ownedIds = tracks.map((track) => track.id)
  queueOwned = true
  void playback.playTrackFromQueue(tracks, id, {
    shufflePool: tracks,
    shuffleCycle: true,
    playbackMode: cdMode.value,
    replaceHistory: true,
  })
}
function cycleMode(): void {
  const modes: PlaybackMode[] = ['repeat-all', 'shuffle', 'sequential']
  cdMode.value = modes[(modes.indexOf(cdMode.value) + 1) % modes.length]
  const tracks = focusedAlbum.value?.tracks ?? []
  if (
    queueOwned &&
    tracks.length === ownedIds.length &&
    tracks.every((track, index) => track.id === ownedIds[index])
  ) {
    playback.setPlaybackMode(cdMode.value)
  }
}
function back(): void {
  if (focused.value) controller?.setFocused(false)
  else void router.push({ name: 'albums' })
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
const stageRef = ref<HTMLElement | null>(null)
const infoRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const starting = ref(false)
const infoSuppressed = ref(false)
let startupPlayed = false
const failed = ref(false)
const count = ref(0)
const infoSelected = ref(0)
const currentAlbum = computed(() => albumInfo.value[infoSelected.value] ?? null)
const displayedAlbum = shallowRef<CdAlbumInfo | null>(null)
const browsingPlayback = computed(() => {
  const track = playback.state.currentTrack
  if (focused.value || !track) return null
  const title = track.title?.trim() || t('albums.detail.unknownTitle')
  const artist = formatArtist(track.artist)
  return {
    label: t(playback.state.isPlaying ? 'albums.cd.nowPlaying' : 'albums.cd.paused'),
    song: artist ? `${title} - ${artist}` : title,
    album: track.album?.trim() ?? '',
  }
})
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
const browsingPlaybackLabelRef = ref<HTMLElement | null>(null)
const browsingPlaybackRef = ref<HTMLElement | null>(null)
watch(
  [browsingPlaybackLabelRef, () => playback.state.isPlaying],
  ([label, isPlaying], _, onCleanup) => {
    if (label && isPlaying) onCleanup(animatePlaybackTextShimmer(label))
  },
  { flush: 'post', immediate: true },
)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let vinylBlend = 0
let cancelSurfaceAnimation: (() => void) | null = null
let cancelIndicatorAnimation: (() => void) | null = null
let indicatorEdges: { left: number; right: number } | null = null
let cancelInfoAnimation: (() => void) | null = null
let cancelBrowsingPlaybackAnimation: (() => void) | null = null
let infoGeneration = 0
let controller: ReturnType<typeof createCdStage> | null = null
let unsubscribe: (() => void) | null = null
let disposed = false
let inFlight = false
let refreshPending = false

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

  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !transitionDocument.startViewTransition
  ) {
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

function onMotionPreferenceChange(): void {
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
  cancelIndicatorAnimation?.()
  cancelIndicatorAnimation = null
  const group = surfaceSwitchRef.value
  const line = surfaceIndicatorRef.value
  const button = group?.querySelector<HTMLElement>('button[aria-pressed="true"]')
  if (!group || !line || !button) return
  const groupRect = group.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  const target = {
    left: buttonRect.left - groupRect.left,
    right: buttonRect.right - groupRect.left,
  }
  const draw = (left: number, right: number): void => {
    indicatorEdges = { left, right }
    line.style.transform = `translateX(${left}px)`
    line.style.width = `${right - left}px`
  }
  if (!animate || reducedMotion.matches || !indicatorEdges) {
    draw(target.left, target.right)
    return
  }
  const from = { ...indicatorEdges }
  const movingRight = target.left + target.right > from.left + from.right
  cancelIndicatorAnimation = animateProgress(
    440,
    (progress) => {
      // The leading edge reaches out first; the trailing edge releases a little later.
      const lead = 1 - (1 - progress) ** 3
      const delayed = Math.max(0, (progress - 0.18) / 0.82)
      const trail = delayed * delayed * (3 - 2 * delayed)
      draw(
        from.left + (target.left - from.left) * (movingRight ? trail : lead),
        from.right + (target.right - from.right) * (movingRight ? lead : trail),
      )
    },
    () => {
      draw(target.left, target.right)
      cancelIndicatorAnimation = null
    },
  )
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
      cancelIndicatorAnimation?.()
      cancelIndicatorAnimation = null
      indicatorEdges = null
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
    accent: ringAccent.value,
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

async function loadAlbums(): Promise<void> {
  if (inFlight) {
    refreshPending = true
    return
  }
  inFlight = true
  failed.value = false
  if (!count.value) loading.value = true
  try {
    do {
      refreshPending = false
      const tracks = await auralis.library.getTracks()
      if (disposed) return
      // Only publish a complete catalog; reuse the exact ordering of AlbumsPage.
      const albums = groupAlbums(tracks).map((album) => ({
        key: album.key,
        artworkUrl: getArtworkUrl(album.artworkCacheKey),
        title: album.title,
        artist: album.albumArtist,
        releaseDate: album.releaseDate?.trim() || null,
        trackCount: album.tracks.length,
        copyright: album.tracks.find((track) => track.copyright?.trim())?.copyright?.trim() || null,
        tracks: selectAlbumTracks(album.tracks, album.albumArtist, album.title),
      }))
      albumInfo.value = albums
      count.value = albums.length
      const intro = !startupPlayed && albums.length > 0
      const targetKey =
        intro && albums.some((album) => album.key === requestedAlbumKey) ? requestedAlbumKey : null
      if (intro) startupPlayed = true
      controller?.setAlbums(albums, intro && !targetKey, targetKey ?? undefined)
      if (targetKey) controller?.setFocused(true, 'fade')
    } while (refreshPending && !disposed)
  } catch (error) {
    if (!disposed) {
      failed.value = true
      rendererDiagnostics.error({
        scope: 'albums.cd',
        message: 'Failed to load CD albums',
        cause: error,
      })
    }
  } finally {
    inFlight = false
    if (!disposed) loading.value = false
  }
  await nextTick()
  if (!disposed && document.activeElement === document.body) {
    stageRef.value?.focus({ preventScroll: true })
  }
}

function navigate(direction: number): void {
  if (!loading.value && !failed.value && !starting.value && !focused.value)
    controller?.navigate(direction)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return
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
  if (!event.repeat) navigate(event.key === 'ArrowRight' ? 1 : -1)
}

function infoRows(): HTMLElement[] {
  return Array.from(
    infoRef.value?.querySelectorAll<HTMLElement>('.cd-info-title-row, .cd-info-row') ?? [],
  )
}

function setInfoText(opacity: number, shift: number): void {
  infoRef.value?.querySelectorAll<HTMLElement>('h1, .cd-info-count, dt, dd').forEach((element) => {
    element.style.opacity = String(opacity)
    element.style.transform = `translateY(${shift}px)`
  })
}

function clearInfoStyles(): void {
  infoRows().forEach((row) => {
    row.style.height = ''
    row.style.overflow = ''
  })
  setInfoText(1, 0)
}

function runInfoPhase(duration: number, update: (progress: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = animateProgress(duration, update, () => {
      cancelInfoAnimation = null
      resolve(true)
    })
    cancelInfoAnimation = () => {
      cancel()
      resolve(false)
    }
  })
}

async function transitionInfo(album: CdAlbumInfo | null, entering = false): Promise<void> {
  const generation = ++infoGeneration
  cancelInfoAnimation?.()
  cancelInfoAnimation = null
  if (entering && album && !reducedMotion.matches) {
    clearInfoStyles()
    setInfoText(0, 4)
    displayedAlbum.value = album
    await nextTick()
    if (disposed || generation !== infoGeneration || infoSuppressed.value) return
    setInfoText(0, 4)
    if (!(await runInfoPhase(240, (progress) => setInfoText(progress, 4 * (1 - progress))))) return
    if (!disposed && generation === infoGeneration) clearInfoStyles()
    return
  }
  const rows = infoRows()
  const oldHeights = rows.map((row) => row.getBoundingClientRect().height)
  if (!album || !displayedAlbum.value || !infoRef.value || reducedMotion.matches) {
    displayedAlbum.value = album
    clearInfoStyles()
    return
  }
  const opacity = Number(infoRef.value.querySelector<HTMLElement>('h1')?.style.opacity || 1)
  if (
    !(await runInfoPhase(100, (progress) => setInfoText(opacity * (1 - progress), -4 * progress)))
  )
    return
  if (disposed || generation !== infoGeneration) return

  displayedAlbum.value = album
  await nextTick()
  if (disposed || generation !== infoGeneration) return
  // Measure natural target heights while the new text is invisible, then animate
  // only the label's rows. The CD stage never participates in this layout change.
  clearInfoStyles()
  setInfoText(0, 4)
  const nextRows = infoRows()
  const nextHeights = nextRows.map((row) => row.getBoundingClientRect().height)
  nextRows.forEach((row, index) => {
    row.style.height = `${oldHeights[index] ?? nextHeights[index]}px`
    row.style.overflow = 'hidden'
  })
  if (
    !(await runInfoPhase(200, (progress) => {
      const eased = 1 - (1 - progress) ** 3
      nextRows.forEach((row, index) => {
        const from = oldHeights[index] ?? nextHeights[index]
        row.style.height = `${from + (nextHeights[index] - from) * eased}px`
      })
      const fade = Math.min(1, Math.max(0, (progress - 0.2) / 0.8))
      setInfoText(fade, 4 * (1 - fade))
    }))
  )
    return
  if (!disposed && generation === infoGeneration) clearInfoStyles()
}

watch([currentAlbum, infoSuppressed], ([album, suppressed], [, wasSuppressed]) => {
  if (!suppressed) void transitionInfo(album, wasSuppressed)
})

function settleInfo(): void {
  ++infoGeneration
  cancelInfoAnimation?.()
  cancelInfoAnimation = null
  clearInfoStyles()
  displayedAlbum.value = currentAlbum.value
}

function setRapidBrowse(running: boolean): void {
  if (running) {
    ++infoGeneration
    cancelInfoAnimation?.()
    cancelInfoAnimation = null
    clearInfoStyles()
  }
  infoSuppressed.value = running
}

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
        if (ringTrackMatches.value && !loading.value && !failed.value)
          void playback.togglePlayPause()
      },
    },
  )
  syncPlaybackRing()
  stageRef.value.focus({ preventScroll: true })
  unsubscribe = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void loadAlbums()
  })
  void loadAlbums()
})

onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
  settleInfo()
  cancelSurfaceAnimation?.()
  cancelSurfaceAnimation = null
  reducedMotion.removeEventListener('change', onMotionPreferenceChange)
  window.removeEventListener('resize', settleInfo)
  controller?.dispose()
  controller = null
})
</script>

<template>
  <section
    ref="pageRef"
    class="cd-page"
    :class="{ 'cd-page--starting': starting, 'cd-page--focused': focused }"
    :data-theme="cdCanvasTheme"
    :aria-label="t('albums.cd.title')"
    @keydown="onKeydown"
  >
    <header class="cd-header">
      <button
        type="button"
        class="cd-back"
        :aria-label="t(focused ? 'albums.cd.returnToBrowse' : 'albums.detail.returnToAlbums')"
        @click="back"
      >
        <span class="i-lucide-arrow-left" aria-hidden="true"></span>
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
        :class="{ 'cd-info--suppressed': infoSuppressed }"
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
            <dd>{{ displayedAlbum.releaseDate }}</dd>
          </div>
          <div v-if="displayedAlbum.copyright" class="cd-info-row cd-info-copyright">
            <dt>{{ t('albums.cd.copyright') }}</dt>
            <dd dir="auto">{{ displayedAlbum.copyright }}</dd>
          </div>
          <div v-if="focusedComposer" class="cd-info-row cd-info-composer">
            <dt>{{ t('albums.cd.composer.label') }}</dt>
            <dd dir="auto">
              <span
                v-for="(name, index) in composerExpanded
                  ? focusedComposer.names
                  : focusedComposer.visible"
                :key="`${index}-${name}`"
                class="cd-composer-name"
              >
                {{ name }}
              </span>
              <button
                v-if="focusedComposer.overflow"
                type="button"
                class="cd-composer-toggle"
                :aria-expanded="composerExpanded"
                :aria-label="
                  composerExpanded
                    ? t('albums.cd.composer.collapse')
                    : t('albums.cd.composer.expand')
                "
                @click="composerExpanded = !composerExpanded"
              >
                <span v-if="composerExpanded" class="i-lucide-arrow-up" aria-hidden="true"></span>
                <template v-else>{{ `+${focusedComposer.overflow}` }}</template>
              </button>
            </dd>
          </div>
        </dl>
      </aside>
      <p
        v-if="
          browsingPlayback && displayedAlbum && !loading && !failed && !starting && !infoSuppressed
        "
        ref="browsingPlaybackRef"
        class="cd-browsing-playback"
        role="status"
      >
        <span
          ref="browsingPlaybackLabelRef"
          class="cd-browsing-playback-label"
          :class="{ 'cd-browsing-playback-label--playing': playback.state.isPlaying }"
        >
          {{ browsingPlayback.label }}
        </span>
        <span class="cd-browsing-playback-song" dir="auto">{{ browsingPlayback.song }}</span>
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
        <button
          v-if="browsingPlayback.album"
          type="button"
          class="cd-browsing-playback-album"
          :disabled="browsingPlaybackAlbumIndex < 0"
          dir="auto"
          @click="focusBrowsingPlaybackAlbum"
        >
          {{ browsingPlayback.album }}
        </button>
      </p>
      <div
        ref="stageRef"
        class="cd-stage"
        :class="{ 'cd-stage--unavailable': loading || failed || !count }"
        tabindex="0"
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
        :accent="ringAccent"
        :stage="stageRef"
        :information="infoRef"
        :tracks="trackPanelRef"
      />
      <div v-if="loading || failed || !count" class="cd-status" role="status">
        <template v-if="failed">
          <p>{{ t('albums.status.loadError') }}</p>
          <button type="button" @click="loadAlbums">{{ t('albums.status.retry') }}</button>
        </template>
        <p v-else>{{ t(loading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
      </div>
    </div>
    <footer ref="controlsRef" class="cd-controls" :inert="starting || focused">
      <div class="cd-actions">
        <button type="button" :disabled="loading || failed || count < 2" @click="navigate(-1)">
          <span class="i-lucide-arrow-left" aria-hidden="true"></span>{{ t('albums.cd.previous') }}
        </button>
        <button type="button" :disabled="loading || failed || count < 2" @click="navigate(1)">
          {{ t('albums.cd.next') }}<span class="i-lucide-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
      <span class="sr-only" role="status" aria-live="polite">
        {{ count ? t('albums.cd.position', { index: selected + 1, total: count }) : '' }}
      </span>
    </footer>
    <button
      type="button"
      class="cd-theme-toggle"
      :title="themeToggleLabel"
      :aria-label="themeToggleLabel"
      @click="toggleCdCanvasTheme"
    >
      <span v-if="cdCanvasTheme === 'dark'" class="i-lucide-sun h-4 w-4" aria-hidden="true"></span>
      <span v-else class="i-lucide-moon h-4 w-4" aria-hidden="true"></span>
    </button>
  </section>
</template>

<style scoped>
.cd-tracks {
  position: absolute;
  right: 32px;
  top: 20%;
  bottom: 32px;
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
  flex: 1 1 0;
  min-height: 0;
}
.cd-playback-error {
  flex: 0 0 auto;
  font-size: 11px;
  color: #8c4034;
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
@media (prefers-reduced-motion: reduce) {
  .cd-info,
  .cd-controls,
  .cd-theme-toggle {
    transition: none;
  }
}
/* CD canvas is local to this page. Light values match the approved demo. */
.cd-page {
  --auralis-playbar-safe-area: 0px;
  --cd-bg: #eeeeec;
  --cd-text: #292929;
  --cd-text-muted: #62625b;
  --cd-text-subtle: #77776f;
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
  --cd-shimmer-a: #85857d;
  --cd-shimmer-b: #71716b;
  --cd-shimmer-c: #585753;
  box-sizing: border-box;
  padding-bottom: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--cd-bg);
  color: var(--cd-text);
  color-scheme: light;
  view-transition-name: cd-canvas;
}
.cd-page[data-theme='dark'] {
  --cd-bg: #2b2d30;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(224, 226, 230, 0.045) 0 1px,
    transparent 1px 7px
  );
  --cd-text: #e6e4de;
  --cd-text-muted: #a8a69f;
  --cd-text-subtle: #8e8c86;
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
  --cd-shimmer-a: #9e9c96;
  --cd-shimmer-b: #b8b6b0;
  --cd-shimmer-c: #d8d6d0;
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
  font-size: 13px;
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
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  line-height: 20px;
  font-size: 12px;
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
.cd-info-title-row {
  box-sizing: border-box;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--cd-border-strong);
}
.cd-info-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-bottom: 3px;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 36px;
  font-weight: 400;
  font-style: italic;
  font-synthesis: none;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.cd-info-count {
  flex-shrink: 0;
  padding-bottom: 6px;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', serif;
  font-size: 12px;
  white-space: nowrap;
  color: var(--cd-text-count);
}
.cd-info-fields {
  margin: 0;
}
.cd-browsing-playback {
  position: absolute;
  top: 8px;
  left: 50%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transform: translateX(-50%);
  width: 240px;
  max-width: 100%;
  z-index: 4;
  align-items: stretch;
  gap: 2px;
  margin: 0;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 16px;
  line-height: 1.3;
  color: var(--cd-text-browsing);
  white-space: nowrap;
  pointer-events: none;
}
.cd-browsing-playback-label {
  position: relative;
  align-self: center;
  width: fit-content;
  max-width: 100%;
  flex: 0 0 auto;
  margin-bottom: 6px;
  font-size: 18px;
  font-style: italic;
  text-align: center;
  color: var(--cd-text-faint);
}
.cd-browsing-playback-label--playing {
  background: linear-gradient(
    100deg,
    var(--cd-shimmer-a) 0%,
    var(--cd-shimmer-a) 46%,
    var(--cd-shimmer-b) 48.5%,
    var(--cd-shimmer-c) 49.5%,
    var(--cd-shimmer-c) 50.5%,
    var(--cd-shimmer-b) 51.5%,
    var(--cd-shimmer-a) 54%,
    var(--cd-shimmer-a) 100%
  );
  background-size: 300% 100%;
  background-position: 100% 0;
  background-repeat: no-repeat;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  .cd-browsing-playback-label--playing {
    background: none;
    color: var(--cd-text-faint);
    -webkit-text-fill-color: currentColor;
  }
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
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: auto;
  cursor: pointer;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 14px;
  font-weight: 400;
  font-style: italic;
  font-synthesis: none;
  line-height: 1.25;
  text-align: center;
  color: var(--cd-text-album);
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
  box-sizing: border-box;
  min-height: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: start;
  gap: 20px;
  padding: 11px 0;
}
.cd-info-row + .cd-info-row {
  border-top: 1px solid var(--cd-border-row);
}
.cd-info-row dt {
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 12px;
  color: var(--cd-text-muted);
  line-height: 1.7;
}
.cd-info-row dd {
  margin: 0;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 14px;
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.cd-info-copyright dd {
  font-size: 13px;
}
.cd-page .cd-composer-toggle {
  display: flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  margin: 4px 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cd-text-muted);
  font: inherit;
  cursor: pointer;
}
.cd-composer-name {
  display: block;
}
.cd-page .cd-composer-toggle:hover:not(:disabled) {
  background: transparent;
  color: var(--cd-text);
}
@container (max-width: 600px) {
  .cd-info {
    left: 24px;
    width: min(300px, 31vw);
  }
  .cd-info-title {
    font-size: 28px;
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
  outline: none;
}
.cd-stage:focus-visible {
  outline: none;
  box-shadow: none;
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
  font-size: 14px;
}
.cd-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 16px 24px 24px 64px;
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
.cd-actions {
  display: flex;
  gap: 8px;
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
}
</style>
