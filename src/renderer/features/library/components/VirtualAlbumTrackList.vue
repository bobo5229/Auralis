<script setup lang="ts">
import { computed } from 'vue'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/vue-virtual'
import type { TrackListItem } from '@shared/types/libraryScan'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import {
  formatAlbumCoverDiscHeading,
  getAlbumCoverTrackDiscHeadings,
} from '../utils/albumCoverDiscHeadings'

const props = defineProps<{
  tracks: readonly TrackListItem[]
  scrollElement: HTMLElement | null
  startOffset: number
  nowPlayingTrackId: number | null
  isPlaying: boolean
  selectedTrackId: number | null
  focusedTrackId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focusTrack: [trackId: number]
  openTrackContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()

const discHeadings = computed(() => getAlbumCoverTrackDiscHeadings(props.tracks))
const focusedIndex = computed(() =>
  props.focusedTrackId === null
    ? -1
    : props.tracks.findIndex((track) => track.id === props.focusedTrackId),
)
const scrollMargin = computed(
  () =>
    props.startOffset +
    LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide +
    LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth +
    LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide,
)
const trackVirtualizer = useVirtualizer(
  computed(() => {
    const headings = discHeadings.value
    const focusIndex = focusedIndex.value
    const tracks = props.tracks
    return {
      count: tracks.length,
      getScrollElement: () => props.scrollElement,
      getItemKey: (index: number) => tracks[index].id,
      estimateSize: (index: number) =>
        LIBRARY_LAYOUT_METRICS.coverTrackRowHeight +
        (index > 0 && headings[index] !== null ? LIBRARY_LAYOUT_METRICS.coverDiscHeadingHeight : 0),
      scrollMargin: scrollMargin.value,
      initialOffset: () => props.scrollElement?.scrollTop ?? 0,
      overscan: 8,
      rangeExtractor: (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        const indexes = defaultRangeExtractor(range)
        // 焦点行保持挂载，沿用现有 focus() 的原生滚动与菜单焦点交还路径。
        if (focusIndex >= 0 && !indexes.includes(focusIndex)) {
          indexes.push(focusIndex)
          indexes.sort((a, b) => a - b)
        }
        return indexes
      },
    }
  }),
)
const virtualTracks = computed(() => trackVirtualizer.value.getVirtualItems())
const totalSize = computed(() => trackVirtualizer.value.getTotalSize())
</script>

<template>
  <div class="virtual-album-track-list" :style="{ height: `${totalSize}px` }">
    <div
      v-for="(item, itemIndex) in virtualTracks"
      :key="String(item.key)"
      class="virtual-album-track-item"
      :class="{
        'virtual-album-track-item--adjacent':
          itemIndex > 0 && virtualTracks[itemIndex - 1].index === item.index - 1,
      }"
      :style="{ top: `${item.start - scrollMargin}px`, height: `${item.size}px` }"
    >
      <div
        v-if="discHeadings[item.index] !== null"
        class="cover-disc-heading"
        :class="{ 'cover-disc-heading--first': item.index === 0 }"
      >
        {{ formatAlbumCoverDiscHeading(discHeadings[item.index]!) }}
      </div>
      <AlbumCoverTrackRow
        :track="tracks[item.index]"
        :now-playing="nowPlayingTrackId === tracks[item.index].id"
        :is-playing="isPlaying"
        :selected="selectedTrackId === tracks[item.index].id"
        :focused="focusedTrackId === tracks[item.index].id"
        :index="item.index"
        :disc-end="item.index === tracks.length - 1 || discHeadings[item.index + 1] != null"
        @select="emit('select', $event)"
        @play="emit('play', $event)"
        @focus="emit('focusTrack', $event)"
        @open-context-menu="
          (trackId, event, openReason) => emit('openTrackContextMenu', trackId, event, openReason)
        "
      />
    </div>
  </div>
</template>

<style scoped>
.virtual-album-track-list {
  position: relative;
}

.virtual-album-track-item {
  position: absolute;
  left: 0;
  right: 0;
}

/* 虚拟行有独立定位容器，仍隐藏高亮行与下一条曲目之间的分割线。 */
.virtual-album-track-item:has(
    > .cover-track-row:is(:hover, [aria-pressed='true'], .cover-track-row--playing)
  )
  + .virtual-album-track-item--adjacent
  > :deep(.cover-track-row:first-child)::before {
  display: none;
}
</style>
