<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getArtworkUrl } from '../utils/getArtworkUrl'
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
        <p class="album-cover-meta-line truncate">{{ group.albumArtist ?? '' }}</p>
        <p v-if="group.releaseDate" class="album-cover-meta-line truncate">
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
