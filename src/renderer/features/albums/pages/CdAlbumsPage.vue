<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { groupAlbums } from '../utils/albumGrouping'
import { createCdStage, type CdAlbum } from '../utils/cdStageController'
import { animateProgress } from '@renderer/shared/animation/motion'

interface CdAlbumInfo extends CdAlbum {
  title: string
  artist: string
  releaseDate: string | null
  trackCount: number
  copyright: string | null
}

const { t } = useI18n()
const router = useRouter()
const stageRef = ref<HTMLElement | null>(null)
const infoRef = ref<HTMLElement | null>(null)
const albumInfo = shallowRef<CdAlbumInfo[]>([])
const loading = ref(true)
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
      }))
      albumInfo.value = albums
      count.value = albums.length
      controller?.setAlbums(albums)
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
  if (!loading.value && !failed.value) controller?.navigate(direction)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return
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

async function transitionInfo(album: CdAlbumInfo | null): Promise<void> {
  const generation = ++infoGeneration
  cancelInfoAnimation?.()
  cancelInfoAnimation = null
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

watch(currentAlbum, (album) => {
  void transitionInfo(album)
})

function settleInfo(): void {
  ++infoGeneration
  cancelInfoAnimation?.()
  cancelInfoAnimation = null
  clearInfoStyles()
  displayedAlbum.value = currentAlbum.value
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
  <section class="cd-page" :aria-label="t('albums.cd.title')" @keydown="onKeydown">
    <header class="cd-header">
      <button
        type="button"
        class="cd-back"
        :aria-label="t('albums.detail.returnToAlbums')"
        :title="t('albums.detail.returnToAlbums')"
        @click="router.push({ name: 'albums' })"
      >
        <span class="i-lucide-arrow-left" aria-hidden="true"></span>
      </button>
    </header>
    <div class="cd-content">
      <aside
        v-if="displayedAlbum && !loading && !failed"
        ref="infoRef"
        class="cd-info"
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
        :aria-busy="loading"
      ></div>
      <div v-if="loading || failed || !count" class="cd-status" role="status">
        <template v-if="failed">
          <p>{{ t('albums.status.loadError') }}</p>
          <button type="button" @click="loadAlbums">{{ t('albums.status.retry') }}</button>
        </template>
        <p v-else>{{ t(loading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
      </div>
    </div>
    <footer class="cd-controls">
      <span class="cd-hint">{{ t('albums.cd.hint') }}</span>
      <div class="cd-actions">
        <button
          type="button"
          :disabled="loading || failed || count < 2 || (count < 4 && selected === 0)"
          @click="navigate(-1)"
        >
          <span class="i-lucide-arrow-left" aria-hidden="true"></span>{{ t('albums.cd.previous') }}
        </button>
        <button
          type="button"
          :disabled="loading || failed || count < 2 || (count < 4 && selected === count - 1)"
          @click="navigate(1)"
        >
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
/* The approved light CD canvas is local to this page, independent of app theme. */
.cd-page {
  box-sizing: border-box;
  padding-bottom: var(--auralis-playbar-safe-area);
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
}
.cd-info {
  position: absolute;
  top: 8px;
  left: 32px;
  z-index: 5;
  width: min(320px, calc(100% - 64px));
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
    width: min(280px, calc(100% - 48px));
  }
  .cd-info-title {
    font-size: 26px;
  }
}
.cd-stage {
  position: absolute;
  inset: 0;
  /* Reserve the maximum label envelope, independent of the selected album. */
  top: calc(14% + 28px);
  /* Discs can extend above the stage; the page owns the outer clipping edge. */
  overflow: visible;
  touch-action: pan-y;
  user-select: none;
  outline: none;
}
.cd-stage:focus-visible {
  box-shadow: inset 0 0 0 2px #888;
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
  color: #62625f;
  font-size: 12px;
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
