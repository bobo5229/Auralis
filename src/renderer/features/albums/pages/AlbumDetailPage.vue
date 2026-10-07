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
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

import { writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import AlbumDetailTrackList from '../components/AlbumDetailTrackList.vue'
import AlbumMoreGallery from '../components/AlbumMoreGallery.vue'
import { useAlbumDetailPresentation } from '../composables/useAlbumDetailPresentation'
import type { AlbumSummary } from '../types'
import { useAlbumDetailTracks } from '../composables/useAlbumDetailTracks'
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
const { songText, songValues, songParts } = useChineseTextDisplay()
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
const { albumGenrePills, albumHeroGenreLabel, heroLegalLine, albumReleaseDate, albumDiscGroups } =
  useAlbumDetailPresentation(albumTracks, previewReleaseDate)
const displayAlbumArtist = computed(() =>
  albumArtist.value === 'Unknown Artist'
    ? t('library.unknownArtist')
    : songValues(albumArtist.value),
)
const displayAlbumTitle = computed(() =>
  albumTitle.value === 'Unknown Album' ? t('library.unknownAlbum') : songText(albumTitle.value),
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
const albumDetailStyle = computed<CSSProperties>(() => {
  const accent = albumPalette.value.accents[0]?.rgb
  const resolvedAccent =
    albumPalette.value.quality === 'fallback' || !accent
      ? 'var(--auralis-artwork-accent-fallback)'
      : `rgb(${accent.r} ${accent.g} ${accent.b})`

  return { '--auralis-album-detail-accent': resolvedAccent }
})

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
          <!-- 主内容层：封面与专辑信息、播放操作 -->
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

            <!-- 专辑信息与操作 -->
            <div class="album-hero-content-stage">
              <!-- 核心文本与专辑元数据 -->
              <div class="album-hero-zone-primary">
                <div class="album-hero-meta-block">
                  <h1 v-tooltip.overflow="displayAlbumTitle" class="album-hero-title select-none">
                    {{ displayAlbumTitle }}
                  </h1>
                  <div class="album-hero-artist-row select-text">
                    <span v-tooltip.overflow="displayAlbumArtist" class="album-hero-artist-text">
                      {{ displayAlbumArtist }}
                    </span>
                    <span class="album-hero-artist-dot" aria-hidden="true">·</span>
                    <span class="album-hero-date-text">{{ albumReleaseDate }}</span>
                    <span v-if="albumHeroGenreLabel" class="album-hero-genre-group">
                      <span class="album-hero-artist-dot" aria-hidden="true">·</span>
                      <span
                        v-tooltip.overflow="songParts(albumGenrePills.slice(0, 2))"
                        class="album-hero-genre-text"
                      >
                        {{ songParts(albumGenrePills.slice(0, 2)) }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- 专辑播放操作 -->
              <div class="album-hero-actions">
                <button class="album-hero-play-btn" type="button" @click="playAlbum">
                  <span class="album-hero-engraved-icon" aria-hidden="true">
                    <span class="i-lucide-play h-4 w-4"></span>
                  </span>
                  <span class="album-hero-engraved-label">{{ t('albums.detail.play') }}</span>
                </button>
                <button
                  v-tooltip="t('albums.detail.shuffle')"
                  class="album-hero-shuffle-btn"
                  type="button"
                  :aria-label="t('albums.detail.shuffle')"
                  @click="playAlbumShuffle"
                >
                  <span class="album-hero-engraved-icon" aria-hidden="true">
                    <span class="i-lucide-shuffle h-4 w-4"></span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- 下半部分：底部脚注层（横跨全宽，完整横向展开，低于按钮与封面底边） -->
          <div v-if="heroLegalLine" class="album-hero-footer-stage select-none">
            <p class="album-hero-legal-text">
              {{ songValues(heroLegalLine) }}
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
          :genre-label="songParts(albumGenrePills)"
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
        <p
          class="album-detail-state-message auralis-type-body font-semibold text-[var(--auralis-text)]"
        >
          {{ loadState === 'error' ? t('albums.detail.loadError') : t('albums.detail.notFound') }}
        </p>
        <button
          v-if="loadState === 'error'"
          class="album-detail-state-action auralis-type-control mt-3 text-[var(--auralis-sidebar-active-text)]"
          type="button"
          @click="retryLoad"
        >
          {{ t('albums.detail.retry') }}
        </button>
        <button
          class="album-detail-state-action auralis-type-control mt-3 text-[var(--auralis-sidebar-active-text)]"
          type="button"
          @click="goBack"
        >
          {{ t('albums.detail.returnToAlbums') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/albumDetail.typography.css"></style>
<style scoped>
.album-detail-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
}

.album-detail-container.album-detail-exit-matrix-leave-active {
  position: absolute;
}

.album-detail-scroll-wrapper {
  --album-detail-inline-padding: 32px;
  min-height: 0;
  padding: var(--auralis-shell-edge-gap) 0 calc(var(--auralis-playbar-safe-area) + 40px);
}

.album-detail-back {
  position: relative;
  z-index: 70;
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  margin-inline-start: var(--album-detail-inline-padding);
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: var(--auralis-text-muted);
  font-size: var(--album-detail-type-back-size);
  font-weight: 500;
  line-height: var(--album-detail-type-back-line-height);
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

.album-hero-billboard,
.album-body-grid {
  margin-inline: var(--album-detail-inline-padding);
}

.album-hero-billboard {
  --album-hero-cover-size: 240px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: auto;
  padding: 24px 0 12px;
  isolation: isolate;
}

.album-hero-main-stage {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  min-height: var(--album-hero-cover-size);
  grid-template-columns: var(--album-hero-cover-size) minmax(0, 1fr);
  column-gap: 36px;
  align-items: center;
}

.album-hero-cover-container {
  position: relative;
  z-index: 1;
  width: var(--album-hero-cover-size);
  height: var(--album-hero-cover-size);
}

.album-hero-cover {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 16px;
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.album-hero-content-stage {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  /* 两行截断的间隔放在外部，避免底部内边距露出第三行。 */
  margin: 0 0 6px;
  box-sizing: border-box;
  max-width: 100%;
  color: var(--auralis-text);
  font-family: var(--album-detail-font-title);
  font-size: var(--album-detail-type-title-size);
  font-weight: var(--album-detail-type-title-weight);
  line-height: var(--album-detail-type-title-line-height);
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
  color: var(--auralis-text);
}

.album-hero-artist-row,
.album-hero-artist-text {
  font-size: var(--album-detail-type-artist-size);
  font-weight: var(--album-detail-type-artist-weight);
  line-height: var(--album-detail-type-artist-line-height);
}

.album-hero-artist-text {
  color: var(--auralis-text);
  min-width: 0;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-hero-artist-dot {
  color: var(--auralis-text-muted);
  user-select: none;
}

.album-hero-date-text,
.album-hero-genre-text {
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 500;
  color: var(--auralis-text-muted);
}

.album-hero-genre-group {
  display: inline-flex;
  flex: 1 1 0;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.album-hero-genre-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.album-hero-actions {
  margin-top: 8px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.album-hero-play-btn,
.album-hero-shuffle-btn {
  display: inline-flex;
  width: fit-content;
  min-width: 96px;
  height: 40px;
  padding: 0 16px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 650;
  letter-spacing: 0.02em;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  user-select: none;
}

/* 播放主按钮：多重斜光拉丝电镀金属质感（以全局强调色为基底动态计算衍生，绝不硬编码） */
.album-hero-play-btn {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, #ffffff 38%, var(--auralis-theme-accent)) 0%,
    var(--auralis-theme-accent) 24%,
    color-mix(in srgb, #ffffff 42%, var(--auralis-theme-accent)) 46%,
    color-mix(in srgb, #000000 24%, var(--auralis-theme-accent)) 72%,
    var(--auralis-theme-accent) 100%
  );
  border: 1px solid color-mix(in srgb, #ffffff 45%, var(--auralis-theme-accent));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 -1px 0 rgba(0, 0, 0, 0.45),
    inset 0 0 8px rgba(0, 0, 0, 0.22),
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 2px 10px color-mix(in srgb, var(--auralis-theme-accent) 30%, transparent);
  color: var(--auralis-control-primary-text, var(--auralis-dark-on-accent, #121212));
}

.album-hero-engraved-label {
  text-shadow:
    0 -0.5px 0 rgba(0, 0, 0, 0.4),
    0 1px 0 rgba(255, 255, 255, 0.65);
}

/* 阴影放在图标外层，避免 Lucide 的 mask 裁掉刻痕边缘。 */
.album-hero-engraved-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 -0.5px 0 rgba(0, 0, 0, 0.4)) drop-shadow(0 1px 0 rgba(255, 255, 255, 0.65));
}

.album-hero-play-btn:hover {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, #ffffff 46%, var(--auralis-theme-accent)) 0%,
    color-mix(in srgb, #ffffff 6%, var(--auralis-theme-accent)) 24%,
    color-mix(in srgb, #ffffff 50%, var(--auralis-theme-accent)) 46%,
    color-mix(in srgb, #000000 16%, var(--auralis-theme-accent)) 72%,
    color-mix(in srgb, #ffffff 6%, var(--auralis-theme-accent)) 100%
  );
  border-color: color-mix(in srgb, #ffffff 60%, var(--auralis-theme-accent));
  box-shadow:
    inset 0 1px 0 #ffffff,
    inset 0 -1px 0 rgba(0, 0, 0, 0.45),
    inset 0 0 10px rgba(0, 0, 0, 0.15),
    0 6px 22px rgba(0, 0, 0, 0.45),
    0 3px 14px color-mix(in srgb, var(--auralis-theme-accent) 35%, transparent);
  color: var(--auralis-control-primary-text, var(--auralis-dark-on-accent, #121212));
  transform: none;
}

.album-hero-play-btn:active {
  transform: translateY(0.5px);
  box-shadow:
    inset 0 1.5px 3px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.4);
}

/* 抛光镀铬：窄反射带与明暗边缘，中央亮面保证凹刻图标清晰。 */
.album-hero-shuffle-btn {
  width: 40px;
  min-width: 40px;
  padding: 0;
  flex-shrink: 0;
  background: linear-gradient(
    160deg,
    #ffffff 0%,
    #c8d0d9 16%,
    #515b65 23%,
    #9aa4ad 28%,
    #f9fbfd 34%,
    #ffffff 46%,
    #dce2e8 61%,
    #a0aab4 72%,
    #49535d 79%,
    #c5cdd5 85%,
    #f8fafc 94%,
    #89939d 100%
  );
  border: 1px solid #87919b;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 0 rgba(0, 0, 0, 0.55),
    inset 1px 0 0 rgba(255, 255, 255, 0.5),
    inset -1px 0 0 rgba(0, 0, 0, 0.18),
    0 3px 8px rgba(0, 0, 0, 0.3),
    0 1px 2px rgba(0, 0, 0, 0.28);
  color: #121417;
}

.album-hero-shuffle-btn:hover {
  background: linear-gradient(
    160deg,
    #ffffff 0%,
    #d4dce4 16%,
    #64707c 23%,
    #afb9c2 28%,
    #ffffff 34%,
    #ffffff 46%,
    #e8edf2 61%,
    #b3bdc7 72%,
    #5b6773 79%,
    #d5dde5 85%,
    #ffffff 94%,
    #9aa5b0 100%
  );
  border-color: #a1adb8;
  box-shadow:
    inset 0 1px 0 #ffffff,
    inset 0 -1px 0 rgba(0, 0, 0, 0.5),
    inset 1px 0 0 rgba(255, 255, 255, 0.65),
    inset -1px 0 0 rgba(0, 0, 0, 0.15),
    0 3px 9px rgba(0, 0, 0, 0.32),
    0 1px 2px rgba(0, 0, 0, 0.28);
  color: #121417;
  transform: none;
}

.album-hero-shuffle-btn:active {
  transform: translateY(0.5px);
  box-shadow:
    inset 0 1.5px 3px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.4);
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
  font-size: var(--auralis-type-caption-size);
  font-weight: 400;
  line-height: var(--auralis-type-caption-line-height);
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
    --album-hero-cover-size: 200px;
    padding: 20px 0 12px;
    gap: 18px;
  }

  .album-hero-main-stage {
    column-gap: 24px;
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

:where([data-reduced-motion='true']) .album-hero-play-btn:hover,
:where([data-reduced-motion='true']) .album-hero-shuffle-btn:hover,
:where([data-reduced-motion='true']) .album-detail-back:hover {
  transform: none;
}
</style>
