<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { AlbumSummary } from '../types'
import { formatAlbumYear } from '../utils/formatAlbumYear'

const props = defineProps<{
  albums: AlbumSummary[]
  artistLabel: string
  effectsActive: boolean
  opening: boolean
}>()
const emit = defineEmits<{ open: [album: AlbumSummary, event: MouseEvent] }>()
const { t, locale } = useI18n()
const moreAlbumsScrollerRef = ref<HTMLElement | null>(null)
let isPageUnmounted = false

const isMoreScrolledToStart = ref(true)
const isMoreScrolledToEnd = ref(false)
const isMoreScrollable = ref(false)

function resetMoreAlbumsScrollState(): void {
  isMoreScrolledToStart.value = true
  isMoreScrolledToEnd.value = false
  isMoreScrollable.value = false
}

function updateMoreAlbumsScrollState(scroller: HTMLElement | null): void {
  if (!scroller) return
  const maxScroll = scroller.scrollWidth - scroller.clientWidth
  isMoreScrollable.value = maxScroll > 1
  if (!isMoreScrollable.value) {
    isMoreScrolledToStart.value = true
    isMoreScrolledToEnd.value = true
    return
  }
  isMoreScrolledToStart.value = scroller.scrollLeft <= 2
  isMoreScrolledToEnd.value = scroller.scrollLeft >= maxScroll - 2
}

function onMoreAlbumsScroll(event: Event): void {
  updateMoreAlbumsScrollState(event.currentTarget as HTMLElement)
}

function formatDisplayAlbumTitle(title: string): string {
  return title === 'Unknown Album' ? t('library.unknownAlbum') : title
}

async function refreshMoreAlbumsScrollState(): Promise<void> {
  if (!props.effectsActive || !props.albums.length) {
    resetMoreAlbumsScrollState()
    return
  }

  await nextTick()
  if (isPageUnmounted || !props.effectsActive || !props.albums.length) return

  const scroller = moreAlbumsScrollerRef.value
  if (scroller) {
    updateMoreAlbumsScrollState(scroller)
  } else {
    resetMoreAlbumsScrollState()
  }
}

/** Map vertical wheel to horizontal scroll for 'More Albums' section with boundary pass-through. */
function onMoreAlbumsWheel(event: WheelEvent): void {
  const scroller = event.currentTarget as HTMLElement
  if (scroller.scrollWidth <= scroller.clientWidth + 1) return

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return

  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth

  if (
    (delta < 0 && scroller.scrollLeft > 0) ||
    (delta > 0 && scroller.scrollLeft < maxScrollLeft - 1)
  ) {
    event.preventDefault()
    scroller.scrollLeft += delta
    updateMoreAlbumsScrollState(scroller)
  }
}

function formatAlbumYearLabel(value: string | null): string {
  return formatAlbumYear(value, locale.value, t('albums.detail.unknownYear'))
}
watch(
  [
    () => props.effectsActive,
    () => props.albums.map((album) => album.key).join('\u0001'),
    moreAlbumsScrollerRef,
  ],
  () => {
    void refreshMoreAlbumsScrollState()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  isPageUnmounted = true
})
</script>

<template>
  <section
    class="album-more-gallery"
    :aria-label="t('albums.detail.moreAlbumsAria', { artist: artistLabel })"
  >
    <h2 class="album-more-gallery-title">
      {{ t('albums.detail.moreAlbumsTitle', { artist: artistLabel }) }}
    </h2>
    <div
      ref="moreAlbumsScrollerRef"
      class="album-more-gallery-scroller"
      :class="{
        'is-at-start': isMoreScrolledToStart,
        'is-at-end': isMoreScrolledToEnd,
        'is-unscrollable': !isMoreScrollable,
      }"
      @scroll="onMoreAlbumsScroll"
      @wheel="onMoreAlbumsWheel"
    >
      <button
        v-for="album in albums"
        :key="album.key"
        type="button"
        class="album-more-gallery-card"
        :aria-label="
          t('albums.detail.openAlbumAria', { title: formatDisplayAlbumTitle(album.title) })
        "
        :disabled="opening"
        @click="emit('open', album, $event)"
      >
        <div class="album-more-gallery-cover">
          <img
            v-if="getArtworkUrl(album.artworkCacheKey)"
            :src="getArtworkUrl(album.artworkCacheKey)!"
            :alt="t('albums.detail.coverAlt', { title: formatDisplayAlbumTitle(album.title) })"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable="false"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
            aria-hidden="true"
          >
            <span class="i-lucide-disc-3 h-10 w-10 text-[var(--auralis-text-disabled)]"></span>
          </div>
        </div>
        <div class="album-more-gallery-meta">
          <p class="album-more-gallery-album-title">
            {{ formatDisplayAlbumTitle(album.title) }}
          </p>
          <p class="album-more-gallery-year">
            {{ formatAlbumYearLabel(album.releaseDate) }}
          </p>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped src="../styles/albumDetail.more-gallery.css"></style>
