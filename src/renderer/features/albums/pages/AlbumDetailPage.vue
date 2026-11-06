<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'

import { writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import AlbumDetailTrackList from '../components/AlbumDetailTrackList.vue'
import AlbumMoreGallery from '../components/AlbumMoreGallery.vue'
import { useAlbumDetailPresentation } from '../composables/useAlbumDetailPresentation'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { useAlbumDetailTracks } from '../composables/useAlbumDetailTracks'
import { useAlbumDetailPlayback } from '../composables/useAlbumDetailPlayback'
import { createAlbumArtworkTransition } from '@renderer/shared/animation/motion'
import { useAlbumDetailArtworkPublisher } from '../albumDetailArtwork'
import AlbumColorPreference from '../components/AlbumColorPreference.vue'
import FrostedSurface from '@renderer/shared/components/FrostedSurface.vue'

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
const coverImageRef = ref<HTMLImageElement | null>(null)
const coverImageReady = ref(false)
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
  ensurePlaybackCatalog,
  playbackCatalogRevision,
  dispose: disposeAlbumTracks,
} = useAlbumDetailTracks({ albumArtist, albumTitle, library: auralis.library })
const {
  playAlbum,
  playTrack,
  playAlbumShuffle,
  cancel: cancelPendingPlayback,
} = useAlbumDetailPlayback({
  albumArtist,
  albumTitle,
  tracks,
  albumTracks,
  ensurePlaybackCatalog,
  playbackCatalogRevision,
  playback,
})
onBeforeRouteLeave(cancelPendingPlayback)

/**
 * 完整详情由快照/查询是否就绪决定；入场动画只关闭高开销效果，不拆两套 DOM。
 */
const hasRenderableData = computed(() => loadState.value === 'ready')
const isEffectsActive = computed(() => hasRenderableData.value && !props.isEntering)
const {
  albumGenrePills,
  albumHeroGenreLabel,
  heroLegalLine,
  albumReleaseDate,
  albumDuration,
  albumDiscGroups,
} = useAlbumDetailPresentation(albumTracks, previewReleaseDate)
const displayAlbumArtist = computed(() =>
  albumArtist.value === 'Unknown Artist'
    ? t('library.missing.artist')
    : songValues(albumArtist.value),
)
const displayAlbumTitle = computed(() =>
  albumTitle.value === 'Unknown Album' ? t('library.missing.album') : songText(albumTitle.value),
)

const artworkCacheKey = computed(
  () =>
    albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ??
    previewArtworkCacheKey.value,
)
const artworkUrl = computed(() => getArtworkUrl(artworkCacheKey.value))
watch(artworkUrl, () => {
  coverImageReady.value = false
})
const publishArtwork = useAlbumDetailArtworkPublisher()
const artworkOwner = Symbol('album-detail')
const colorAnchors = computed(() =>
  albumTracks.value.map(({ id, createdAt }) => ({ id, createdAt })),
)
watch(
  [artworkCacheKey, colorAnchors, albumArtist, albumTitle],
  ([key, anchors, artist, title]) =>
    publishArtwork?.set(artworkOwner, key, anchors, { artist, title }),
  { immediate: true },
)

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
  cancelPendingPlayback()
  void router.push({ name: 'albums' })
}

async function openAlbum(album: AlbumSummary, event: MouseEvent): Promise<void> {
  if (isOpeningWork.value) return
  if (album.albumArtist === albumArtist.value && album.title === albumTitle.value) return
  cancelPendingPlayback()

  const source = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
    '.album-more-gallery-cover',
  )
  const content = detailRootRef.value?.querySelector<HTMLElement>('.album-detail-wrapper')
  isOpeningWork.value = true
  if (source && content) artworkTransition = createAlbumArtworkTransition(source, content)

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
  publishArtwork?.clear(artworkOwner)
  isPageUnmounted = true
  artworkTransition?.cancel()
  artworkTransition = null
  disposeAlbumTracks()
  if (highlightTimeout) clearTimeout(highlightTimeout)
})
</script>

<template>
  <div class="album-detail-container album-detail-page h-full w-full relative bg-transparent">
    <button
      v-if="hasRenderableData || loadState === 'loading'"
      class="album-detail-back album-glass-control"
      type="button"
      :aria-label="t('albums.detail.back')"
      @click="goBack"
    >
      <FrostedSurface />
      <span class="i-lucide-arrow-left" aria-hidden="true" />
    </button>
    <section
      v-if="hasRenderableData"
      ref="detailRootRef"
      class="album-detail-scroll-wrapper h-full w-full overflow-x-hidden overflow-y-auto relative z-10"
    >
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
                  ref="coverImageRef"
                  crossorigin="anonymous"
                  :src="artworkUrl"
                  :alt="t('albums.detail.coverAlt', { title: displayAlbumTitle })"
                  class="h-full w-full object-cover"
                  decoding="async"
                  draggable="false"
                  @load="coverImageReady = true"
                  @error="coverImageReady = false"
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
                    <span class="album-hero-date-text">{{ albumReleaseDate }}</span>
                    <span v-if="albumHeroGenreLabel" class="album-hero-genre-group">
                      <span
                        v-tooltip.overflow="songParts(albumGenrePills.slice(0, 2))"
                        class="album-hero-genre-text"
                      >
                        {{ songParts(albumGenrePills.slice(0, 2)) }}
                      </span>
                    </span>
                  </div>
                  <p class="album-hero-track-summary">
                    <span>{{ t('albums.cd.trackCount', { count: albumTracks.length }) }}</span>
                    <span v-if="albumDuration">{{ albumDuration }}</span>
                  </p>
                </div>
              </div>

              <!-- 专辑播放操作 -->
              <div class="album-hero-actions">
                <button class="album-hero-play-btn" type="button" @click="playAlbum">
                  <span class="album-hero-action-icon" aria-hidden="true">
                    <span class="i-lucide-play h-4 w-4"></span>
                  </span>
                  <span class="album-hero-action-label">{{ t('albums.detail.play') }}</span>
                </button>
                <button
                  v-tooltip="t('albums.detail.shuffle')"
                  class="album-hero-shuffle-btn"
                  type="button"
                  :aria-label="t('albums.detail.shuffle')"
                  @click="playAlbumShuffle"
                >
                  <span class="album-hero-action-icon" aria-hidden="true">
                    <span class="i-lucide-shuffle h-4 w-4"></span>
                  </span>
                </button>
                <AlbumColorPreference
                  :anchors="colorAnchors"
                  :artwork-key="artworkCacheKey"
                  :cover-image="coverImageRef"
                  :cover-ready="coverImageReady"
                />
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
            :is-playing="playback.state.isPlaying"
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
          :genre-label="songParts(albumGenrePills.slice(0, 1))"
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
      <div class="album-detail-wrapper" aria-hidden="true">
        <section class="album-hero-billboard">
          <div class="album-hero-main-stage">
            <div class="album-hero-cover-container">
              <div class="album-hero-cover album-detail-skeleton-block"></div>
            </div>
            <div class="album-hero-content-stage">
              <div class="album-hero-zone-primary">
                <div class="album-hero-meta-block">
                  <div class="album-detail-skeleton-line album-detail-skeleton-line--title"></div>
                  <div class="album-detail-skeleton-line album-detail-skeleton-line--meta"></div>
                </div>
              </div>
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
  border-radius: var(--auralis-artwork-radius-hero);
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.album-hero-content-stage {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: var(--album-hero-cover-size);
  display: grid;
  /* 对称上下轨道让信息区独立居中，操作区贴齐封面底边。 */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
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
  grid-row: 2;
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
  width: 100%;
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
  letter-spacing: var(--auralis-type-hero-title-letter-spacing);
  overflow: hidden;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  user-select: none;
}

.album-hero-artist-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
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
  grid-row: 3;
  align-self: end;
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
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  user-select: none;
}

/* 扁平操作：强调色主按钮与中性随机按钮。 */
.album-hero-play-btn {
  background: var(--album-detail-accent, var(--auralis-theme-accent));
  border: 1px solid var(--album-detail-accent-border, var(--auralis-theme-accent));
  color: var(--album-detail-accent-text, var(--auralis-control-primary-text));
}

.album-hero-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.album-hero-shuffle-btn {
  width: 40px;
  min-width: 40px;
  padding: 0;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--auralis-text) 10%, transparent);
  border: 1px solid transparent;
  color: var(--auralis-text);
}

.album-hero-play-btn:hover,
.album-hero-shuffle-btn:hover {
  filter: brightness(1.12);
}

.album-hero-play-btn:active,
.album-hero-shuffle-btn:active {
  opacity: 0.72;
}

.album-hero-play-btn:focus-visible,
.album-hero-shuffle-btn:focus-visible {
  outline: 2px solid var(--auralis-text);
  outline-offset: 3px;
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

  /* 200px 封面下，元数据保持单行，给两行标题与底部按钮留出间隔。 */
  .album-hero-artist-row {
    flex-wrap: nowrap;
  }

  .album-hero-date-text {
    flex-shrink: 0;
    white-space: nowrap;
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

  /* 单列布局中，信息与操作恢复正常文档流。 */
  .album-hero-content-stage {
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .album-hero-artist-row {
    flex-wrap: wrap;
  }

  .album-hero-actions {
    align-self: auto;
    margin-top: 8px;
  }
}

:where([data-reduced-motion='true']) .album-hero-play-btn:hover,
:where([data-reduced-motion='true']) .album-hero-shuffle-btn:hover,
:where([data-reduced-motion='true']) .album-detail-back:hover {
  transform: none;
}

/* The layout responds to the available detail pane, including sidebar and lyrics widths. */
.album-detail-scroll-wrapper {
  container-type: inline-size;
  padding-top: 0;
}

.album-detail-back {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 36px;
  height: 36px;
  justify-content: center;
  margin: 0;
}

.album-detail-back .i-lucide-arrow-left {
  width: 18px;
  height: 18px;
}

.album-detail-wrapper {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.album-hero-billboard,
.album-body-grid {
  margin: 0;
}

.album-hero-billboard {
  padding: 0 0 28px;
  gap: 0;
}

.album-hero-main-stage {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  min-height: max(480px, 100cqi);
  padding: 0;
}

.album-hero-cover-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  pointer-events: none;
}

.album-hero-cover {
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.album-hero-cover img {
  mask-image:
    linear-gradient(to right, #000 75%, transparent),
    linear-gradient(to bottom, #000 70%, transparent);
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(to right, #000 75%, transparent),
    linear-gradient(to bottom, #000 70%, transparent);
  -webkit-mask-composite: source-in;
}

.album-hero-content-stage {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: auto;
  gap: 18px;
  box-sizing: border-box;
  padding: 24px 24px 0;
  text-align: center;
  isolation: isolate;
}

.album-hero-content-stage::before {
  --album-surface-color: var(--album-detail-main, var(--auralis-main-bg));
  content: '';
  position: absolute;
  z-index: -1;
  inset: -96px 0 0;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--album-surface-color) 45%);
  transition: --album-surface-color 650ms ease;
}

:where([data-reduced-motion='true']) .album-hero-content-stage::before {
  transition: none;
}

.album-hero-zone-primary,
.album-hero-meta-block {
  align-items: center;
  text-align: center;
}

.album-hero-artist-row {
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}

.album-hero-artist-text {
  display: block;
  flex: 0 1 100%;
  width: 100%;
  max-width: 100%;
}

.album-hero-genre-group {
  flex: 0 1 auto;
}

.album-hero-track-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 12px;
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
  font-size: var(--album-detail-type-summary-size);
  line-height: var(--album-detail-type-summary-line-height);
  font-weight: 400;
}

.album-hero-actions {
  align-self: center;
  justify-content: center;
  margin: 0;
}

.album-hero-shuffle-btn {
  order: -1;
}

.album-hero-footer-stage {
  padding: 16px 28px 0;
  text-align: center;
}

.album-body-grid {
  padding: 16px var(--album-detail-inline-padding) 0;
}

@container (width < 840px) {
  .album-hero-cover img {
    mask-image:
      linear-gradient(to right, #000 75%, transparent),
      linear-gradient(to bottom, #000 45%, transparent 82%);
    -webkit-mask-image:
      linear-gradient(to right, #000 75%, transparent),
      linear-gradient(to bottom, #000 45%, transparent 82%);
  }
}

@container (min-width: 840px) {
  .album-detail-wrapper {
    grid-template-columns: minmax(0, 58fr) minmax(0, 42fr);
    align-items: start;
  }

  .album-hero-main-stage {
    /* The cover spans 58% of the pane and must fit even on very wide screens. */
    min-height: max(clamp(520px, 72cqi, 700px), 58cqi);
  }

  .album-body-grid {
    padding: 28px var(--album-detail-inline-padding) 28px 16px;
  }

  .album-detail-wrapper > :deep(.album-more-gallery) {
    grid-column: 1 / -1;
  }
}
</style>

<style scoped src="../styles/albumGlassControl.css"></style>
