<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { formatDuration } from '@renderer/shared/media/formatDuration'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'
import { ARTWORK_CORNER_RADII } from '@renderer/shared/artwork/artworkCorners'
import PlayingIndicator from '@renderer/features/appearance/components/PlayingIndicator.vue'

const props = defineProps<{ track: TrackListItem; selected: boolean; current: boolean; playing: boolean }>()
const emit = defineEmits<{ select: [id: number]; play: [id: number]; openAlbum: [id: number] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const artwork = computed(() => getArtworkUrl(props.track.artworkCacheKey))
const imageFailed = ref(false)
watch(artwork, () => { imageFailed.value = false })
const title = computed(() => songText(props.track.title) || t('library.missing.title'))
const artist = computed(() => songValues(props.track.artist) || t('library.missing.artist'))
const album = computed(() => songText(props.track.album) || t('library.missing.album'))
</script>

<template>
  <article class="search-song" :class="{ 'is-selected': selected, 'is-current': current }" :style="{ '--song-card-radius': `var(--auralis-artwork-radius-card, ${ARTWORK_CORNER_RADII.card}px)` }">
    <button type="button" class="search-song-main" :aria-label="title + ' — ' + artist" :title="title + ' — ' + artist" :aria-pressed="selected" :aria-current="current ? 'true' : undefined" @click="emit('select', track.id)" @dblclick="emit('play', track.id)" @keydown.enter.prevent="emit('play', track.id)" />
    <span class="search-song-artwork">
      <img v-if="artwork && !imageFailed" :src="artwork" alt="" loading="lazy" decoding="async" draggable="false" @error="imageFailed = true" />
      <span v-else class="search-song-placeholder"><span class="i-lucide-music-2" aria-hidden="true" /></span>
      <span v-if="current" class="search-song-playing"><PlayingIndicator :playing="playing" /></span>
    </span>
    <div class="search-song-copy">
      <strong>{{ title }}</strong>
      <span class="search-song-caption">
        <span class="search-song-artist">{{ artist }}</span>
        <span v-if="formatDuration(track.durationSeconds)" class="search-song-duration">{{ formatDuration(track.durationSeconds) }}</span>
      </span>
      <button v-tooltip.overflow="album" type="button" class="search-song-album" :aria-label="t('search.openAlbum') + ': ' + album" @click="emit('openAlbum', track.id)">{{ album }}</button>
    </div>
  </article>
</template>

<style scoped>
.search-song { position: relative; display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 14px; min-width: 0; padding: 12px; border-radius: calc(var(--song-card-radius) + 12px); background: var(--auralis-control-hover-bg); }
.search-song button { font: inherit; color: inherit; border: 0; background: transparent; cursor: pointer; text-align: left; }
.search-song button:focus-visible { outline: 2px solid var(--auralis-focus-ring); outline-offset: 3px; }
.search-song .search-song-main { position: absolute; inset: 0; width: 100%; padding: 0; border-radius: inherit; }
.search-song:hover { background: color-mix(in srgb, var(--auralis-control-hover-bg) 60%, var(--auralis-surface-raised)); }
.search-song.is-selected { outline: 2px solid var(--auralis-sidebar-active-indicator); outline-offset: 2px; }
.search-song-artwork { position: relative; display: block; width: 80px; aspect-ratio: 1; pointer-events: none; border-radius: var(--song-card-radius); background: var(--auralis-artwork-placeholder-bg); }
.search-song-artwork img, .search-song-placeholder { display: flex; width: 100%; height: 100%; object-fit: cover; align-items: center; justify-content: center; border-radius: inherit; }
.search-song-placeholder > span { width: 32px; height: 32px; color: var(--auralis-text-faint); }
.search-song-playing { position: absolute; left: 8px; bottom: 8px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; color: #fff; background: rgb(0 0 0 / 70%); }
.search-song-copy { pointer-events: none; width: 100%; min-width: 0; display: flex; flex-direction: column; gap: var(--album-list-text-gap, 3px); }
.search-song-copy strong { display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--album-list-type-title-size); line-height: var(--album-list-type-title-line-height); font-weight: var(--album-list-type-title-weight); }
.is-current .search-song-copy strong { color: var(--auralis-theme-accent); }
.search-song-caption { display: flex; align-items: baseline; justify-content: space-between; min-width: 0; gap: 8px; font-size: var(--album-list-type-artist-size); line-height: var(--album-list-type-artist-line-height); font-weight: var(--album-list-type-artist-weight); color: var(--auralis-text-muted); }
.search-song-artist { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.search-song-duration { flex-shrink: 0; color: var(--auralis-text-faint); font-variant-numeric: tabular-nums; }
.search-song .search-song-album { display: block; width: 100%; max-width: 100%; position: relative; pointer-events: auto; padding: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--album-list-type-year-size); line-height: var(--album-list-type-year-line-height); font-weight: var(--album-list-type-year-weight); color: var(--auralis-text-faint); }
.search-song-album:hover { color: var(--auralis-text-muted); text-decoration: underline; }
</style>
