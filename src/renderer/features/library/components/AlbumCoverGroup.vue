<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCoverArtworkCorners } from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import {
  formatAlbumCoverDiscHeading,
  getAlbumCoverTrackDiscHeadings,
} from '../utils/albumCoverDiscHeadings'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'
import VirtualAlbumTrackList from './VirtualAlbumTrackList.vue'
import {
  getAlbumCoverColumnHeight,
  LIBRARY_LAYOUT_METRICS,
  type CoverMetadataLayout,
} from '../constants/libraryLayoutMetrics'

const props = withDefaults(
  defineProps<{
    group: LibraryAlbumGroup
    nowPlayingTrackId?: number | null
    isPlaying?: boolean
    selectedTrackId?: number | null
    contextSelectedTrackId?: number | null
    artworkContextSelected?: boolean
    focusedTrackId?: number | null
    viewportHeight?: number
    scrollElement?: HTMLElement | null
    startOffset?: number
    metadataLayout?: Readonly<CoverMetadataLayout>
  }>(),
  {
    nowPlayingTrackId: null,
    isPlaying: false,
    selectedTrackId: null,
    contextSelectedTrackId: null,
    artworkContextSelected: false,
    focusedTrackId: null,
    viewportHeight: 0,
    scrollElement: null,
    startOffset: 0,
    metadataLayout: undefined,
  },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focusTrack: [trackId: number]
  openTrackContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
  openAlbumArtworkContextMenu: [
    anchorTrackId: number,
    event: MouseEvent,
    openReason?: 'pointer' | 'keyboard',
  ]
}>()

const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const { coverArtworkRounded, coverArtworkRadius } = useCoverArtworkCorners()
// 分组虚拟化仍会挂载整张专辑；大型合集额外按曲目虚拟化。
const LONG_ALBUM_TRACK_COUNT = 100
const imgError = ref(false)
const discHeadings = computed(() => getAlbumCoverTrackDiscHeadings(props.group.tracks))
// 可用高度已扣除播放栏安全区；低窗口中恢复正常滚动，确保说明可见。
const canStickAside = computed(
  () =>
    props.viewportHeight >=
    getAlbumCoverColumnHeight(Boolean(props.group.releaseDate), props.metadataLayout) +
      LIBRARY_LAYOUT_METRICS.coverStickyTopInset,
)

watch(
  () => props.group.artworkCacheKey,
  () => {
    imgError.value = false
  },
)

function onArtworkContextMenu(event: MouseEvent): void {
  const anchorTrackId = props.group.tracks[0]?.id
  if (anchorTrackId != null) {
    emit('openAlbumArtworkContextMenu', anchorTrackId, event, 'pointer')
  }
}

function onArtworkKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  if (
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'ContextMenu' ||
    (event.key === 'F10' && event.shiftKey)
  ) {
    event.preventDefault()
    event.stopPropagation()
    const firstTrackId = props.group.tracks[0]?.id
    if (!firstTrackId) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const fakeEvent = new MouseEvent('contextmenu', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    })
    emit('openAlbumArtworkContextMenu', firstTrackId, fakeEvent, 'keyboard')
  }
}
</script>

<template>
  <div class="album-cover-group relative" :data-album-key="group.key">
    <div class="album-cover-aside" :class="{ 'album-cover-aside--sticky': canStickAside }">
      <div
        class="album-cover-artwork select-none"
        :class="{ 'album-cover-artwork--context-selected': artworkContextSelected }"
        tabindex="0"
        role="button"
        aria-haspopup="menu"
        :style="{ borderRadius: coverArtworkRounded ? `${coverArtworkRadius}px` : '0px' }"
        :aria-label="
          t('library.a11y.albumArtwork', {
            album: songText(group.album) || t('library.unknownAlbum'),
          })
        "
        @contextmenu.prevent="onArtworkContextMenu"
        @keydown="onArtworkKeyDown"
      >
        <img
          v-if="getArtworkUrl(group.artworkCacheKey) && !imgError"
          :src="getArtworkUrl(group.artworkCacheKey)!"
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable="false"
          @error="imgError = true"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
        >
          <span class="i-lucide-music text-3xl text-[var(--auralis-text-disabled)]"></span>
        </div>
      </div>

      <div class="album-cover-meta min-w-0">
        <p
          v-tooltip.overflow="songText(group.album) || t('library.unknownAlbum')"
          class="album-cover-meta-title truncate"
        >
          {{ songText(group.album) || t('library.unknownAlbum') }}
        </p>
        <p
          v-tooltip.overflow="songValues(group.albumArtist)"
          class="album-cover-meta-line album-cover-meta-artist min-w-0 truncate"
        >
          {{ songValues(group.albumArtist) }}
        </p>
        <p v-if="group.releaseDate" class="album-cover-meta-line album-cover-meta-date truncate">
          {{ group.releaseDate }}
        </p>
      </div>
    </div>

    <div class="album-cover-tracks">
      <VirtualAlbumTrackList
        v-if="group.tracks.length > LONG_ALBUM_TRACK_COUNT"
        :tracks="group.tracks"
        :scroll-element="scrollElement"
        :start-offset="startOffset"
        :now-playing-track-id="nowPlayingTrackId"
        :is-playing="isPlaying"
        :selected-track-id="selectedTrackId"
        :context-selected-track-id="contextSelectedTrackId"
        :focused-track-id="focusedTrackId"
        @select="emit('select', $event)"
        @play="emit('play', $event)"
        @focus-track="emit('focusTrack', $event)"
        @open-track-context-menu="
          (trackId, event, openReason) => emit('openTrackContextMenu', trackId, event, openReason)
        "
      />
      <template v-else>
        <template v-for="(track, trackIdx) in group.tracks" :key="track.id">
          <div
            v-if="discHeadings[trackIdx] !== null"
            class="cover-disc-heading"
            :class="{ 'cover-disc-heading--first': trackIdx === 0 }"
          >
            {{ formatAlbumCoverDiscHeading(discHeadings[trackIdx]!) }}
          </div>
          <AlbumCoverTrackRow
            :track="track"
            :now-playing="nowPlayingTrackId === track.id"
            :is-playing="isPlaying"
            :selected="selectedTrackId === track.id"
            :context-selected="contextSelectedTrackId === track.id"
            :focused="focusedTrackId === track.id"
            :index="trackIdx"
            :disc-end="trackIdx === group.tracks.length - 1 || discHeadings[trackIdx + 1] != null"
            @select="emit('select', $event)"
            @play="emit('play', $event)"
            @focus="emit('focusTrack', $event)"
            @open-context-menu="
              (trackId, event, openReason) =>
                emit('openTrackContextMenu', trackId, event, openReason)
            "
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.album-cover-artwork:hover {
  cursor: default;
}

.album-cover-artwork:is(:focus-visible, .album-cover-artwork--context-selected) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}

.album-cover-meta-title {
  font-weight: var(--auralis-song-cover-album-weight, 700);
  font-size: var(--auralis-song-cover-album-size, 16px);
  line-height: var(--library-cover-meta-album-line-height, var(--library-cover-meta-line-height));
}

.album-cover-meta-artist {
  font-weight: var(--auralis-song-cover-album-artist-weight, 600);
  font-size: var(--auralis-song-cover-album-artist-size, 12px);
  line-height: var(--library-cover-meta-artist-line-height, var(--library-cover-meta-line-height));
}

.album-cover-meta-date {
  font-weight: var(--auralis-song-cover-release-date-weight, 500);
  font-size: var(--auralis-song-cover-release-date-size, 12px);
  line-height: var(--library-cover-meta-date-line-height, var(--library-cover-meta-line-height));
}

.album-cover-meta {
  display: flex;
  flex-direction: column;
  text-align: var(--library-cover-meta-align, left);
}

.album-cover-meta > p {
  margin: 0;
}

.album-cover-meta > .album-cover-meta-artist {
  margin-top: var(--library-cover-meta-album-artist-gap);
}

.album-cover-meta > .album-cover-meta-date {
  margin-top: var(--library-cover-meta-artist-date-gap);
}

:deep(.cover-disc-heading) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  font-family: var(--auralis-font-disc-heading);
  height: var(--library-cover-disc-heading-height);
  padding-block: 8px;
  padding-inline: 12px;
  border-radius: 8px;
  background: transparent;
  color: var(--auralis-text-muted);
  font-weight: var(--auralis-song-cover-disc-heading-weight, 700);
  font-size: var(--auralis-song-cover-disc-heading-size, 11px);
  line-height: 24px;
  letter-spacing: 0.06em;
}

/* 首个 Disc 标题放入组顶部留白，不占曲目列高度。 */
:deep(.cover-disc-heading--first) {
  position: absolute;
  height: 24px;
  padding-block: 0;
  top: -24px;
  left: var(--library-cover-panel-padding-inline-side);
  right: var(--library-cover-panel-padding-inline-side);
}

/* 左右列顶对齐：组高仍由虚拟列表按 max(封面, 曲目) 分配，曲目区不随组高 stretch */
.album-cover-group {
  align-items: start;
}

/* 原生吸顶保留正常占位，并由当前专辑组的内容边界限制移动范围。 */
.album-cover-aside--sticky {
  position: sticky;
  top: var(--library-cover-sticky-top-inset);
  align-self: start;
}

/* 曲目直接呈现在页面背景上；容器高度随内容收缩。
 * padding / border-width 消费 libraryLayoutMetrics 注入的 --library-*，
 * 与 getAlbumGroupEstimatedHeight 同一事实源（Phase 6 REVIEW Finding 1）。 */
.album-cover-tracks {
  position: relative;
  box-sizing: border-box;
  align-self: start;
  width: 100%;
  height: fit-content;
  min-width: 0;
  background: transparent;
  border: var(--library-cover-panel-border-width) solid transparent;
  padding: var(--library-cover-panel-padding-block-side)
    var(--library-cover-panel-padding-inline-side);
}
</style>
