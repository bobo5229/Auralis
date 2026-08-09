<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { formatArtist } from '../utils/formatArtist'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'

export type LibraryAlbumGroup = {
  key: string
  album: string | null
  albumArtist: string | null
  releaseDate: string | null
  artworkCacheKey: string | null
  tracks: TrackListItem[]
  firstTrackIndex: number
}

const props = defineProps<{
  group: LibraryAlbumGroup
  nowPlayingTrackId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  openTrackContextMenu: [trackId: number, event: MouseEvent]
  openAlbumArtworkContextMenu: [anchorTrackId: number, event: MouseEvent]
}>()

const imgError = ref(false)

watch(
  () => props.group.artworkCacheKey,
  () => {
    imgError.value = false
  },
)

function onArtworkContextMenu(event: MouseEvent): void {
  const anchorTrackId = props.group.tracks[0]?.id
  if (anchorTrackId != null) {
    emit('openAlbumArtworkContextMenu', anchorTrackId, event)
  }
}
</script>

<template>
  <div class="album-cover-group" :data-album-key="group.key">
    <div class="album-cover-aside">
      <div class="album-cover-artwork" @contextmenu.prevent="onArtworkContextMenu">
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

      <div class="album-cover-meta">
        <p class="album-cover-meta-title">{{ group.album ?? '' }}</p>
        <p class="album-cover-meta-line truncate">{{ formatArtist(group.albumArtist) }}</p>
        <p v-if="group.releaseDate" class="album-cover-meta-line album-cover-meta-date truncate">
          {{ group.releaseDate }}
        </p>
      </div>
    </div>

    <div class="album-cover-tracks">
      <AlbumCoverTrackRow
        v-for="track in group.tracks"
        :key="track.id"
        :track="track"
        :now-playing="nowPlayingTrackId === track.id"
        @select="emit('select', $event)"
        @play="emit('play', $event)"
        @open-context-menu="(trackId, event) => emit('openTrackContextMenu', trackId, event)"
      />
    </div>
  </div>
</template>

<style scoped>
.album-cover-meta-date {
  font-weight: 500;
}

/* 左右列顶对齐：组高仍由虚拟列表按 max(封面, 曲目) 分配，面板不随组高 stretch */
.album-cover-group {
  align-items: start;
}

/* 复用专辑详情曲目列表面板壳；高度随内容收缩，少曲目时不留空壳。
 * padding / border-width 消费 libraryLayoutMetrics 注入的 --library-*，
 * 与 getAlbumGroupEstimatedHeight 同一事实源（Phase 6 REVIEW Finding 1）。 */
.album-cover-tracks {
  box-sizing: border-box;
  align-self: start;
  width: 100%;
  height: fit-content;
  min-width: 0;
  background: var(--auralis-track-list-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: var(--library-cover-panel-border-width) solid var(--auralis-track-list-border);
  border-radius: 20px;
  padding: var(--library-cover-panel-padding-block-side);
  box-shadow:
    0 12px 36px 0 rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
</style>
