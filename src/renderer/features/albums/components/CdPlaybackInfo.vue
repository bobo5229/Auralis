<script setup lang="ts">
defineProps<{
  information: { title: string; artist: string; album: string }
  hideAlbum: boolean
}>()
</script>

<template>
  <div class="cd-playback-info" role="status" aria-live="polite" aria-atomic="true">
    <span v-tooltip.overflow="information.title" class="cd-current-track-title" dir="auto">{{
      information.title
    }}</span>
    <span v-tooltip.overflow="information.artist" class="cd-current-track-artist" dir="auto">{{
      information.artist
    }}</span>
    <span
      v-tooltip.overflow="hideAlbum ? '' : information.album"
      class="cd-current-track-album"
      :class="{ 'cd-current-track-album--hidden': hideAlbum }"
      :aria-hidden="hideAlbum"
      dir="auto"
      >{{ information.album }}</span
    >
  </div>
</template>

<style scoped>
.cd-playback-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-family: var(--cd-font-display);
  color: var(--cd-text);
}
.cd-current-track-title {
  display: -webkit-box;
  max-height: calc(2 * var(--cd-type-playback-line-height));
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: var(--cd-type-playback-size);
  line-height: var(--cd-type-playback-line-height);
  font-weight: 500;
  pointer-events: auto;
}
.cd-current-track-artist,
.cd-current-track-album {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
}
.cd-current-track-artist {
  font-size: var(--cd-type-playback-artist-size);
  line-height: var(--cd-type-playback-artist-line-height);
  color: var(--cd-text-muted);
}
.cd-current-track-album {
  font-size: var(--cd-type-playback-album-size);
  line-height: var(--cd-type-playback-album-line-height);
  color: var(--cd-text-faint);
}
.cd-current-track-album--hidden {
  visibility: hidden;
}
</style>
