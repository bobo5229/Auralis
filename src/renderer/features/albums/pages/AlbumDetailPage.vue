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
import { formatGenreParts, splitGenreValues } from '@renderer/features/library/utils/formatGenre'

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
const HERO_CANVAS_HEIGHT = 250

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

/** Top album genres as display string: single label, or `A & B` when two dominate. */
const dominantGenreLabel = computed(() =>
  formatGenreParts(
    collectGenreCounts()
      .slice(0, 2)
      .map((genre) => genre.label),
  ),
)

/** Meta 行年份：仅合法四位数字；无效/缺失返回 null（meta 中省略，不写「未知」）。 */
function formatAlbumYearForMeta(value: string | null): string | null {
  if (!value) return null
  const year = value.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : null
}

const albumYearLabel = computed(() => formatAlbumYearForMeta(releaseDate.value))

/** Hero eyebrow：Year · Genre (multi-value uses A & B form) */
const heroEyebrow = computed(() => {
  const parts = [albumYearLabel.value, dominantGenreLabel.value || null].filter(
    (item): item is string => item != null && item !== '',
  )
  return parts.join(' · ')
})

/** Hero 副行：Artist · Tracks · Duration */
const heroSubItems = computed(() =>
  [
    displayAlbumArtist.value,
    formatTrackCount(albumTracks.value.length),
    formatAlbumDuration(totalDurationSeconds.value),
  ].filter((item) => item !== ''),
)

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

/** 估算收听：playCount 之和与 playCount * duration 之和（非精确会话时长）。 */
const albumListenSummary = computed(() => {
  let totalPlays = 0
  let listenedSeconds = 0

  for (const track of albumTracks.value) {
    const playCount = track.playCount ?? 0
    totalPlays += playCount
    listenedSeconds += playCount * (track.durationSeconds ?? 0)
  }

  if (totalPlays <= 0) return null

  return {
    totalPlays,
    label: formatListenSummaryLabel(totalPlays, listenedSeconds),
  }
})

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

function formatListenSummaryLabel(totalPlays: number, listenedSeconds: number): string {
  if (listenedSeconds <= 0) {
    return t('albums.detail.listenSummary.plays', { count: totalPlays })
  }

  if (listenedSeconds < 3600) {
    const minutes = Math.max(1, Math.round(listenedSeconds / 60))
    return t('albums.detail.listenSummary.minutes', { count: totalPlays, minutes })
  }

  const hoursTenths = Math.round((listenedSeconds / 3600) * 10) / 10
  const hoursLabel =
    Number.isInteger(hoursTenths) || hoursTenths >= 10
      ? String(Math.round(hoursTenths))
      : hoursTenths.toFixed(1)
  return t('albums.detail.listenSummary.hours', { count: totalPlays, hours: hoursLabel })
}

/**
 * 静态极光：离屏 16×16 采样 + 四角径向渐变，单帧绘制，无 rAF 循环。
 * 见 docs/topics/albums/techdoc-album-detail-hero-billboard-redesign.md §3.1
 */
function updateHeroStaticFluid(url: string | null, canvas: HTMLCanvasElement): void {
  if (isPageUnmounted || !isModernAlbumDetail.value) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const parentWidth = canvas.parentElement?.clientWidth || 800
  const width = Math.max(1, Math.floor(parentWidth))
  const height = HERO_CANVAS_HEIGHT
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

function formatTrackCount(count: number): string {
  return t(count === 1 ? 'albums.detail.trackCount.one' : 'albums.detail.trackCount.other', {
    count,
  })
}

function formatAlbumDuration(seconds: number): string {
  if (seconds <= 0) return t('albums.detail.duration.zero')

  if (seconds < 3600) {
    return t('albums.detail.duration.minutes', {
      minutes: String(Math.floor(seconds / 60)).padStart(2, '0'),
      seconds: String(Math.floor(seconds % 60)).padStart(2, '0'),
    })
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  const normalizedHours = hours + Math.floor(minutes / 60)
  const normalizedMinutes = minutes % 60

  const hh = String(normalizedHours).padStart(2, '0')

  const mm = String(normalizedMinutes).padStart(2, '0')
  return t('albums.detail.duration.hours', { hours: hh, minutes: mm })
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
        <span class="i-lucide-arrow-left h-4 w-4" />
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
              <div v-else class="flex h-full w-full items-center justify-center" aria-hidden="true">
                <span class="i-lucide-disc-3 h-16 w-16 text-[var(--auralis-text-disabled)]"></span>
              </div>
            </div>
          </div>

          <div class="album-hero-content-stage">
            <h1 class="album-hero-title select-text">{{ displayAlbumTitle }}</h1>
            <p v-if="heroEyebrow" class="album-hero-eyebrow select-text">{{ heroEyebrow }}</p>
            <p class="album-hero-sub select-text">
              <span v-for="(item, index) in heroSubItems" :key="index">
                <span v-if="index > 0" class="album-hero-sub-dot">·</span>
                <span>{{ item }}</span>
              </span>
            </p>
            <p v-if="albumListenSummary" class="album-hero-listen select-text">
              {{ albumListenSummary.label }}
            </p>
            <div class="album-hero-actions">
              <button class="album-hero-play-btn" type="button" @click="playAlbum">
                <span class="i-lucide-play h-5 w-5 fill-current"></span>
                <span>{{ t('albums.detail.play') }}</span>
              </button>
              <button class="album-hero-shuffle-btn" type="button" @click="playAlbumShuffle">
                <span class="i-lucide-shuffle h-4 w-4"></span>
                <span>{{ t('albums.detail.shuffle') }}</span>
              </button>
            </div>
            <!-- 法律附录：操作流下方 muted 一行；无数据不渲染 -->
            <p v-if="heroLegalLine" class="album-hero-legal select-text" :title="heroLegalLine">
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
  padding: 24px 32px calc(var(--auralis-playbar-safe-area) + 40px);
}

.album-detail-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--auralis-text-muted);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  background: var(--auralis-btn-back-bg);
  border: 1px solid var(--auralis-btn-back-border);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.25s ease;
  margin-bottom: 12px;
}

.album-detail-back:hover {
  color: var(--auralis-text);
  background: var(--auralis-btn-back-hover);
  border-color: var(--auralis-btn-back-border);
  transform: translateY(-1px);
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
  position: relative;
  display: flex;
  width: 100%;
  min-height: 256px;
  align-items: center;
  gap: 28px;
  padding: 28px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 88%, #000);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 12%, transparent);
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
}

.album-hero-static-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.9;
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
  flex: 0 0 200px;
  width: 200px;
  height: 200px;
  perspective: 900px;
}

.album-hero-cover-container::before {
  position: absolute;
  inset: 6%;
  border-radius: 14px;
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
  border-radius: 14px;
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
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  color: #f4f1ea;
}

.album-hero-title {
  margin: 0;
  max-width: 100%;
  color: #faf7f0;
  font-family: 'Auralis Desktop Lyrics SC', 'Times New Roman', serif;
  font-size: 38px;
  font-weight: 750;
  line-height: 1.12;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.album-hero-eyebrow {
  margin: 6px 0 0;
  font-family: 'Auralis Desktop Lyrics SC', 'Times New Roman', serif;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244, 241, 234, 0.68);
}

.album-hero-sub {
  margin: 8px 0 0;
  color: rgba(244, 241, 234, 0.78);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
}

.album-hero-sub-dot {
  margin: 0 0.45em;
  opacity: 0.55;
}

.album-hero-listen {
  margin: 8px 0 0;
  color: rgba(196, 165, 116, 0.9);
  font-size: 12px;
  letter-spacing: 0.02em;
}

/* 法律附录：按钮下 muted 一行，不抢 CTA */
.album-hero-legal {
  margin: 14px 0 0;
  max-width: min(100%, 42rem);
  padding-right: 8px;
  color: rgba(244, 241, 234, 0.42);
  font-size: 11px;
  line-height: 1.45;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-hero-actions {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.album-hero-play-btn {
  display: inline-flex;
  width: fit-content;
  min-width: 128px;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    var(--auralis-active-album-accent, #4f46e5) 0%,
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 80%, #000) 100%
  );
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  box-shadow: 0 6px 20px
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 45%, transparent);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  position: relative;
}

.album-hero-play-btn:hover {
  transform: translateY(-2px) scale(1.03);
  filter: brightness(1.06);
  box-shadow: 0 10px 28px
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 52%, transparent);
}

.album-hero-play-btn:active {
  transform: translateY(1px) scale(0.98);
}

.album-hero-shuffle-btn {
  display: inline-flex;
  width: fit-content;
  min-width: 112px;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(244, 241, 234, 0.88);
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.25s ease;
}

.album-hero-shuffle-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
  color: #faf7f0;
  transform: translateY(-1px);
}

.album-hero-shuffle-btn:active {
  transform: translateY(0);
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
    flex-direction: column;
    align-items: flex-start;
    min-height: 0;
    padding: 20px;
    gap: 20px;
  }

  .album-hero-cover-container {
    flex-basis: 168px;
    width: 168px;
    height: 168px;
  }

  .album-hero-title {
    font-size: 26px;
  }

  .album-body-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .album-hero-content-stage {
    padding-right: 0;
    padding-bottom: 40px;
  }

  .album-hero-legal {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
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
  .album-detail-back:hover {
    transform: none;
  }
}
</style>
