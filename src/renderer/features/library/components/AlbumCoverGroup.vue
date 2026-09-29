<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCoverArtworkCorners } from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { formatArtist } from '../utils/formatArtist'
import {
  formatAlbumCoverDiscHeading,
  getAlbumCoverTrackDiscHeadings,
} from '../utils/albumCoverDiscHeadings'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'

const props = withDefaults(
  defineProps<{
    group: LibraryAlbumGroup
    nowPlayingTrackId?: number | null
    isPlaying?: boolean
    selectedTrackId?: number | null
    focusedTrackId?: number | null
  }>(),
  {
    nowPlayingTrackId: null,
    isPlaying: false,
    selectedTrackId: null,
    focusedTrackId: null,
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
const { coverArtworkRounded, coverArtworkRadius } = useCoverArtworkCorners()
const imgError = ref(false)
const discHeadings = computed(() => getAlbumCoverTrackDiscHeadings(props.group.tracks))

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
    <div class="album-cover-aside">
      <div
        class="album-cover-artwork select-none"
        :style="{ borderRadius: coverArtworkRounded ? `${coverArtworkRadius}px` : '0px' }"
        :aria-label="
          t('library.a11y.albumArtwork', {
            album: group.album || t('library.unknownAlbum'),
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
          v-tooltip.overflow="group.album || t('library.unknownAlbum')"
          class="album-cover-meta-title truncate"
        >
          {{ group.album || t('library.unknownAlbum') }}
        </p>
        <p
          class="album-cover-meta-line album-cover-meta-artist flex items-center justify-between gap-2 min-w-0"
        >
          <span v-tooltip.overflow="formatArtist(group.albumArtist)" class="truncate">
            {{ formatArtist(group.albumArtist) }}
          </span>
        </p>
        <p v-if="group.releaseDate" class="album-cover-meta-line album-cover-meta-date truncate">
          {{ group.releaseDate }}
        </p>
      </div>
    </div>

    <div class="album-cover-tracks">
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
          :focused="focusedTrackId === track.id"
          :index="trackIdx"
          @select="emit('select', $event)"
          @play="emit('play', $event)"
          @focus="emit('focusTrack', $event)"
          @open-context-menu="
            (trackId, event, openReason) => emit('openTrackContextMenu', trackId, event, openReason)
          "
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.album-cover-meta-title {
  font-weight: var(--auralis-song-cover-album-weight, 700);
}

.album-cover-meta-artist {
  font-weight: var(--auralis-song-cover-album-artist-weight, 600);
}

.album-cover-meta-date {
  font-weight: var(--auralis-song-cover-release-date-weight, 500);
}

.cover-disc-heading {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  font-family: var(--auralis-font-disc-heading);
  height: var(--library-cover-disc-heading-height);
  padding-inline: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: var(--auralis-song-cover-disc-heading-weight, 700);
  letter-spacing: 0.06em;
}

/* 首个 Disc 标题放入组顶部留白，不占曲目列高度。 */
.cover-disc-heading--first {
  position: absolute;
  top: calc(-1 * var(--library-cover-disc-heading-height));
  left: var(--library-cover-panel-padding-inline-side);
  right: var(--library-cover-panel-padding-inline-side);
}

/* 左右列顶对齐：组高仍由虚拟列表按 max(封面, 曲目) 分配，曲目区不随组高 stretch */
.album-cover-group {
  align-items: start;
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
