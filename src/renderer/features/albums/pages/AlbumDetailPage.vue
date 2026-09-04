<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { splitGenreValues } from '@renderer/features/library/utils/formatGenre'

import AlbumDetailTrackList from '../components/AlbumDetailTrackList.vue'
import type { AlbumSummary } from '../types'
import { useAlbumDetailTracks } from '../composables/useAlbumDetailTracks'
import { resolveAlbumPresentation } from '../utils/albumPresentation'
import '../styles/manuscript.detail.css'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { visualStyle } = useVisualStyle()
const playback = usePlayback()
const detailRootRef = ref<HTMLElement | null>(null)
const coverStageRef = ref<HTMLElement | null>(null)
const heroBillboardRef = ref<HTMLElement | null>(null)
const heroCanvasRef = ref<HTMLCanvasElement | null>(null)
const moreAlbumsScrollerRef = ref<HTMLElement | null>(null)
const highlightedTrackId = ref<number | null>(null)
let trackingFrame: number | null = null
let highlightTimeout: ReturnType<typeof setTimeout> | null = null
let heroFluidGeneration = 0
let heroResizeObserver: ResizeObserver | null = null
let pointerPosition: { x: number; y: number } | null = null
let detailScrollTarget: HTMLElement | null = null
let modernEffectsBound = false
let modernEffectsActivationGeneration = 0
let isPageUnmounted = false
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const MAX_COVER_TILT_DEGREES = 12

const albumArtist = computed(() => String(route.query.artist ?? ''))
const albumTitle = computed(() => String(route.query.title ?? ''))
const {
  tracks,
  albumTracks,
  loadState,
  initialize: initializeAlbumTracks,
  reloadTracks,
  syncLoadStateFromTracks,
  dispose: disposeAlbumTracks,
} = useAlbumDetailTracks({ albumArtist, albumTitle, library: auralis.library })
const albumPresentation = computed(() => resolveAlbumPresentation(route.name, visualStyle.value))
const isModernAlbumDetail = computed(() => albumPresentation.value === 'modern')
const displayAlbumArtist = computed(() =>
  albumArtist.value === 'Unknown Artist'
    ? t('library.unknownArtist')
    : formatArtist(albumArtist.value),
)
const displayAlbumTitle = computed(() =>
  albumTitle.value === 'Unknown Album' ? t('library.unknownAlbum') : albumTitle.value,
)

const isMoreScrolledToStart = ref(true)
const isMoreScrolledToEnd = ref(false)
const isMoreScrollable = ref(false)

function resetMoreAlbumsScrollState(): void {
  isMoreScrolledToStart.value = true
  isMoreScrolledToEnd.value = false
  isMoreScrollable.value = false
}

function updateMoreAlbumsScrollState(scroller: HTMLElement | null): void {
  if (!scroller) return
  const maxScroll = scroller.scrollWidth - scroller.clientWidth
  isMoreScrollable.value = maxScroll > 1
  if (!isMoreScrollable.value) {
    isMoreScrolledToStart.value = true
    isMoreScrolledToEnd.value = true
    return
  }
  isMoreScrolledToStart.value = scroller.scrollLeft <= 2
  isMoreScrolledToEnd.value = scroller.scrollLeft >= maxScroll - 2
}

function onMoreAlbumsScroll(event: Event): void {
  updateMoreAlbumsScrollState(event.currentTarget as HTMLElement)
}

function formatDisplayAlbumTitle(title: string): string {
  return title === 'Unknown Album' ? t('library.unknownAlbum') : title
}

const albumGroups = computed(() => {
  const groupedAlbums = new Map<string, TrackListItem[]>()

  for (const track of tracks.value) {
    const artist = track.albumArtist || track.artist || 'Unknown Artist'
    const title = track.album || 'Unknown Album'
    const key = `${artist}\u0000${title}`
    const existing = groupedAlbums.get(key)

    if (existing) {
      existing.push(track)
    } else {
      groupedAlbums.set(key, [track])
    }
  }

  return [...groupedAlbums.entries()].map(([key, groupTracks]) => ({ key, tracks: groupTracks }))
})

const artworkUrl = computed(() => {
  const artworkKey =
    albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ?? null
  return getArtworkUrl(artworkKey)
})
const artworkGlowBackground = computed(() =>
  artworkUrl.value ? `url("${artworkUrl.value}")` : 'none',
)

const releaseDate = computed(
  () => albumTracks.value.find((track) => track.releaseDate)?.releaseDate ?? null,
)
const copyright = computed(
  () => albumTracks.value.find((track) => track.copyright)?.copyright ?? null,
)
const totalDurationSeconds = computed(() =>
  albumTracks.value.reduce((total, track) => total + (track.durationSeconds ?? 0), 0),
)

function collectGenreCounts(): { label: string; count: number; firstSeen: number }[] {
  const genreCounts = new Map<string, { label: string; count: number; firstSeen: number }>()
  let firstSeen = 0

  for (const track of albumTracks.value) {
    const trackGenres = new Map<string, string>()

    for (const genre of splitGenreValues(track.genre)) {
      trackGenres.set(genre.toLocaleLowerCase(), genre)
    }

    for (const [key, genre] of trackGenres) {
      const existing = genreCounts.get(key)

      if (existing) {
        existing.count += 1
      } else {
        genreCounts.set(key, { label: genre, count: 1, firstSeen })
        firstSeen += 1
      }
    }
  }

  return [...genreCounts.values()].sort(
    (left, right) => right.count - left.count || left.firstSeen - right.firstSeen,
  )
}

/** 提取所有流派胶囊，去重并按频次与先后顺序排列 */
const albumGenrePills = computed<string[]>(() => collectGenreCounts().map((genre) => genre.label))

function onGenrePillClick(genre: string): void {
  void router.push({ name: 'library', query: { q: genre } })
}

function onArtistClick(): void {
  if (!albumArtist.value || albumArtist.value === 'Unknown Artist') return
  void router.push({ name: 'library', query: { q: albumArtist.value } })
}

function formatMetricsDuration(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const metricsTrackCount = computed(() => albumTracks.value.length)
const metricsTotalDuration = computed(() => formatMetricsDuration(totalDurationSeconds.value))

const metricsListenData = computed(() => {
  let totalPlays = 0
  let listenedSeconds = 0

  for (const track of albumTracks.value) {
    const playCount = track.playCount ?? 0
    totalPlays += playCount
    listenedSeconds += playCount * (track.durationSeconds ?? 0)
  }

  return { totalPlays, listenedSeconds }
})

const metricsTotalPlays = computed(() => metricsListenData.value.totalPlays)

const metricsPlaysLabel = computed(() => {
  const count = metricsTotalPlays.value
  const key = count === 1 ? 'albums.detail.metrics.playsUnitOne' : 'albums.detail.metrics.playsUnit'
  return t(key, { count })
})

const metricsTotalTime = computed(() => {
  const seconds = metricsListenData.value.listenedSeconds
  if (seconds <= 0) {
    return t('albums.detail.metrics.minutesUnit', { minutes: 0 })
  }

  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60))
    return t('albums.detail.metrics.minutesUnit', { minutes })
  }

  const hoursTenths = Math.round((seconds / 3600) * 10) / 10
  const hoursLabel =
    Number.isInteger(hoursTenths) || hoursTenths >= 10
      ? String(Math.round(hoursTenths))
      : hoursTenths.toFixed(1)
  return t('albums.detail.metrics.hoursUnit', { hours: hoursLabel })
})

/**
 * Hero 法律附录：版权 + 完整发行日（有则拼接）。
 * 无真实数据时不渲染，绝不写「未知」占位。
 */
const heroLegalLine = computed(() => {
  const parts: string[] = []
  const copyrightText = copyright.value?.trim()
  const dateText = releaseDate.value?.trim()
  if (copyrightText) parts.push(copyrightText)
  if (dateText) parts.push(dateText)
  return parts.length > 0 ? parts.join(' · ') : null
})

/** Year for sort: missing/invalid → +∞ so unknown years sort after dated albums (ascending). */
function albumYearSortKey(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : Number.POSITIVE_INFINITY
}

function formatAlbumYearLabel(value: string | null): string {
  if (!value) return t('albums.detail.unknownYear')
  const yearText = value.slice(0, 4)
  if (!/^\d{4}$/.test(yearText)) return t('albums.detail.unknownYear')
  const year = Number(yearText)
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, 0, 1)),
  )
}

const albumReleaseYear = computed(() => formatAlbumYearLabel(releaseDate.value))

/**
 * Other albums by the same album-artist key as the current detail page.
 * Cards navigate to that album's detail page via openAlbum.
 */
const moreAlbumsByArtist = computed<AlbumSummary[]>(() => {
  const artistKey = albumArtist.value
  if (!artistKey || artistKey === 'Unknown Artist') return []

  const currentKey = `${artistKey}\u0000${albumTitle.value}`
  const grouped = new Map<string, AlbumSummary>()

  for (const track of tracks.value) {
    const albumArtistName = track.albumArtist || track.artist || 'Unknown Artist'
    if (albumArtistName !== artistKey) continue

    const title = track.album || 'Unknown Album'
    const key = `${albumArtistName}\u0000${title}`
    if (key === currentKey) continue

    const existing = grouped.get(key)
    if (existing) {
      existing.releaseDate ??= track.releaseDate
      existing.artworkCacheKey ??= track.artworkCacheKey
      existing.tracks.push(track)
      continue
    }

    grouped.set(key, {
      key,
      title,
      albumArtist: albumArtistName,
      releaseDate: track.releaseDate,
      artworkCacheKey: track.artworkCacheKey,
      tracks: [track],
    })
  }

  return [...grouped.values()].sort((left, right) => {
    const yearOrder = albumYearSortKey(left.releaseDate) - albumYearSortKey(right.releaseDate)
    if (yearOrder !== 0) return yearOrder
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
})

const showMoreAlbumsSection = computed(
  () => albumTracks.value.length > 0 && moreAlbumsByArtist.value.length > 0,
)

async function refreshMoreAlbumsScrollState(): Promise<void> {
  if (loadState.value !== 'ready' || !showMoreAlbumsSection.value) {
    resetMoreAlbumsScrollState()
    return
  }

  await nextTick()
  if (isPageUnmounted || loadState.value !== 'ready' || !showMoreAlbumsSection.value) return

  const scroller = moreAlbumsScrollerRef.value
  if (scroller) {
    updateMoreAlbumsScrollState(scroller)
  } else {
    resetMoreAlbumsScrollState()
  }
}

/**
 * 多碟分组：至少两个不同有效 discNo（null 视为 1）时才分组并显示 Disc 头。
 * 单碟或全同一碟时 discNo 为 null，模板不渲染分组头。
 */
const albumDiscGroups = computed(() => {
  const tracksInAlbum = albumTracks.value
  if (tracksInAlbum.length === 0) return [] as { discNo: number | null; tracks: TrackListItem[] }[]

  const distinctDiscs = new Set(tracksInAlbum.map((track) => track.discNo ?? 1))
  if (distinctDiscs.size < 2) {
    return [{ discNo: null, tracks: tracksInAlbum }]
  }

  const groups: { discNo: number; tracks: TrackListItem[] }[] = []
  for (const track of tracksInAlbum) {
    const discNo = track.discNo ?? 1
    const last = groups[groups.length - 1]
    if (last && last.discNo === discNo) {
      last.tracks.push(track)
    } else {
      groups.push({ discNo, tracks: [track] })
    }
  }
  return groups
})

/**
 * 静态极光：离屏 16×16 采样 + 四角径向渐变，单帧绘制，无 rAF 循环。
 * 见 docs/topics/albums/techdoc-album-detail-hero-billboard-redesign.md §3.1
 */
function updateHeroStaticFluid(url: string | null, canvas: HTMLCanvasElement): void {
  if (isPageUnmounted || !isModernAlbumDetail.value) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const parentRect = canvas.parentElement?.getBoundingClientRect()
  const width = Math.max(
    1,
    Math.floor(parentRect?.width || canvas.parentElement?.clientWidth || 800),
  )
  const height = Math.max(
    1,
    Math.floor(parentRect?.height || canvas.parentElement?.clientHeight || 280),
  )
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const generation = ++heroFluidGeneration

  const fillBase = () => {
    ctx.fillStyle = '#0a0b0d'
    ctx.fillRect(0, 0, width, height)
  }

  if (!url) {
    fillBase()
    return
  }

  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    if (generation !== heroFluidGeneration || isPageUnmounted || !isModernAlbumDetail.value) {
      return
    }

    const offscreen = document.createElement('canvas')
    offscreen.width = 16
    offscreen.height = 16
    const oCtx = offscreen.getContext('2d', { willReadFrequently: true })
    if (!oCtx) return

    oCtx.drawImage(img, 0, 0, 16, 16)
    let data: Uint8ClampedArray
    try {
      data = oCtx.getImageData(0, 0, 16, 16).data
    } catch {
      fillBase()
      return
    }

    const c1 = `rgb(${data[0]}, ${data[1]}, ${data[2]})`
    const c2 = `rgb(${data[15 * 4]}, ${data[15 * 4 + 1]}, ${data[15 * 4 + 2]})`
    const c3 = `rgb(${data[16 * 15 * 4]}, ${data[16 * 15 * 4 + 1]}, ${data[16 * 15 * 4 + 2]})`
    const c4 = `rgb(${data[(16 * 16 - 1) * 4]}, ${data[(16 * 16 - 1) * 4 + 1]}, ${data[(16 * 16 - 1) * 4 + 2]})`

    fillBase()
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.75

    const drawBlob = (x: number, y: number, r: number, color: string) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    drawBlob(width * 0.15, height * 0.3, width * 0.45, c1)
    drawBlob(width * 0.85, height * 0.2, width * 0.4, c2)
    drawBlob(width * 0.25, height * 0.9, width * 0.5, c3)
    drawBlob(width * 0.75, height * 0.8, width * 0.45, c4)
    ctx.restore()
  }
  img.onerror = () => {
    if (generation !== heroFluidGeneration || isPageUnmounted || !isModernAlbumDetail.value) {
      return
    }
    fillBase()
  }
  img.src = url
}

function paintHeroFluid(): void {
  if (isPageUnmounted || !isModernAlbumDetail.value) return
  const canvas = heroCanvasRef.value
  if (!canvas) return
  updateHeroStaticFluid(artworkUrl.value, canvas)
}

function retryLoad(): void {
  void reloadTracks()
}

function goBack(): void {
  void router.push({ name: 'albums' })
}

function openAlbum(album: AlbumSummary): void {
  if (album.albumArtist === albumArtist.value && album.title === albumTitle.value) return

  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

function showSearchResultHighlight(): void {
  if (highlightTimeout) {
    clearTimeout(highlightTimeout)
    highlightTimeout = null
  }
  highlightedTrackId.value = null

  const trackId = Number(route.query.highlight)
  if (!Number.isInteger(trackId) || !albumTracks.value.some((track) => track.id === trackId)) return

  highlightedTrackId.value = trackId
  requestAnimationFrame(() => {
    detailRootRef.value
      ?.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  highlightTimeout = setTimeout(() => {
    highlightedTrackId.value = null
    highlightTimeout = null
  }, 1800)
}

function buildAlbumPlaybackQueue(): TrackListItem[] {
  if (playback.state.playbackMode !== 'sequential') {
    return albumTracks.value
  }

  const currentAlbumKey = `${albumArtist.value}\u0000${albumTitle.value}`
  const albumIndex = albumGroups.value.findIndex((album) => album.key === currentAlbumKey)
  if (albumIndex < 0) return albumTracks.value

  const followingAlbumTracks = albumGroups.value
    .slice(albumIndex + 1)
    .flatMap((album) => album.tracks)

  return [...albumTracks.value, ...followingAlbumTracks]
}

function playAlbum(): void {
  const firstTrack = albumTracks.value[0]
  if (!firstTrack) return
  void playback.playTrackFromQueue(buildAlbumPlaybackQueue(), firstTrack.id)
}

/**
 * 随机播放：切到全局 shuffle，并将 shufflePool 限定为本专辑曲目。
 * 与曲库 scoped playlist 一致（playTrackFromQueue + shufflePool），
 * 不改用 album-shuffle（后者会跨专辑跳转，语义不符）。
 */
function playAlbumShuffle(): void {
  const pool = albumTracks.value
  if (pool.length === 0) return

  const startTrack = pool[Math.floor(Math.random() * pool.length)]
  if (!startTrack) return

  playback.setPlaybackMode('shuffle')
  void playback.playTrackFromQueue(pool, startTrack.id, { shufflePool: pool })
}

function playTrack(trackId: number): void {
  void playback.playTrackFromQueue(buildAlbumPlaybackQueue(), trackId)
}

/** Map vertical wheel to horizontal scroll for 'More Albums' section with boundary pass-through. */
function onMoreAlbumsWheel(event: WheelEvent): void {
  const scroller = event.currentTarget as HTMLElement
  if (scroller.scrollWidth <= scroller.clientWidth + 1) return

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return

  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth

  if (
    (delta < 0 && scroller.scrollLeft > 0) ||
    (delta > 0 && scroller.scrollLeft < maxScrollLeft - 1)
  ) {
    event.preventDefault()
    scroller.scrollLeft += delta
    updateMoreAlbumsScrollState(scroller)
  }
}

function selectTrack(trackId: number): void {
  playback.selectTrack(trackId)
}

function resetCoverTracking(): void {
  pointerPosition = null
  if (trackingFrame !== null) {
    window.cancelAnimationFrame(trackingFrame)
    trackingFrame = null
  }

  const stage = coverStageRef.value
  if (!stage) return
  stage.style.removeProperty('--detail-cover-rotate-x')
  stage.style.removeProperty('--detail-cover-rotate-y')
  stage.style.removeProperty('--detail-cover-shift-x')
  stage.style.removeProperty('--detail-cover-shift-y')
  stage.style.removeProperty('--detail-cover-shadow-x')
  stage.style.removeProperty('--detail-cover-shadow-y')
}

function renderCoverTracking(): void {
  trackingFrame = null
  const stage = coverStageRef.value
  const pointer = pointerPosition
  if (
    !stage ||
    !pointer ||
    reducedMotionQuery.matches ||
    isPageUnmounted ||
    !isModernAlbumDetail.value
  ) {
    return
  }

  const rect = stage.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const horizontalRange = Math.max(centerX, window.innerWidth - centerX, 1)
  const verticalRange = Math.max(centerY, window.innerHeight - centerY, 1)
  const xRatio = Math.min(1, Math.max(-1, (pointer.x - centerX) / horizontalRange))
  const yRatio = Math.min(1, Math.max(-1, (pointer.y - centerY) / verticalRange))

  stage.style.setProperty('--detail-cover-rotate-x', `${-yRatio * MAX_COVER_TILT_DEGREES}deg`)
  stage.style.setProperty('--detail-cover-rotate-y', `${xRatio * MAX_COVER_TILT_DEGREES}deg`)
  stage.style.setProperty('--detail-cover-shift-x', `${xRatio * 5}px`)
  stage.style.setProperty('--detail-cover-shift-y', `${yRatio * 5}px`)
  stage.style.setProperty('--detail-cover-shadow-x', `${-xRatio * 12}px`)
  stage.style.setProperty('--detail-cover-shadow-y', `${18 - yRatio * 10}px`)
}

function scheduleCoverTracking(): void {
  if (trackingFrame === null) {
    trackingFrame = window.requestAnimationFrame(renderCoverTracking)
  }
}

function onDocumentPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch' || reducedMotionQuery.matches || !isModernAlbumDetail.value) {
    return
  }
  pointerPosition = { x: event.clientX, y: event.clientY }
  scheduleCoverTracking()
}

function onDocumentPointerOut(event: PointerEvent): void {
  if (event.relatedTarget === null) {
    resetCoverTracking()
  }
}

function onReducedMotionChange(): void {
  if (reducedMotionQuery.matches) {
    resetCoverTracking()
  }
}

function bindHeroResizeObserver(): void {
  heroResizeObserver?.disconnect()
  heroResizeObserver = null
  const billboard = heroBillboardRef.value
  if (
    !billboard ||
    typeof ResizeObserver === 'undefined' ||
    isPageUnmounted ||
    !isModernAlbumDetail.value
  ) {
    return
  }

  heroResizeObserver = new ResizeObserver(() => {
    if (isModernAlbumDetail.value && !isPageUnmounted) paintHeroFluid()
  })
  heroResizeObserver.observe(billboard)
}

function bindDetailScrollListener(): void {
  const nextTarget = detailRootRef.value
  if (detailScrollTarget === nextTarget) return
  detailScrollTarget?.removeEventListener('scroll', scheduleCoverTracking)
  detailScrollTarget = nextTarget
  detailScrollTarget?.addEventListener('scroll', scheduleCoverTracking, { passive: true })
}

function unbindDetailScrollListener(): void {
  detailScrollTarget?.removeEventListener('scroll', scheduleCoverTracking)
  detailScrollTarget = null
}

async function enableModernEffects(): Promise<void> {
  if (isPageUnmounted || !isModernAlbumDetail.value || loadState.value !== 'ready') return
  const activationGeneration = ++modernEffectsActivationGeneration

  if (!modernEffectsBound) {
    modernEffectsBound = true
    document.addEventListener('pointermove', onDocumentPointerMove, { passive: true })
    document.addEventListener('pointerout', onDocumentPointerOut)
    window.addEventListener('blur', resetCoverTracking)
    reducedMotionQuery.addEventListener('change', onReducedMotionChange)
  }

  await nextTick()
  if (
    isPageUnmounted ||
    !isModernAlbumDetail.value ||
    loadState.value !== 'ready' ||
    !modernEffectsBound ||
    activationGeneration !== modernEffectsActivationGeneration
  ) {
    return
  }
  bindDetailScrollListener()
  bindHeroResizeObserver()
  paintHeroFluid()
}

function disableModernEffects(): void {
  modernEffectsActivationGeneration += 1
  resetCoverTracking()
  heroFluidGeneration += 1
  heroResizeObserver?.disconnect()
  heroResizeObserver = null
  unbindDetailScrollListener()

  if (!modernEffectsBound) return
  modernEffectsBound = false
  document.removeEventListener('pointermove', onDocumentPointerMove)
  document.removeEventListener('pointerout', onDocumentPointerOut)
  window.removeEventListener('blur', resetCoverTracking)
  reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
}

watch(
  () => [albumArtist.value, albumTitle.value] as const,
  async () => {
    const wasReady = loadState.value === 'ready'
    await nextTick()
    if (isPageUnmounted) return
    if (loadState.value !== 'loading' && loadState.value !== 'error') syncLoadStateFromTracks()
    detailRootRef.value?.scrollTo({ top: 0 })
    if (wasReady && loadState.value === 'ready') showSearchResultHighlight()
    void refreshMoreAlbumsScrollState()
    if (isModernAlbumDetail.value) void enableModernEffects()
  },
)

watch(artworkUrl, async () => {
  await nextTick()
  if (isModernAlbumDetail.value && !isPageUnmounted) paintHeroFluid()
})

watch(
  () => albumTracks.value.length,
  async (length) => {
    if (length <= 0) return
    await nextTick()
    if (isModernAlbumDetail.value && !isPageUnmounted) void enableModernEffects()
  },
)

watch(
  () => moreAlbumsByArtist.value.map((album) => album.key).join('\u0001'),
  () => {
    void refreshMoreAlbumsScrollState()
  },
)

watch(albumPresentation, (presentation) => {
  if (presentation === 'modern' && loadState.value === 'ready') {
    void enableModernEffects()
  } else {
    disableModernEffects()
  }
})

watch(loadState, async (state, previousState) => {
  if (state === 'ready') {
    if (previousState !== 'ready') {
      await nextTick()
      if (isPageUnmounted || loadState.value !== 'ready') return
      showSearchResultHighlight()
    }
    void refreshMoreAlbumsScrollState()
    if (isModernAlbumDetail.value) {
      void enableModernEffects()
    } else {
      disableModernEffects()
    }
  } else {
    resetMoreAlbumsScrollState()
    disableModernEffects()
  }
})

onMounted(async () => {
  await initializeAlbumTracks()
})

onBeforeUnmount(() => {
  isPageUnmounted = true
  disposeAlbumTracks()
  disableModernEffects()
  if (highlightTimeout) clearTimeout(highlightTimeout)
})
</script>

<template>
  <div
    class="album-detail-container album-detail-page h-full w-full relative bg-transparent"
    :data-visual-style="albumPresentation"
  >
    <section
      v-if="loadState === 'ready'"
      ref="detailRootRef"
      class="album-detail-scroll-wrapper h-full w-full overflow-y-auto relative z-10"
    >
      <button
        class="album-detail-back"
        type="button"
        :aria-label="t('albums.detail.back')"
        @click="goBack"
      >
        <span class="i-lucide-arrow-left" aria-hidden="true" />
        <span>{{ t('albums.detail.back') }}</span>
      </button>

      <div class="album-detail-wrapper">
        <!-- Phase 1: Hero 巨幕 Banner -->
        <section
          ref="heroBillboardRef"
          class="album-hero-billboard"
          :aria-label="t('albums.detail.heroAria', { title: displayAlbumTitle })"
        >
          <canvas
            v-if="isModernAlbumDetail"
            ref="heroCanvasRef"
            class="album-hero-static-canvas"
            aria-hidden="true"
          ></canvas>

          <!-- 上半部分：主内容层（封面 + 信息流 + 对齐封面底部的操作按钮） -->
          <div class="album-hero-main-stage">
            <!-- 左侧：封面舞台 -->
            <div ref="coverStageRef" class="album-hero-cover-container">
              <div class="album-hero-cover">
                <img
                  v-if="artworkUrl"
                  :src="artworkUrl"
                  :alt="t('albums.detail.coverAlt', { title: displayAlbumTitle })"
                  class="h-full w-full object-cover"
                  decoding="async"
                  draggable="false"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center"
                  aria-hidden="true"
                >
                  <span
                    class="i-lucide-disc-3 h-16 w-16 text-[var(--auralis-text-disabled)]"
                  ></span>
                </div>
              </div>
            </div>

            <!-- 中间：信息主干流（右侧安全避让操作按钮） -->
            <div class="album-hero-content-stage">
              <!-- Zone 1: 流派与类别 -->
              <div class="album-hero-zone-genres select-none">
                <span class="album-badge">ALBUM</span>
                <div v-if="albumGenrePills.length > 0" class="album-genre-pills">
                  <button
                    v-for="genre in albumGenrePills"
                    :key="genre"
                    type="button"
                    class="album-genre-pill"
                    :title="genre"
                    @click="onGenrePillClick(genre)"
                  >
                    {{ genre }}
                  </button>
                </div>
              </div>

              <!-- Zone 2: 核心文本（纯元数据） -->
              <div class="album-hero-zone-primary">
                <div class="album-hero-meta-block">
                  <h1 class="album-hero-title select-none" :title="displayAlbumTitle">
                    {{ displayAlbumTitle }}
                  </h1>
                  <div class="album-hero-artist-row select-text">
                    <button
                      v-if="albumArtist && albumArtist !== 'Unknown Artist'"
                      type="button"
                      class="album-hero-artist-btn"
                      :title="displayAlbumArtist"
                      @click="onArtistClick"
                    >
                      {{ displayAlbumArtist }}
                    </button>
                    <span v-else class="album-hero-artist-text">{{ displayAlbumArtist }}</span>
                    <span class="album-hero-artist-dot" aria-hidden="true">·</span>
                    <span class="album-hero-year-text">{{ albumReleaseYear }}</span>
                  </div>
                </div>
              </div>

              <!-- Zone 3: 播放度量与 3D 翻转统计（轻量无底色纯文字行） -->
              <div class="album-hero-zone-metrics select-none">
                <div class="album-hero-metric-item">
                  <span class="album-hero-metric-label">{{
                    t('albums.detail.metrics.tracks')
                  }}</span>
                  <span class="album-hero-metric-value">{{ metricsTrackCount }}</span>
                </div>
                <div class="album-hero-metric-item">
                  <span class="album-hero-metric-label">{{
                    t('albums.detail.metrics.duration')
                  }}</span>
                  <span class="album-hero-metric-value">{{ metricsTotalDuration }}</span>
                </div>

                <!-- 3D 滚筒翻转微交互（Zero Layout Shift 原地翻转） -->
                <div
                  class="album-hero-metric-flipper-stage"
                  tabindex="0"
                  role="region"
                  :aria-label="t('albums.detail.metrics.stats')"
                >
                  <!-- 隐藏测宽占位层：锁定正反两面最大物理尺寸，确保左侧指标绝对不发生任何横向抖动 -->
                  <div class="album-hero-metric-flipper-measure" aria-hidden="true">
                    <span class="album-hero-metric-label">{{
                      t('albums.detail.metrics.plays')
                    }}</span>
                    <span class="album-hero-metric-value">{{ metricsPlaysLabel }}</span>
                    <span class="album-hero-metric-label">{{
                      t('albums.detail.metrics.listened')
                    }}</span>
                    <span class="album-hero-metric-value">{{ metricsTotalTime }}</span>
                  </div>

                  <!-- 3D 滚筒主体（preserve-3d） -->
                  <div class="album-hero-flipper-cube">
                    <!-- 正面（默认态）：向右的箭头 -->
                    <div class="album-hero-flipper-face album-hero-flipper-face--front">
                      <svg
                        class="album-hero-flipper-arrow"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>

                    <!-- 背面（悬停翻出）：已听次数与累计收听时长 -->
                    <div class="album-hero-flipper-face album-hero-flipper-face--back">
                      <span class="album-hero-metric-label">{{
                        t('albums.detail.metrics.plays')
                      }}</span>
                      <span class="album-hero-metric-value">{{ metricsPlaysLabel }}</span>
                      <span class="album-hero-metric-label">{{
                        t('albums.detail.metrics.listened')
                      }}</span>
                      <span class="album-hero-metric-value">{{ metricsTotalTime }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：严格与封面底边对齐的 Hero Action 大按钮组 -->
            <div class="album-hero-actions">
              <button class="album-hero-play-btn" type="button" @click="playAlbum">
                <span class="i-lucide-play h-5 w-5 fill-current" aria-hidden="true"></span>
                <span>{{ t('albums.detail.play') }}</span>
              </button>
              <button class="album-hero-shuffle-btn" type="button" @click="playAlbumShuffle">
                <span class="i-lucide-shuffle h-[18px] w-[18px]" aria-hidden="true"></span>
                <span>{{ t('albums.detail.shuffle') }}</span>
              </button>
            </div>
          </div>

          <!-- 下半部分：底部脚注层（横跨全宽，完整横向展开，低于按钮与封面底边） -->
          <div v-if="heroLegalLine" class="album-hero-footer-stage select-none">
            <p class="album-hero-legal-text" :title="heroLegalLine">
              {{ heroLegalLine }}
            </p>
          </div>
        </section>

        <!-- 中部：通栏曲目 -->
        <div class="album-body-grid">
          <AlbumDetailTrackList
            :groups="albumDiscGroups"
            :album-artist="albumArtist"
            :selected-track-id="playback.state.selectedTrackId"
            :current-track-id="playback.state.currentTrackId"
            :highlighted-track-id="highlightedTrackId"
            @select="selectTrack"
            @play="playTrack"
          />
        </div>

        <!-- Phase 3: 底部同艺人画廊 -->
        <section
          v-if="showMoreAlbumsSection"
          class="album-more-gallery"
          :aria-label="t('albums.detail.moreAlbumsAria', { artist: displayAlbumArtist })"
        >
          <h2 class="album-more-gallery-title">
            {{ t('albums.detail.moreAlbumsTitle', { artist: displayAlbumArtist }) }}
          </h2>
          <div
            ref="moreAlbumsScrollerRef"
            class="album-more-gallery-scroller"
            :class="{
              'is-at-start': isMoreScrolledToStart,
              'is-at-end': isMoreScrolledToEnd,
              'is-unscrollable': !isMoreScrollable,
            }"
            @scroll="onMoreAlbumsScroll"
            @wheel="onMoreAlbumsWheel"
          >
            <button
              v-for="album in moreAlbumsByArtist"
              :key="album.key"
              type="button"
              class="album-more-gallery-card"
              :aria-label="
                t('albums.detail.openAlbumAria', { title: formatDisplayAlbumTitle(album.title) })
              "
              @click="openAlbum(album)"
            >
              <div class="album-more-gallery-cover">
                <img
                  v-if="getArtworkUrl(album.artworkCacheKey)"
                  :src="getArtworkUrl(album.artworkCacheKey)!"
                  :alt="
                    t('albums.detail.coverAlt', { title: formatDisplayAlbumTitle(album.title) })
                  "
                  class="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
                  aria-hidden="true"
                >
                  <span
                    class="i-lucide-disc-3 h-10 w-10 text-[var(--auralis-text-disabled)]"
                  ></span>
                </div>
              </div>
              <div class="album-more-gallery-meta">
                <p class="album-more-gallery-album-title">
                  {{ formatDisplayAlbumTitle(album.title) }}
                </p>
                <p class="album-more-gallery-year">
                  {{ formatAlbumYearLabel(album.releaseDate) }}
                </p>
              </div>
            </button>
          </div>
        </section>
      </div>
    </section>

    <div
      v-else
      class="album-detail-state flex min-h-[60vh] items-center justify-center relative z-10"
      :class="`album-detail-state--${loadState}`"
      :aria-live="loadState === 'loading' ? 'polite' : 'assertive'"
    >
      <div class="album-detail-state-content text-center">
        <p class="album-detail-state-message text-base font-semibold text-[var(--auralis-text)]">
          {{
            loadState === 'loading'
              ? t('albums.detail.loading')
              : loadState === 'error'
                ? t('albums.detail.loadError')
                : t('albums.detail.notFound')
          }}
        </p>
        <button
          v-if="loadState === 'error'"
          class="album-detail-state-action mt-3 text-sm text-[var(--auralis-sidebar-active-text)]"
          type="button"
          @click="retryLoad"
        >
          {{ t('albums.detail.retry') }}
        </button>
        <button
          v-if="loadState !== 'loading'"
          class="album-detail-state-action mt-3 text-sm text-[var(--auralis-sidebar-active-text)]"
          type="button"
          @click="goBack"
        >
          {{ t('albums.detail.returnToAlbums') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.album-detail-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.album-detail-scroll-wrapper {
  padding: var(--auralis-shell-edge-gap) 32px calc(var(--auralis-playbar-safe-area) + 40px);
}

.album-detail-back {
  position: relative;
  z-index: 70;
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: color 0.2s ease;
}

.album-detail-back .i-lucide-arrow-left {
  width: 12px;
  height: 12px;
}

.album-detail-back:hover {
  color: var(--auralis-text);
}

.album-detail-back:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 3px;
}

/* —— 三段式外壳 —— */
.album-detail-wrapper {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-width: 0;
}

/* —— Phase 1: Hero Billboard —— */
.album-hero-billboard {
  --album-hero-cover-size: 176px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 32px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 88%, #000);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
}

.album-hero-static-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.9;
  border-radius: inherit;
}

/* 上半部分：主内容层（封面 + 信息流 + 按钮） */
.album-hero-main-stage {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  min-height: var(--album-hero-cover-size);
  grid-template-columns: var(--album-hero-cover-size) minmax(0, 1fr);
  column-gap: 32px;
  align-items: start;
}

.album-hero-cover-container {
  --detail-cover-rotate-x: 0deg;
  --detail-cover-rotate-y: 0deg;
  --detail-cover-shift-x: 0px;
  --detail-cover-shift-y: 0px;
  --detail-cover-shadow-x: 0px;
  --detail-cover-shadow-y: 18px;
  position: relative;
  z-index: 1;
  width: var(--album-hero-cover-size);
  height: var(--album-hero-cover-size);
  perspective: 900px;
}

.album-hero-cover-container::before {
  position: absolute;
  inset: 6%;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.4);
  content: '';
  filter: blur(18px);
  pointer-events: none;
  transform: translate3d(var(--detail-cover-shadow-x), var(--detail-cover-shadow-y), -20px);
  transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.album-hero-cover-container::after {
  position: absolute;
  inset: 8%;
  border-radius: 18px;
  background: v-bind(artworkGlowBackground);
  background-size: cover;
  background-position: center;
  content: '';
  filter: blur(28px) saturate(1.8);
  opacity: 0.55;
  pointer-events: none;
  z-index: -1;
  transform: translate3d(
      calc(var(--detail-cover-shadow-x) * 1.2),
      calc(var(--detail-cover-shadow-y) * 1.2),
      -30px
    )
    scale(0.95);
  transition:
    transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.3s;
  will-change: transform;
}

.album-hero-cover {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 16px;
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform: translate3d(var(--detail-cover-shift-x), var(--detail-cover-shift-y), 0)
    rotateX(var(--detail-cover-rotate-x)) rotateY(var(--detail-cover-rotate-y));
  transform-style: preserve-3d;
  transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.album-hero-content-stage {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 250px;
  color: #f4f1ea;
}

/* Zone 1: 流派与类别 */
.album-hero-zone-genres {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.album-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.album-genre-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.album-genre-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid
    color-mix(in srgb, var(--auralis-active-album-accent, #818cf8) 35%, rgba(255, 255, 255, 0.16));
  color: var(--auralis-active-album-accent, rgba(255, 255, 255, 0.92));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.3;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.album-genre-pill:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: var(--auralis-active-album-accent, #a5b4fc);
  color: #ffffff;
  transform: translateY(-1px);
  filter: brightness(1.15);
  box-shadow: 0 4px 12px
    color-mix(in srgb, var(--auralis-active-album-accent, #818cf8) 30%, transparent);
}

.album-genre-pill:active {
  transform: translateY(0);
}

/* Zone 2: 核心文本与主操作 */
.album-hero-zone-primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
}

.album-hero-meta-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}

.album-hero-title {
  margin: 0;
  padding-bottom: 6px;
  box-sizing: border-box;
  max-width: 100%;
  color: #ffffff;
  font-family: 'Auralis Desktop Lyrics SC', 'Times New Roman', serif;
  font-size: clamp(24px, 2.8vw, 38px);
  font-weight: 800;
  line-height: 1.22;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  user-select: none;
}

.album-hero-artist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.92);
}

.album-hero-artist-btn {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 17px;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-hero-artist-btn:hover {
  color: #ffffff;
  text-decoration: underline;
}

.album-hero-artist-text {
  color: rgba(255, 255, 255, 0.92);
  font-size: 17px;
  font-weight: 650;
}

.album-hero-artist-dot {
  color: rgba(255, 255, 255, 0.4);
  user-select: none;
}

.album-hero-year-text {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
}

.album-hero-actions {
  position: absolute;
  right: 0;
  top: calc(var(--album-hero-cover-size) - 48px);
  height: 48px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
}

.album-hero-play-btn {
  display: inline-flex;
  width: fit-content;
  min-width: 124px;
  height: 48px;
  padding: 0 24px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    var(--auralis-active-album-accent, #6366f1) 0%,
    color-mix(in srgb, var(--auralis-active-album-accent, #6366f1) 75%, #000) 100%
  );
  color: #ffffff;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0.02em;
  box-shadow:
    0 8px 24px color-mix(in srgb, var(--auralis-active-album-accent, #6366f1) 50%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: all 0.22s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}

.album-hero-play-btn:hover {
  transform: translateY(-2px) scale(1.02);
  filter: brightness(1.1);
  box-shadow:
    0 12px 28px color-mix(in srgb, var(--auralis-active-album-accent, #6366f1) 60%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.album-hero-play-btn:active {
  transform: translateY(1px) scale(0.98);
}

.album-hero-shuffle-btn {
  display: inline-flex;
  width: fit-content;
  min-width: 112px;
  height: 48px;
  padding: 0 20px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  font-weight: 650;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}

.album-hero-shuffle-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.32);
  color: #ffffff;
  transform: translateY(-1px);
}

.album-hero-shuffle-btn:active {
  transform: translateY(0);
}

/* Zone 3: 播放度量与 3D 翻转统计（轻量无底色纯文字行） */
.album-hero-zone-metrics {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 20px;
  width: fit-content;
  max-width: 100%;
}

.album-hero-metric-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.album-hero-metric-label {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.2px;
}

.album-hero-metric-value {
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* —— 3D 滚筒翻转微交互（Zero Layout Shift 原地翻转） —— */
.album-hero-metric-flipper-stage {
  position: relative;
  height: 20px;
  perspective: 500px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  outline: none;
}

.album-hero-metric-flipper-stage:focus-visible {
  outline: 1px dashed rgba(255, 255, 255, 0.35);
  outline-offset: 3px;
  border-radius: 4px;
}

/* 测量层：不可见但占据物理空间，锁定正反面统一宽度，杜绝左侧任何抖动 */
.album-hero-metric-flipper-measure {
  visibility: hidden;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  user-select: none;
}

/* 滚筒本体：X 轴 3D 旋转体 */
.album-hero-metric-flipper-cube {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition: transform 380ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
}

/* 悬停或获得焦点时原地翻滚 180° */
.album-hero-metric-flipper-stage:hover .album-hero-metric-flipper-cube,
.album-hero-metric-flipper-stage:focus-visible .album-hero-metric-flipper-cube {
  transform: rotateX(180deg);
}

/* 正反面基础属性 */
.album-hero-flipper-face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* 正面：向右的箭头 */
.album-hero-flipper-face--front {
  transform: rotateX(0deg);
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.45);
  transition: color 0.2s ease;
}

.album-hero-metric-flipper-stage:hover .album-hero-flipper-face--front {
  color: #ffffff;
}

.album-hero-flipper-arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.2s ease;
}

.album-hero-metric-flipper-stage:hover .album-hero-flipper-arrow {
  transform: translateX(2px);
}

/* 背面：绕 X 轴预转 180° */
.album-hero-flipper-face--back {
  transform: rotateX(180deg);
  gap: 8px;
}

/* 下半部分：底部脚注层（横跨全宽，完整横向平铺展开） */
.album-hero-footer-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  padding-top: 2px;
}

.album-hero-legal-text {
  margin: 0;
  width: 100%;
  color: rgba(255, 255, 255, 0.32);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0.01em;
  white-space: normal;
  word-break: break-word;
  user-select: none;
}

/* —— 中部：通栏曲目 —— */
.album-body-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  align-items: start;
  min-width: 0;
  position: relative;
}

/* —— Phase 3: More gallery —— */
.album-more-gallery {
  margin-top: 36px;
  margin-right: 0;
  margin-left: 0;
  padding: 0 0 16px;
  border-top: none;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.album-more-gallery::before {
  content: '';
  display: block;
  height: 1px;
  margin-bottom: 24px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--auralis-text) 16%, transparent) 0%,
    color-mix(in srgb, var(--auralis-text) 4%, transparent) 70%,
    transparent 100%
  );
}

.album-more-gallery-title {
  margin: 0 0 16px;
  color: var(--auralis-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.album-more-gallery-scroller {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 16px 16px;
  margin-top: -4px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;

  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    #000 28px,
    #000 calc(100% - 28px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    #000 28px,
    #000 calc(100% - 28px),
    transparent 100%
  );
  transition:
    -webkit-mask-image 0.25s ease,
    mask-image 0.25s ease;
}

.album-more-gallery-scroller.is-at-start {
  -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 28px), transparent 100%);
  mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 28px), transparent 100%);
}

.album-more-gallery-scroller.is-at-end {
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 28px, #000 100%);
  mask-image: linear-gradient(to right, transparent 0%, #000 28px, #000 100%);
}

.album-more-gallery-scroller.is-unscrollable,
.album-more-gallery-scroller.is-at-start.is-at-end {
  -webkit-mask-image: none;
  mask-image: none;
}

.album-more-gallery-scroller::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.album-more-gallery-card {
  flex: 0 0 auto;
  width: 144px;
  min-width: 144px;
  scroll-snap-align: start;
  appearance: none;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  box-shadow: none;
}

.album-more-gallery-cover {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 14px;
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.35s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}

.album-more-gallery-card:hover .album-more-gallery-cover {
  transform: translateY(-6px) scale(1.03);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.5),
    0 0 20px
      color-mix(
        in srgb,
        var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator, #6366f1)) 35%,
        transparent
      );
}

.album-more-gallery-meta {
  margin-top: 10px;
  min-width: 0;
}

.album-more-gallery-album-title {
  overflow: hidden;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-more-gallery-year {
  margin-top: 4px;
  color: var(--auralis-text-faint);
  font-size: 12px;
}

@media (max-width: 959px) {
  .album-hero-billboard {
    --album-hero-cover-size: 160px;
    padding: 20px;
    gap: 14px;
  }

  .album-hero-main-stage {
    column-gap: 20px;
  }

  .album-body-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 780px) {
  .album-hero-content-stage {
    padding-right: 0;
  }

  .album-hero-actions {
    position: static;
    margin-top: 10px;
  }
}

@media (max-width: 680px) {
  .album-hero-zone-primary {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
}

@media (max-width: 640px) {
  .album-hero-main-stage {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 18px;
  }

  .album-hero-cover-container {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .album-hero-metric-flipper-cube {
    transition: none !important;
  }

  .album-hero-cover,
  .album-hero-cover-container::before,
  .album-hero-cover-container::after {
    transform: none !important;
    transition: none !important;
  }

  .album-more-gallery-card:hover {
    transform: none;
  }

  .album-hero-play-btn:hover,
  .album-hero-shuffle-btn:hover,
  .album-genre-pill:hover,
  .album-detail-back:hover {
    transform: none;
  }
}
</style>
