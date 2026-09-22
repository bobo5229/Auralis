<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { groupAlbums, selectAlbumTracks } from '../utils/albumGrouping'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import CdTrackList from '../components/CdTrackList.vue'
import { createCdStage, type CdAlbum } from '../utils/cdStageController'
import { animateProgress } from '@renderer/shared/animation/motion'

interface CdAlbumInfo extends CdAlbum {
  title: string
  artist: string
  releaseDate: string | null
  trackCount: number
  copyright: string | null
  tracks: TrackListItem[]
}

const { t } = useI18n()
const router = useRouter()
const playback = usePlayback()
const pageRef = ref<HTMLElement | null>(null)
const trackPanelRef = ref<HTMLElement | null>(null)
const controlsRef = ref<HTMLElement | null>(null)
const focused = ref(false)
const focusSettled = ref(false)
const cdMode = ref<PlaybackMode>('repeat-all')
let queueOwned = false
let ownedIds: number[] = []
const focusedAlbum = computed(() => albumInfo.value[selected.value] ?? null)

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
function focusChange(progress: number, settled: boolean): void {
  const wasFocused = focused.value
  focused.value = progress > 0 || !settled
  focusSettled.value = progress === 1 && settled
  if (!wasFocused && focused.value) settleInfo()
  const p = Math.max(0, Math.min(1, (progress - 0.72) / 0.28))
  const reveal = p * p * p * (10 + p * (-15 + 6 * p))
  if (trackPanelRef.value) {
    trackPanelRef.value.style.opacity = String(reveal)
    trackPanelRef.value.style.transform = `translateX(${(1 - reveal) * 16}px)`
    trackPanelRef.value.style.visibility = reveal > 0 ? 'visible' : 'hidden'
  }
  if (controlsRef.value) controlsRef.value.style.opacity = String(1 - Math.min(1, progress / 0.5))
  if (settled && !disposed) {
    if (progress === 1)
      void nextTick(() => {
        if (!disposed && focusSettled.value)
          trackPanelRef.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
      })
    else stageRef.value?.focus({ preventScroll: true })
  }
}
const stageRef = ref<HTMLElement | null>(null)
const infoRef = ref<HTMLElement | null>(null)
const albumInfo = shallowRef<CdAlbumInfo[]>([])
const loading = ref(true)
const starting = ref(false)
const infoSuppressed = ref(false)
let startupPlayed = false
const failed = ref(false)
const count = ref(0)
const selected = ref(0)
const infoSelected = ref(0)
const currentAlbum = computed(() => albumInfo.value[infoSelected.value] ?? null)
const displayedAlbum = shallowRef<CdAlbumInfo | null>(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let cancelInfoAnimation: (() => void) | null = null
let infoGeneration = 0
let controller: ReturnType<typeof createCdStage> | null = null
let unsubscribe: (() => void) | null = null
let disposed = false
let inFlight = false
let refreshPending = false

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
      if (intro) startupPlayed = true
      controller?.setAlbums(albums, intro)
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
  reducedMotion.addEventListener('change', settleInfo)
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
    },
  )
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
  reducedMotion.removeEventListener('change', settleInfo)
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
    :aria-label="t('albums.cd.title')"
    @keydown="onKeydown"
  >
    <header class="cd-header">
      <button
        type="button"
        class="cd-back"
        :aria-label="t(focused ? 'albums.cd.returnToBrowse' : 'albums.detail.returnToAlbums')"
        :title="t(focused ? 'albums.cd.returnToBrowse' : 'albums.detail.returnToAlbums')"
        @click="back"
      >
        <span class="i-lucide-arrow-left" aria-hidden="true"></span>
      </button>
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
            <dd dir="auto">{{ displayedAlbum.artist }}</dd>
          </div>
          <div v-if="displayedAlbum.releaseDate" class="cd-info-row">
            <dt>{{ t('albums.cd.releaseDate') }}</dt>
            <dd>{{ displayedAlbum.releaseDate }}</dd>
          </div>
          <div v-if="displayedAlbum.copyright" class="cd-info-row cd-info-copyright">
            <dt>{{ t('albums.cd.copyright') }}</dt>
            <dd dir="auto">{{ displayedAlbum.copyright }}</dd>
          </div>
        </dl>
      </aside>
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
      <div v-if="loading || failed || !count" class="cd-status" role="status">
        <template v-if="failed">
          <p>{{ t('albums.status.loadError') }}</p>
          <button type="button" @click="loadAlbums">{{ t('albums.status.retry') }}</button>
        </template>
        <p v-else>{{ t(loading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
      </div>
    </div>
    <footer ref="controlsRef" class="cd-controls" :inert="starting || focused">
      <span class="cd-hint">{{ t('albums.cd.hint') }}</span>
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
  color-scheme: light;
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
.cd-controls {
  transition: opacity 300ms ease;
}
.cd-page--starting .cd-info,
.cd-page--starting .cd-controls {
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
@media (prefers-reduced-motion: reduce) {
  .cd-info,
  .cd-controls {
    transition: none;
  }
}
/* The approved light CD canvas is local to this page, independent of app theme. */
.cd-page {
  --auralis-playbar-safe-area: 0px;
  box-sizing: border-box;
  padding-bottom: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #eeeeec;
  color: #292929;
}
.cd-header {
  display: flex;
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
  border: 1px solid #bdbdb9;
  background: transparent;
  border-radius: 3px;
  padding: 10px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.cd-page button:hover:not(:disabled) {
  background: #e1e1de;
}
.cd-page button:disabled {
  opacity: 0.4;
  cursor: default;
}
.cd-page button:focus-visible {
  outline: 2px solid #292929;
  outline-offset: 3px;
}
.cd-content {
  position: relative;
  flex: 1;
  min-height: 0;
  container-type: inline-size;
}
.cd-page .cd-back {
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
  width: min(320px, 29vw);
  max-height: 44%;
  overflow-y: auto;
  scrollbar-width: thin;
  color-scheme: light;
}
.cd-info-title-row {
  box-sizing: border-box;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #8e8e88;
}
.cd-info-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-bottom: 3px;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 30px;
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
  font-size: 11px;
  white-space: nowrap;
  color: #55554f;
}
.cd-info-fields {
  margin: 0;
}
.cd-info-row {
  box-sizing: border-box;
  min-height: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: start;
  gap: 18px;
  padding: 8px 0;
}
.cd-info-row + .cd-info-row {
  border-top: 1px solid #aaa9a3;
}
.cd-info-row dt {
  font-size: 10px;
  color: #62625b;
  line-height: 1.7;
}
.cd-info-row dd {
  margin: 0;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.cd-info-copyright dd {
  font-size: 11px;
}
@container (max-width: 600px) {
  .cd-info {
    left: 24px;
    width: min(280px, 29vw);
  }
  .cd-info-title {
    font-size: 26px;
  }
}
.cd-stage {
  position: absolute;
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
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px 24px;
}
.cd-actions {
  display: flex;
  gap: 8px;
}
.cd-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #62625f;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid transparent;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.cd-hint::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}
.cd-page:has(.cd-stage:focus-visible) .cd-hint {
  color: #383835;
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.12);
}
.cd-page:has(.cd-stage:focus-visible) .cd-hint::before {
  background: #767670;
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
  width: 100%;
  height: 100%;
  transform: perspective(1100px) rotateX(0deg) rotateY(0deg);
}
.cd-stage :deep(.cd-disc) {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #aaa;
  isolation: isolate;
  pointer-events: auto;
  mask-image: radial-gradient(circle, transparent 0 6.8%, #000 7.1%);
  box-shadow: inset 0 0 0 2px #858586;
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
@media (max-width: 800px) {
  .cd-controls {
    flex-wrap: wrap;
    padding: 12px 16px;
  }
  .cd-hint {
    flex-basis: 100%;
  }
}
</style>
