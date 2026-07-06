<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { AlbumSummary } from '../types'

const props = defineProps<{
  album: AlbumSummary
  displayMode: 'grid' | 'perspective'
  highlighted?: boolean
}>()

const emit = defineEmits<{
  open: [album: AlbumSummary]
  openContextMenu: [album: AlbumSummary, event: MouseEvent]
}>()

const imageFailed = ref(false)

watch(
  () => props.album.artworkCacheKey,
  () => {
    imageFailed.value = false
  },
)

// ── 3D tilt effect (perspective mode only) ──────────────
const tiltX = ref(0)
const tiltY = ref(0)
const isTracking = ref(false)

const artworkStyle = computed(() => {
  if (props.displayMode !== 'perspective') return {}
  return {
    transform: `rotateY(${4 + tiltY.value}deg) rotateX(${tiltX.value}deg)`,
  }
})

function onArtworkPointerEnter(): void {
  if (props.displayMode !== 'perspective') return
  isTracking.value = true
}

function onArtworkPointerMove(event: PointerEvent): void {
  if (props.displayMode !== 'perspective') return
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2 // [-1, 1]
  const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2 // [-1, 1]
  tiltX.value = -ny * 10
  tiltY.value = nx * 8
}

function onArtworkPointerLeave(): void {
  tiltX.value = 0
  tiltY.value = 0
  isTracking.value = false
}
</script>

<template>
  <article
    class="album-card min-w-0"
    :class="[`album-card--${displayMode}`, { 'album-card--highlighted': highlighted }]"
  >
    <div
      class="album-card-artwork aspect-square overflow-hidden bg-[var(--auralis-artwork-placeholder-bg)]"
      :class="{ 'album-card-artwork--tracking': isTracking && displayMode === 'perspective' }"
      :style="artworkStyle"
      role="button"
      tabindex="0"
      :aria-label="`Open ${album.title}`"
      @click="emit('open', album)"
      @contextmenu.prevent="emit('openContextMenu', album, $event)"
      @keydown.enter="emit('open', album)"
      @keydown.space.prevent="emit('open', album)"
      @pointerenter="onArtworkPointerEnter"
      @pointermove="onArtworkPointerMove"
      @pointerleave="onArtworkPointerLeave"
    >
      <img
        v-if="getArtworkUrl(album.artworkCacheKey) && !imageFailed"
        :src="getArtworkUrl(album.artworkCacheKey)!"
        :alt="`${album.title} cover`"
        class="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        draggable="false"
        @error="imageFailed = true"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-[var(--auralis-text-disabled)]"
        aria-hidden="true"
      >
        <span class="i-lucide-disc-3 h-10 w-10"></span>
      </div>
    </div>

    <div class="mt-3 min-w-0">
      <h2 class="truncate text-sm font-semibold text-[var(--auralis-text)]">
        {{ album.title }}
      </h2>
      <p class="mt-1 truncate text-xs text-[var(--auralis-text-muted)]">
        {{ album.albumArtist }}
      </p>
      <p v-if="album.releaseDate" class="mt-1 truncate text-xs text-[var(--auralis-text-faint)]">
        {{ album.releaseDate.slice(0, 4) }}年
      </p>
    </div>
  </article>
</template>

<style scoped>
.album-card {
  perspective: 900px;
}

.album-card--highlighted .album-card-artwork {
  animation: album-card-search-highlight 1.8s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes album-card-search-highlight {
  0%,
  35% {
    box-shadow:
      0 0 0 3px var(--auralis-sidebar-active-indicator),
      0 12px 28px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 28%, transparent);
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.album-card-artwork {
  border-radius: 12px;
  cursor: pointer;
  outline: none;
}

.album-card-artwork:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 3px;
}

.album-card--perspective .album-card-artwork {
  position: relative;
  border-radius: 0;
  clip-path: polygon(0 0, 94% 4%, 94% 96%, 0 100%);
  transform-origin: left center;
  box-shadow: 10px 12px 24px rgba(0, 0, 0, 0.18);
  transition: transform 0.5s cubic-bezier(0.23, 1, 0.32, 1);
}

.album-card-artwork--tracking {
  transition: none !important;
}

.album-card--perspective .album-card-artwork img {
  transform: scale(1.015);
}

.album-card--perspective .album-card-artwork::after {
  position: absolute;
  z-index: 2;
  top: 4%;
  right: 6%;
  bottom: 4%;
  width: 4%;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.28));
  content: '';
  pointer-events: none;
}
</style>
