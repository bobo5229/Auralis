<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyTopAlbum } from '@shared/types/listeningArchive'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { createAlbumSpineInteraction } from '../runtime/albumSpineInteraction'

const props = defineProps<{ albums: DailyTopAlbum[] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const viewport = ref<HTMLElement | null>(null)
const row = ref<HTMLOListElement | null>(null)
const activeIndex = ref<number | null>(null)
const activeAlbum = computed(() =>
  activeIndex.value === null ? null : props.albums[activeIndex.value],
)
const failedArtwork = ref<ReadonlySet<string>>(new Set())
let interaction: ReturnType<typeof createAlbumSpineInteraction> | undefined
let enabled = false

function albumTitle(album: DailyTopAlbum): string {
  return album.album === 'Unknown Album' ? t('facets.unknownAlbum') : songText(album.album)
}
function albumArtist(album: DailyTopAlbum): string {
  return !album.albumArtist || album.albumArtist === 'Unknown Artist'
    ? t('archive.unknownArtist')
    : songValues(album.albumArtist) || t('archive.unknownArtist')
}
function artwork(album: DailyTopAlbum): string | undefined {
  const key = album.artworkCacheKey
  return key && !failedArtwork.value.has(key) ? (getArtworkUrl(key) ?? undefined) : undefined
}
function artworkError(key: string | null): void {
  if (key) failedArtwork.value = new Set(failedArtwork.value).add(key)
}
function unbind(): void {
  interaction?.dispose()
  interaction = undefined
}
function bind(): void {
  unbind()
  if (enabled && viewport.value && row.value) {
    interaction = createAlbumSpineInteraction(
      viewport.value,
      row.value,
      (index) => {
        activeIndex.value = index
      },
      () => ({ open: t('archive.openAlbumCase'), close: t('archive.closeAlbumCase') }),
    )
  }
}
// Counts can change without changing the displayed cases. Keep an open case and
// the pointer controller alive unless their ordered visual sources change.
watch(
  () =>
    JSON.stringify(
      props.albums.map(({ album, albumArtist, artworkCacheKey }) => [
        album,
        albumArtist,
        artworkCacheKey,
      ]),
    ),
  bind,
  { flush: 'post' },
)
function activate(): void {
  enabled = true
  bind()
}
onMounted(activate)
onActivated(activate)
onDeactivated(() => {
  enabled = false
  unbind()
})
onBeforeUnmount(unbind)
</script>

<template>
  <div class="archive-album-spines">
    <div ref="viewport" class="archive-spines-viewport">
      <ol ref="row" class="archive-spines-row">
        <li
          v-for="(album, index) in albums"
          :key="`${album.album}\u0000${album.albumArtist ?? ''}`"
          class="archive-album-slot"
        >
          <button
            type="button"
            class="archive-album-trigger"
            aria-pressed="false"
            aria-haspopup="dialog"
            aria-expanded="false"
            :aria-label="
              t('archive.albumPreview', {
                rank: index + 1,
                album: albumTitle(album),
                artist: albumArtist(album),
              })
            "
          >
            <span class="archive-album-rank auralis-type-caption" aria-hidden="true">{{
              String(index + 1).padStart(2, '0')
            }}</span>
          </button>
          <div class="archive-album-lift" aria-hidden="true">
            <div class="archive-album-object">
              <div class="archive-album-back"></div>
              <div class="archive-album-spine">
                <img
                  v-if="artwork(album)"
                  :src="artwork(album)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  @error="artworkError(album.artworkCacheKey)"
                />
                <span class="archive-spine-title">{{ albumTitle(album) }}</span>
                <span class="archive-spine-artist">{{ albumArtist(album) }}</span>
              </div>
              <div class="archive-album-edge"></div>
              <div class="archive-album-top"></div>
              <div class="archive-album-bottom"></div>
              <div class="archive-album-front">
                <img
                  v-if="artwork(album)"
                  :src="artwork(album)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  @error="artworkError(album.artworkCacheKey)"
                />
                <span v-else class="i-lucide-disc-3 archive-spine-fallback"></span>
              </div>
            </div>
          </div>
          <div class="archive-album-envelope" aria-hidden="true"></div>
        </li>
      </ol>
    </div>
    <div class="archive-spines-info" aria-live="polite" aria-atomic="true">
      <template v-if="activeAlbum">
        <p class="archive-spines-title auralis-type-control">{{ albumTitle(activeAlbum) }}</p>
        <p class="archive-spines-artist auralis-type-caption">{{ albumArtist(activeAlbum) }}</p>
      </template>
    </div>
  </div>
</template>

<!-- Motion controllers create transient copies; all selectors are feature-prefixed. -->
<style>
.archive-album-spines {
  --archive-album-size: 220px;
  --archive-album-pitch: 64px;
  --archive-spine-angle: 55deg;
  --archive-pull-depth: 160px;
  min-width: 0;
}
.archive-spines-viewport {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-border-strong) transparent;
  overscroll-behavior-x: contain;
}
.archive-spines-row {
  position: relative;
  display: flex;
  justify-content: center;
  width: max-content;
  min-width: 100%;
  margin: 0;
  padding: 40px 140px 32px;
  list-style: none;
}
.archive-album-slot {
  position: relative;
  z-index: 0;
  flex: 0 0 var(--archive-album-pitch);
  width: var(--archive-album-pitch);
  height: calc(var(--archive-album-size) + 38px);
  perspective: 2400px;
  perspective-origin: 50% 45%;
  transform-style: flat;
}
.archive-album-slot.is-active {
  z-index: 10;
}
.archive-album-slot.is-focused .archive-album-lift {
  visibility: hidden;
}
.archive-album-focus {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  overflow: hidden;
  background: transparent;
  color: var(--auralis-text);
}
.archive-album-focus::backdrop {
  background: color-mix(in srgb, var(--auralis-bg) 32%, transparent);
}
.archive-album-focus-mover {
  position: absolute;
  pointer-events: none;
}
.archive-album-focus .archive-album-lift,
.archive-album-focus .archive-album-object {
  transition: none !important;
}
.archive-album-occlusion {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}
.archive-album-occlusion .archive-album-slot {
  position: absolute;
}
.archive-album-occlusion .archive-album-lift,
.archive-album-occlusion .archive-album-object {
  transition: none;
}
.archive-album-trigger {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.archive-album-trigger:focus-visible {
  outline: none;
}
.archive-album-trigger:focus-visible .archive-album-rank {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 5px;
  border-radius: 2px;
}
.archive-album-rank {
  position: absolute;
  top: calc(var(--archive-album-size) + 18px);
  left: 50%;
  transform: translateX(-50%);
  color: var(--auralis-text-faint);
  font-variant-numeric: tabular-nums;
}
.is-active .archive-album-rank {
  color: var(--auralis-theme-accent);
}
.archive-album-lift,
.archive-album-envelope {
  position: absolute;
  top: 0;
  left: 50%;
  width: var(--archive-album-size);
  height: var(--archive-album-size);
  pointer-events: none;
  transform-style: preserve-3d;
}
.archive-album-lift {
  transform: translate3d(-50%, 0, 0);
  transition: transform 500ms cubic-bezier(0.22, 0.8, 0.22, 1);
}
.archive-album-envelope {
  visibility: hidden;
  transform: translate3d(-50%, -12px, var(--archive-pull-depth));
}
.is-active .archive-album-lift {
  transform: translate3d(-50%, -12px, var(--archive-pull-depth));
  transition: transform 620ms cubic-bezier(0.18, 0.85, 0.24, 1);
}
.archive-album-object {
  position: relative;
  width: 100%;
  height: 100%;
  transform: rotateY(var(--archive-spine-angle));
  transform-style: preserve-3d;
  transition: transform 500ms cubic-bezier(0.22, 0.8, 0.22, 1);
}
.is-active .archive-album-object {
  transform: rotateY(0deg);
  transition: transform 650ms cubic-bezier(0.2, 1.04, 0.28, 1) 35ms;
}
.archive-album-front,
.archive-album-back {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--auralis-surface-raised);
  backface-visibility: hidden;
}
.archive-album-front {
  display: grid;
  place-items: center;
  transform: translateZ(7px);
  box-shadow: inset 0 0 0 1px var(--auralis-border-strong);
}
.archive-album-front img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.archive-album-front::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgb(0 0 0 / 14%),
    transparent 6%,
    transparent 97%,
    rgb(255 255 255 / 12%)
  );
  content: '';
}
.archive-album-back {
  transform: rotateY(180deg) translateZ(7px);
  box-shadow: inset 0 0 0 1px var(--auralis-border-strong);
  background: linear-gradient(135deg, var(--auralis-surface-raised), var(--auralis-bg));
}
.archive-album-spine {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  width: 14px;
  height: 100%;
  padding: 10px 0;
  overflow: hidden;
  background: var(--auralis-surface-raised);
  color: var(--auralis-text);
  transform-origin: left center;
  transform: translateZ(-7px) rotateY(-90deg);
  backface-visibility: hidden;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  /* Spine type fits the physical 14px thickness; other text uses semantic roles. */
  font-size: var(--auralis-type-caption-size);
  line-height: 14px;
}
.archive-album-spine img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.2;
}
.archive-spine-title,
.archive-spine-artist {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-spine-title {
  max-height: 65%;
  font-weight: 500;
}
.archive-spine-artist {
  max-height: 30%;
  margin-top: auto;
}
.archive-album-top,
.archive-album-bottom {
  position: absolute;
  left: 0;
  width: 100%;
  height: 14px;
  transform-origin: center top;
  backface-visibility: hidden;
  box-shadow: inset 0 0 0 1px var(--auralis-border-subtle);
}
.archive-album-top {
  top: 0;
  background: color-mix(in srgb, var(--auralis-text) 12%, var(--auralis-surface-raised));
  transform: translateZ(-7px) rotateX(90deg);
}
.archive-album-bottom {
  top: 100%;
  background: color-mix(in srgb, var(--auralis-bg) 35%, var(--auralis-surface-raised));
  transform: translateZ(7px) rotateX(-90deg);
}
.archive-album-edge {
  position: absolute;
  top: 0;
  left: 100%;
  width: 14px;
  height: 100%;
  background: linear-gradient(90deg, var(--auralis-surface-raised), var(--auralis-bg));
  box-shadow: inset 0 0 0 1px var(--auralis-border-subtle);
  transform-origin: left center;
  transform: translateZ(7px) rotateY(90deg);
  backface-visibility: hidden;
}
.archive-spine-fallback {
  width: 48px;
  height: 48px;
  color: var(--auralis-text-faint);
}
.archive-spines-info {
  min-height: 48px;
  margin-top: 4px;
  padding-inline: 16px;
  text-align: center;
}
.archive-spines-title,
.archive-spines-artist {
  margin: 0;
  overflow-wrap: anywhere;
}
.archive-spines-title {
  color: var(--auralis-text);
  font-weight: 600;
}
.archive-spines-artist {
  margin-top: 4px;
  color: var(--auralis-text-muted);
}
.archive-spines-viewport[data-reduced-motion='true'] .archive-album-lift,
.archive-spines-viewport[data-reduced-motion='true'] .archive-album-object {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .archive-album-lift,
  .archive-album-object {
    transition: none !important;
  }
}
</style>
