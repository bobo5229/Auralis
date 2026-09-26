<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import {
  prefetchArtworkPalette,
  useArtworkPalette,
} from '@renderer/features/playback/composables/useArtworkPalette'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { formatDelimitedParts } from '@shared/utils/delimitedValues'

import { writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import AlbumDetailTrackList from '../components/AlbumDetailTrackList.vue'
import AlbumMoreGallery from '../components/AlbumMoreGallery.vue'
import { useAlbumCoverTracking } from '../composables/useAlbumCoverTracking'
import { useAlbumDetailPresentation } from '../composables/useAlbumDetailPresentation'
import type { AlbumSummary } from '../types'
import { useAlbumDetailTracks } from '../composables/useAlbumDetailTracks'
import { albumHeroTintStyle, resolveAlbumHeroTint } from '../utils/albumHeroTint'
import { createAlbumArtworkTransition } from '@renderer/shared/animation/motion'

const props = withDefaults(
  defineProps<{
    isEntering?: boolean
  }>(),
  {
    isEntering: false,
  },
)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const playback = usePlayback()
const detailRootRef = ref<HTMLElement | null>(null)
const coverStageRef = ref<HTMLElement | null>(null)
const highlightedTrackId = ref<number | null>(null)
let highlightTimeout: ReturnType<typeof setTimeout> | null = null
let isPageUnmounted = false
let artworkTransition: ReturnType<typeof createAlbumArtworkTransition> | null = null
const isOpeningWork = ref(false)

const albumArtist = computed(() => String(route.query.artist ?? ''))
const albumTitle = computed(() => String(route.query.title ?? ''))
const {
  tracks,
  albumTracks,
  moreAlbums: moreAlbumsByArtist,
  genreAlbums,
  previewArtworkCacheKey,
  previewReleaseDate,
  loadState,
  initialize: initializeAlbumTracks,
  reloadTracks,
  ensureCurrentAlbum,
  dispose: disposeAlbumTracks,
} = useAlbumDetailTracks({ albumArtist, albumTitle, library: auralis.library })

/**
 * 完整详情由快照/查询是否就绪决定；入场动画只关闭高开销效果，不拆两套 DOM。
 */
const hasRenderableData = computed(() => loadState.value === 'ready')
const isEffectsActive = computed(() => hasRenderableData.value && !props.isEntering)
useAlbumCoverTracking(detailRootRef, coverStageRef, isEffectsActive)
const {
  albumGenrePills,
  metricsTrackCount,
  metricsTotalDuration,
  metricsPlaysLabel,
  metricsTotalTime,
  heroLegalLine,
  albumReleaseYear,
  albumDiscGroups,
} = useAlbumDetailPresentation(albumTracks, previewReleaseDate)
const displayAlbumArtist = computed(() =>
  albumArtist.value === 'Unknown Artist'
    ? t('library.unknownArtist')
    : formatArtist(albumArtist.value),
)
const displayAlbumTitle = computed(() =>
  albumTitle.value === 'Unknown Album' ? t('library.unknownAlbum') : albumTitle.value,
)

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

const artworkCacheKey = computed(
  () =>
    albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ??
    previewArtworkCacheKey.value,
)
const artworkUrl = computed(() => getArtworkUrl(artworkCacheKey.value))
const { palette: albumPalette } = useArtworkPalette(artworkCacheKey, {
  enabled: hasRenderableData,
})
const heroTint = computed(() =>
  resolveAlbumHeroTint(albumPalette.value, artworkCacheKey.value, artworkUrl.value),
)
const albumDetailStyle = computed<CSSProperties>(() => {
  const accent = albumPalette.value.accents[0]?.rgb
  const resolvedAccent =
    albumPalette.value.quality === 'fallback' || !accent
      ? 'var(--auralis-artwork-accent-fallback)'
      : `rgb(${accent.r} ${accent.g} ${accent.b})`

  return albumHeroTintStyle(
    albumPalette.value,
    artworkCacheKey.value,
    artworkUrl.value,
    resolvedAccent,
  )
})
const artworkGlowBackground = computed(() =>
  artworkUrl.value ? `url("${artworkUrl.value}")` : 'none',
)

function onArtistClick(): void {
  if (!albumArtist.value || albumArtist.value === 'Unknown Artist') return
  void router.push({ name: 'library', query: { q: albumArtist.value } })
}

const isGenreGallery = computed(() => moreAlbumsByArtist.value.length === 0)
const galleryAlbums = computed(() =>
  isGenreGallery.value ? genreAlbums.value : moreAlbumsByArtist.value,
)
const showMoreAlbumsSection = computed(
  () => albumTracks.value.length > 0 && galleryAlbums.value.length > 0,
)

function retryLoad(): void {
  void reloadTracks()
}

function goBack(): void {
  void router.push({ name: 'albums' })
}

async function openAlbum(album: AlbumSummary, event: MouseEvent): Promise<void> {
  if (isOpeningWork.value) return
  if (album.albumArtist === albumArtist.value && album.title === albumTitle.value) return

  const source = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
    '.album-more-gallery-cover',
  )
  const content = detailRootRef.value?.querySelector<HTMLElement>('.album-detail-wrapper')
  isOpeningWork.value = true
  if (source && content) artworkTransition = createAlbumArtworkTransition(source, content)

  prefetchArtworkPalette(album.artworkCacheKey)
  writeAlbumDetailSnapshot({
    albumArtist: album.albumArtist,
    albumTitle: album.title,
    artworkCacheKey: album.artworkCacheKey,
    releaseDate: album.releaseDate,
    tracks: album.tracks,
    moreAlbums: moreAlbumsByArtist.value.filter((candidate) => candidate.key !== album.key),
    catalogTracks: tracks.value.length > albumTracks.value.length ? tracks.value : null,
  })

  try {
    await artworkTransition?.ready
    if (isPageUnmounted) return
    const failure = await router.push({
      name: 'album-detail',
      query: {
        artist: album.albumArtist,
        title: album.title,
      },
    })
    if (failure) {
      artworkTransition?.cancel()
      artworkTransition = null
      isOpeningWork.value = false
    }
  } catch (error) {
    artworkTransition?.cancel()
    artworkTransition = null
    isOpeningWork.value = false
    throw error
  }
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

function selectTrack(trackId: number): void {
  playback.selectTrack(trackId)
}

/**
 * 入场动画结束且详情就绪后，再定位搜索命中的曲目。
 */
watch(
  isEffectsActive,
  async (active) => {
    if (!active) return

    await nextTick()
    if (isPageUnmounted || !isEffectsActive.value) return

    showSearchResultHighlight()
  },
  { immediate: true },
)

watch(
  () => [albumArtist.value, albumTitle.value] as const,
  async () => {
    const wasEffectsActive = isEffectsActive.value
    await ensureCurrentAlbum()
    await nextTick()
    if (isPageUnmounted) return
    detailRootRef.value?.scrollTo({ top: 0 })
    if (wasEffectsActive && isEffectsActive.value) showSearchResultHighlight()
    const transition = artworkTransition
    if (transition) {
      const cover = coverStageRef.value?.querySelector<HTMLElement>('.album-hero-cover')
      const content = detailRootRef.value?.querySelector<HTMLElement>('.album-detail-wrapper')
      try {
        if (cover && content && hasRenderableData.value) await transition.finish(cover, content)
        else transition.cancel()
      } finally {
        if (artworkTransition === transition) artworkTransition = null
        isOpeningWork.value = false
      }
    } else isOpeningWork.value = false
  },
)

onMounted(async () => {
  await initializeAlbumTracks()
})

onBeforeUnmount(() => {
  isPageUnmounted = true
  artworkTransition?.cancel()
  artworkTransition = null
  disposeAlbumTracks()
  if (highlightTimeout) clearTimeout(highlightTimeout)
})
</script>

<template>
  <div
    class="album-detail-container album-detail-page h-full w-full relative bg-transparent"
    :style="hasRenderableData ? albumDetailStyle : undefined"
  >
    <section
      v-if="hasRenderableData"
      ref="detailRootRef"
      class="album-detail-scroll-wrapper h-full w-full overflow-x-hidden overflow-y-auto relative z-10"
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
          class="album-hero-billboard"
          :aria-label="t('albums.detail.heroAria', { title: displayAlbumTitle })"
        >
          <div class="album-hero-tint" aria-hidden="true">
            <div
              class="album-hero-tint-wash"
              :class="{ 'album-hero-tint-wash--ready': Boolean(artworkUrl) }"
            />
            <div
              class="album-hero-tint-gradient"
              :class="{ 'album-hero-tint-gradient--ready': heroTint.hasPaletteTint }"
            />
          </div>

          <!-- 主内容层：封面与专辑信息、播放操作 -->
          <div class="album-hero-main-stage">
            <!-- 左侧：封面舞台 -->
            <div
              ref="coverStageRef"
              class="album-hero-cover-container"
              :class="{ 'album-hero-cover-container--effects-active': isEffectsActive }"
            >
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

            <!-- 专辑信息与操作 -->
            <div class="album-hero-content-stage">
              <!-- 核心文本与专辑元数据 -->
              <div class="album-hero-zone-primary">
                <div class="album-hero-meta-block">
                  <h1 v-tooltip.overflow="displayAlbumTitle" class="album-hero-title select-none">
                    {{ displayAlbumTitle }}
                  </h1>
                  <div class="album-hero-artist-row select-text">
                    <button
                      v-if="albumArtist && albumArtist !== 'Unknown Artist'"
                      v-tooltip.overflow="displayAlbumArtist"
                      type="button"
                      class="album-hero-artist-btn"
                      @click="onArtistClick"
                    >
                      {{ displayAlbumArtist }}
                    </button>
                    <span v-else class="album-hero-artist-text">{{ displayAlbumArtist }}</span>
                    <span class="album-hero-artist-dot" aria-hidden="true">·</span>
                    <span class="album-hero-year-text">{{ albumReleaseYear }}</span>
                    <span v-if="albumGenrePills.length > 0" class="album-hero-genre-group">
                      <span class="album-hero-artist-dot" aria-hidden="true">·</span>
                      <span class="album-hero-genre-text">{{ albumGenrePills.join(' / ') }}</span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- 专辑信息与收听统计 -->
              <div class="album-hero-zone-metrics select-none">
                <div class="album-hero-metric-row">
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
                </div>
                <div class="album-hero-metric-row">
                  <div class="album-hero-metric-item">
                    <span class="album-hero-metric-label">{{
                      t('albums.detail.metrics.plays')
                    }}</span>
                    <span class="album-hero-metric-value">{{ metricsPlaysLabel }}</span>
                  </div>
                  <div class="album-hero-metric-item">
                    <span class="album-hero-metric-label">{{
                      t('albums.detail.metrics.listened')
                    }}</span>
                    <span class="album-hero-metric-value">{{ metricsTotalTime }}</span>
                  </div>
                </div>
              </div>
              <!-- 专辑播放操作 -->
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
          </div>

          <!-- 下半部分：底部脚注层（横跨全宽，完整横向展开，低于按钮与封面底边） -->
          <div v-if="heroLegalLine" class="album-hero-footer-stage select-none">
            <p class="album-hero-legal-text">
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
        <AlbumMoreGallery
          v-if="showMoreAlbumsSection"
          :key="`${albumArtist}\u0000${albumTitle}`"
          :albums="galleryAlbums"
          :single-row="isGenreGallery"
          :artist-label="displayAlbumArtist"
          :genre-label="formatDelimitedParts(albumGenrePills)"
          :effects-active="isEffectsActive"
          :opening="isOpeningWork"
          @open="openAlbum"
        />
      </div>
    </section>

    <section
      v-else-if="loadState === 'loading'"
      class="album-detail-scroll-wrapper album-detail-skeleton h-full w-full overflow-hidden relative z-10"
      aria-busy="true"
      :aria-label="t('albums.detail.loading')"
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

      <div class="album-detail-wrapper" aria-hidden="true">
        <section class="album-hero-billboard">
          <div class="album-hero-main-stage">
            <div class="album-hero-cover-container">
              <div class="album-hero-cover album-detail-skeleton-block"></div>
            </div>
            <div class="album-hero-content-stage">
              <div class="album-detail-skeleton-line album-detail-skeleton-line--title"></div>
              <div class="album-detail-skeleton-line album-detail-skeleton-line--meta"></div>
              <div class="album-detail-skeleton-line album-detail-skeleton-line--metrics"></div>
            </div>
          </div>
        </section>
        <div class="album-body-grid">
          <div v-for="index in 8" :key="index" class="album-detail-skeleton-track"></div>
        </div>
      </div>
    </section>

    <div
      v-else
      class="album-detail-state flex min-h-[60vh] items-center justify-center relative z-10"
      :class="`album-detail-state--${loadState}`"
      aria-live="assertive"
    >
      <div class="album-detail-state-content text-center">
        <p class="album-detail-state-message text-base font-semibold text-[var(--auralis-text)]">
          {{ loadState === 'error' ? t('albums.detail.loadError') : t('albums.detail.notFound') }}
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
  min-height: 0;
  position: relative;
}

.album-detail-scroll-wrapper {
  min-height: 0;
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
.album-detail-wrapper {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-width: 0;
}
.album-hero-billboard {
  --album-hero-cover-size: 176px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 24px 0 12px;
  isolation: isolate;
}

.album-hero-tint {
  position: absolute;
  top: -48px;
  left: -64px;
  width: calc(var(--album-hero-cover-size) + 280px);
  height: calc(var(--album-hero-cover-size) + 200px);
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  /* Fade before the scroller clips this layer 32px from its left edge. */
  -webkit-mask-image:
    linear-gradient(to right, transparent 48px, #000 128px),
    radial-gradient(ellipse at 40% 45%, #000 0%, transparent 70%);
  mask-image:
    linear-gradient(to right, transparent 48px, #000 128px),
    radial-gradient(ellipse at 40% 45%, #000 0%, transparent 70%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

.album-hero-tint-wash,
.album-hero-tint-gradient {
  position: absolute;
  inset: 0;
}

.album-hero-tint-wash {
  background-image: var(--album-hero-wash-image);
  background-position: center;
  background-size: cover;
  opacity: 0;
}

.album-hero-tint-wash--ready {
  opacity: 0.18;
}

.album-hero-tint-gradient {
  opacity: 0;
  background:
    radial-gradient(
      ellipse at 18% 28%,
      color-mix(in srgb, var(--album-hero-tint-a) 72%, transparent) 0%,
      transparent 58%
    ),
    radial-gradient(
      ellipse at 86% 18%,
      color-mix(in srgb, var(--album-hero-tint-b) 58%, transparent) 0%,
      transparent 52%
    ),
    radial-gradient(
      ellipse at 72% 88%,
      color-mix(in srgb, var(--album-hero-tint-c) 48%, transparent) 0%,
      transparent 55%
    ),
    linear-gradient(
      165deg,
      color-mix(in srgb, var(--album-hero-tint-bg) 88%, #000) 0%,
      color-mix(in srgb, var(--album-hero-tint-a) 28%, #0c0d10) 100%
    );
}

.album-hero-tint-gradient--ready {
  opacity: 0.32;
}
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
  background: none;
  background-size: cover;
  background-position: center;
  content: '';
  filter: none;
  opacity: 0;
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

.album-hero-cover-container--effects-active::after {
  background: v-bind(artworkGlowBackground);
  filter: blur(28px) saturate(1.8);
  opacity: 0.55;
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
  color: var(--auralis-text);
}

.album-detail-skeleton-block,
.album-detail-skeleton-line,
.album-detail-skeleton-track {
  background: color-mix(in srgb, var(--auralis-text) 6%, transparent);
}

.album-detail-skeleton-line {
  border-radius: 8px;
}

.album-detail-skeleton-line--title {
  width: min(420px, 72%);
  height: 28px;
}

.album-detail-skeleton-line--meta {
  width: min(240px, 48%);
  height: 16px;
  margin-top: 10px;
}

.album-detail-skeleton-line--metrics {
  width: min(180px, 36%);
  height: 14px;
  margin-top: 18px;
}

.album-detail-skeleton-track {
  height: 50px;
  border-radius: 12px;
}
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
  color: var(--auralis-text);
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
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.4;
  color: var(--auralis-text);
}

.album-hero-artist-btn {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--auralis-text);
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
  color: var(--auralis-sidebar-active-indicator, var(--auralis-text));
  text-decoration: underline;
}

.album-hero-artist-text {
  color: var(--auralis-text);
  font-size: 17px;
  font-weight: 650;
}

.album-hero-artist-dot {
  color: var(--auralis-text-muted);
  user-select: none;
}

.album-hero-year-text,
.album-hero-genre-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--auralis-text-muted);
}

.album-hero-genre-group {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.album-hero-genre-text {
  overflow-wrap: anywhere;
  min-width: 0;
}

.album-hero-actions {
  margin-top: 8px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
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
    var(--auralis-album-detail-accent) 0%,
    color-mix(in srgb, var(--auralis-album-detail-accent) 75%, #000) 100%
  );
  color: #ffffff;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0.02em;
  box-shadow:
    0 8px 24px color-mix(in srgb, var(--auralis-album-detail-accent) 50%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: all 0.22s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}

.album-hero-play-btn:hover {
  transform: translateY(-2px) scale(1.02);
  filter: brightness(1.1);
  box-shadow:
    0 12px 28px color-mix(in srgb, var(--auralis-album-detail-accent) 60%, transparent),
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
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 18%, transparent);
  color: var(--auralis-text);
  font-size: 15px;
  font-weight: 650;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}

.album-hero-shuffle-btn:hover {
  background: color-mix(in srgb, var(--auralis-text) 15%, transparent);
  border-color: color-mix(in srgb, var(--auralis-text) 32%, transparent);
  color: var(--auralis-text);
  transform: translateY(-1px);
}

.album-hero-shuffle-btn:active {
  transform: translateY(0);
}
.album-hero-zone-metrics {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(4, max-content);
  gap: 12px;
  max-width: 100%;
}

.album-hero-metric-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
}

.album-hero-metric-item {
  display: grid;
  grid-column: span 2;
  grid-template-columns: subgrid;
  align-items: center;
  line-height: 1;
}

.album-hero-metric-label {
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.2px;
}

.album-hero-metric-value {
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.album-hero-footer-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  padding-top: 2px;
}

.album-hero-legal-text {
  margin: 0;
  width: 100%;
  color: var(--auralis-text-subtle);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0.01em;
  white-space: normal;
  word-break: break-word;
  user-select: none;
}
.album-body-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  align-items: start;
  min-width: 0;
  position: relative;
}

@media (max-width: 959px) {
  .album-hero-billboard {
    --album-hero-cover-size: 160px;
    padding: 20px 0 12px;
    gap: 14px;
  }

  .album-hero-main-stage {
    column-gap: 20px;
  }

  .album-body-grid {
    grid-template-columns: minmax(0, 1fr);
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
  .album-hero-cover,
  .album-hero-cover-container::before,
  .album-hero-cover-container::after {
    transform: none !important;
    transition: none !important;
  }

  .album-hero-play-btn:hover,
  .album-hero-shuffle-btn:hover,
  .album-detail-back:hover {
    transform: none;
  }
}
</style>
