<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import type { AlbumSummary } from '@renderer/features/albums/types'
import { useRecentAlbumCarousel } from '../composables/useRecentAlbumCarousel'

const props = defineProps<{ albums: readonly AlbumSummary[] }>()
const emit = defineEmits<{ open: [album: AlbumSummary]; play: [album: AlbumSummary] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const root = ref<HTMLElement | null>(null)
const hovered = ref(false)
const focused = ref(false)
const visible = ref(false)
const documentVisible = ref(false)
const reducedMotion = ref(true)
const slides = computed(() => props.albums.slice(0, 8))
const keys = computed(() => slides.value.map((album) => album.key))
const enabled = computed(
  () =>
    visible.value &&
    documentVisible.value &&
    !reducedMotion.value &&
    !hovered.value &&
    !focused.value,
)
const { index, paused, running, move } = useRecentAlbumCarousel(keys, enabled)
const current = computed(() => slides.value[index.value])
const title = computed(() =>
  current.value?.title === 'Unknown Album'
    ? t('facets.unknownAlbum')
    : songText(current.value?.title),
)
const artist = computed(() =>
  current.value?.albumArtist === 'Unknown Artist'
    ? t('facets.unknownArtist')
    : songValues(current.value?.albumArtist),
)
const failedArtworks = ref(new Set<string>())
function artwork(album: AlbumSummary): string | null {
  return album.artworkCacheKey && !failedArtworks.value.has(album.artworkCacheKey)
    ? getArtworkUrl(album.artworkCacheKey)
    : null
}
function artworkFailed(key: string | null): void {
  if (key) failedArtworks.value = new Set([...failedArtworks.value, key])
}
const covers = computed(() =>
  slides.value.flatMap((album, position) => {
    const distance = (position - index.value + slides.value.length) % slides.value.length
    const slot =
      distance === 0
        ? 'current'
        : distance === 1
          ? 'next'
          : distance === slides.value.length - 1
            ? 'previous'
            : null
    return slot ? [{ album, slot }] : []
  }),
)
function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  event.stopPropagation()
  move(event.key === 'ArrowLeft' ? -1 : 1)
}
function onFocusOut(event: FocusEvent): void {
  focused.value =
    event.relatedTarget instanceof Node && Boolean(root.value?.contains(event.relatedTarget))
}
let cleanup = () => {}
onMounted(() => {
  const motion = createReducedMotionQuery()
  const syncMotion = () => {
    reducedMotion.value = motion.matches
  }
  const syncVisibility = () => {
    documentVisible.value = document.visibilityState === 'visible'
  }
  syncMotion()
  syncVisibility()
  motion.addEventListener('change', syncMotion)
  document.addEventListener('visibilitychange', syncVisibility)
  const observer =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
          visible.value = entry.isIntersecting
        })
      : null
  if (root.value && observer) observer.observe(root.value)
  else visible.value = true
  cleanup = () => {
    observer?.disconnect()
    motion.removeEventListener('change', syncMotion)
    document.removeEventListener('visibilitychange', syncVisibility)
  }
})
onBeforeUnmount(() => cleanup())
</script>

<template>
  <section
    v-if="current"
    ref="root"
    class="recent-added-hero"
    :aria-label="t('library.recentAdded.carousel')"
    :aria-roledescription="t('library.recentAdded.carouselRole')"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <div class="recent-hero-copy">
      <p class="recent-hero-eyebrow"><span></span>{{ t('library.recentAdded.heroEyebrow') }}</p>
      <div class="recent-hero-metadata" :aria-live="running ? 'off' : 'polite'" aria-atomic="true">
        <h2 :title="title">{{ title }}</h2>
        <p class="recent-hero-artist" :title="artist">{{ artist }}</p>
        <p class="recent-hero-count">
          {{ t('library.recentAdded.tracks', { count: current.tracks.length }) }}
        </p>
      </div>
      <div class="recent-hero-actions">
        <button class="recent-hero-play" type="button" @click="emit('play', current)">
          <span class="i-lucide-play" aria-hidden="true"></span
          >{{ t('library.recentAdded.playAlbum') }}
        </button>
        <button class="recent-hero-open" type="button" @click="emit('open', current)">
          {{ t('library.recentAdded.previewTracks')
          }}<span class="i-lucide-arrow-down-right" aria-hidden="true"></span>
        </button>
      </div>
      <div v-if="slides.length > 1" class="recent-hero-controls">
        <button type="button" :aria-label="t('library.recentAdded.previous')" @click="move(-1)">
          <span class="i-lucide-arrow-left" aria-hidden="true"></span>
        </button>
        <span class="recent-hero-position" aria-hidden="true"
          >{{ String(index + 1).padStart(2, '0')
          }}<span>/ {{ String(slides.length).padStart(2, '0') }}</span></span
        >
        <button type="button" :aria-label="t('library.recentAdded.next')" @click="move(1)">
          <span class="i-lucide-arrow-right" aria-hidden="true"></span>
        </button>
        <button
          v-if="!reducedMotion"
          type="button"
          :aria-label="t(paused ? 'library.recentAdded.resume' : 'library.recentAdded.pause')"
          @click="paused = !paused"
        >
          <span :class="paused ? 'i-lucide-play' : 'i-lucide-pause'" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <div class="recent-hero-artwork">
      <div class="recent-hero-glow" aria-hidden="true"></div>
      <TransitionGroup name="recent-cover" tag="div" class="recent-hero-covers">
        <div
          v-for="cover in covers"
          :key="cover.album.key"
          class="recent-hero-cover"
          :class="`recent-hero-cover--${cover.slot}`"
          aria-hidden="true"
        >
          <img
            v-if="artwork(cover.album)"
            :src="artwork(cover.album)!"
            alt=""
            draggable="false"
            decoding="async"
            @error="artworkFailed(cover.album.artworkCacheKey)"
          />
          <span v-else class="i-lucide-disc-3 recent-hero-placeholder"></span>
        </div>
      </TransitionGroup>
      <button
        class="recent-hero-cover-link"
        type="button"
        :aria-label="t('library.recentAdded.inspectAlbum', { title })"
        @click="emit('open', current)"
      ></button>
    </div>
  </section>
</template>

<style scoped>
.recent-added-hero {
  --recent-cover-size: clamp(180px, 25cqi, 300px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  height: clamp(300px, 38cqi, 380px);
  margin: 28px 0 0;
  border-radius: 20px;
  padding: 20px 28px;
  background: linear-gradient(115deg, var(--auralis-control-hover-bg), transparent);
  container-type: inline-size;
}
.recent-hero-copy {
  align-self: center;
  min-width: 0;
  padding: 12px 20px 12px 0;
  z-index: 2;
}
.recent-added-hero button {
  border: 0;
  padding: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}
.recent-hero-eyebrow {
  margin: 0 0 12px;
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  letter-spacing: 0.12em;
}
.recent-hero-metadata h2 {
  margin: 0;
  font-size: clamp(26px, 4.2cqi, 46px);
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--auralis-text);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.recent-hero-artist {
  margin: 8px 0 0;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-hero-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  color: var(--auralis-text);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.recent-hero-open:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.recent-hero-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.recent-hero-controls button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--auralis-text-muted);
}
.recent-hero-controls button:hover {
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}
.recent-hero-position {
  display: flex;
  gap: 8px;
  font-size: var(--auralis-type-caption-size);
  font-variant-numeric: tabular-nums;
  color: var(--auralis-text);
}
.recent-hero-position span {
  color: var(--auralis-text-faint);
}
.recent-added-hero button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 4px;
}
.recent-hero-artwork {
  position: relative;
  min-width: 0;
  overflow: hidden;
}
.recent-hero-glow {
  position: absolute;
  inset: 12% 0;
  background: radial-gradient(
    ellipse,
    color-mix(in srgb, var(--auralis-text) 6%, transparent),
    transparent 70%
  );
}
.recent-hero-covers {
  position: absolute;
  inset: 0;
}
.recent-hero-cover,
.recent-hero-cover-link {
  position: absolute;
  width: var(--recent-cover-size);
  height: var(--recent-cover-size);
  left: 50%;
  top: 50%;
  border-radius: var(--auralis-artwork-radius-hero);
  transform: translate(-50%, -50%);
}
.recent-hero-cover {
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--auralis-surface-raised);
  box-shadow: 0 12px 28px #00000024;
  transition:
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 450ms ease;
}
.recent-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.recent-hero-cover--current {
  z-index: 3;
  opacity: 1;
}
.recent-hero-cover--previous {
  transform: translate(-87%, -50%) scale(0.78) rotate(-8deg);
  z-index: 1;
  opacity: 0.45;
}
.recent-hero-cover--next {
  transform: translate(-13%, -50%) scale(0.78) rotate(8deg);
  z-index: 2;
  opacity: 0.45;
}
.recent-hero-cover-link {
  z-index: 4;
  cursor: pointer;
  background: transparent;
}
.recent-hero-placeholder {
  font-size: 56px;
  color: var(--auralis-text-faint);
}
.recent-cover-enter-from,
.recent-cover-leave-to {
  opacity: 0;
}
@container (max-width: 520px) {
  .recent-hero-artwork {
    --recent-cover-size: 130px;
  }
  .recent-hero-cover--previous,
  .recent-hero-cover--next {
    opacity: 0.18;
  }
  .recent-hero-copy {
    padding-right: 8px;
  }
  .recent-hero-metadata h2 {
    font-size: 22px;
  }
}
@container (max-width: 520px) {
  .recent-added-hero {
    height: 260px;
    --recent-cover-size: 140px;
  }
  .recent-hero-eyebrow {
    margin-bottom: 6px;
  }
  .recent-hero-controls,
  .recent-hero-open {
    margin-top: 6px;
  }
  .recent-hero-metadata h2 {
    font-size: 22px;
    -webkit-line-clamp: 1;
  }
}
:where([data-reduced-motion='true']) .recent-hero-cover {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .recent-hero-cover {
    transition: none;
  }
}
.recent-hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.recent-hero-eyebrow span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--auralis-text-faint);
}
.recent-hero-count {
  margin-top: 6px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-faint);
}
.recent-hero-actions {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 20px;
}
.recent-added-hero .recent-hero-play {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--auralis-text);
  color: var(--auralis-main-bg);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.recent-hero-open {
  margin-top: 0;
}
.recent-hero-controls {
  margin-top: 20px;
}
@container (max-width:520px) {
  .recent-hero-actions {
    gap: 10px;
    margin-top: 12px;
  }
  .recent-added-hero .recent-hero-play {
    padding: 8px 10px;
    font-size: 12px;
  }
  .recent-hero-cover--previous,
  .recent-hero-cover--next {
    display: none;
  }
}
</style>
