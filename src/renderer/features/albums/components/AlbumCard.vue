<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { AlbumSummary } from '../types'

const props = defineProps<{
  album: AlbumSummary
  displayMode: 'grid' | 'perspective'
}>()

const emit = defineEmits<{
  open: [album: AlbumSummary]
}>()

const imageFailed = ref(false)
let disturbanceFrame: number | null = null
let pendingDisturbance: {
  target: HTMLElement
  clientX: number
  clientY: number
} | null = null

watch(
  () => props.album.artworkCacheKey,
  () => {
    imageFailed.value = false
  },
)

function renderDisturbance(): void {
  disturbanceFrame = null
  const disturbance = pendingDisturbance
  pendingDisturbance = null
  if (!disturbance) return

  const { target, clientX, clientY } = disturbance
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const yRatio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
  const xOffset = xRatio - 0.5
  const yOffset = yRatio - 0.5

  target.style.setProperty('--album-tilt-x', `${-yOffset * 7}deg`)
  target.style.setProperty('--album-tilt-y', `${4 + xOffset * 9}deg`)
  target.style.setProperty('--album-shift-x', `${xOffset * 4}px`)
  target.style.setProperty('--album-shift-y', `${yOffset * 4}px`)
  target.style.setProperty('--album-glint-x', `${xRatio * 100}%`)
  target.style.setProperty('--album-glint-y', `${yRatio * 100}%`)
}

function onArtworkPointerMove(event: PointerEvent): void {
  if (props.displayMode !== 'perspective') return
  pendingDisturbance = {
    target: event.currentTarget as HTMLElement,
    clientX: event.clientX,
    clientY: event.clientY,
  }
  if (disturbanceFrame === null) {
    disturbanceFrame = window.requestAnimationFrame(renderDisturbance)
  }
}

function onArtworkPointerLeave(event: PointerEvent): void {
  pendingDisturbance = null
  if (disturbanceFrame !== null) {
    window.cancelAnimationFrame(disturbanceFrame)
    disturbanceFrame = null
  }

  const target = event.currentTarget as HTMLElement
  target.style.removeProperty('--album-tilt-x')
  target.style.removeProperty('--album-tilt-y')
  target.style.removeProperty('--album-shift-x')
  target.style.removeProperty('--album-shift-y')
  target.style.removeProperty('--album-glint-x')
  target.style.removeProperty('--album-glint-y')
}

onBeforeUnmount(() => {
  if (disturbanceFrame !== null) {
    window.cancelAnimationFrame(disturbanceFrame)
  }
})
</script>

<template>
  <article class="album-card min-w-0" :class="`album-card--${displayMode}`">
    <div
      class="album-card-artwork aspect-square overflow-hidden bg-[var(--auralis-artwork-placeholder-bg)]"
      role="button"
      tabindex="0"
      :aria-label="`Open ${album.title}`"
      @click="emit('open', album)"
      @keydown.enter="emit('open', album)"
      @keydown.space.prevent="emit('open', album)"
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
  --album-tilt-x: 0deg;
  --album-tilt-y: 4deg;
  --album-shift-x: 0px;
  --album-shift-y: 0px;
  --album-glint-x: 50%;
  --album-glint-y: 50%;
  position: relative;
  border-radius: 0;
  clip-path: polygon(0 0, 94% 4%, 94% 96%, 0 100%);
  transform: translate3d(var(--album-shift-x), var(--album-shift-y), 0) rotateX(var(--album-tilt-x))
    rotateY(var(--album-tilt-y));
  transform-origin: left center;
  box-shadow: 10px 12px 24px rgba(0, 0, 0, 0.18);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.album-card--perspective .album-card-artwork:hover {
  transition-duration: 60ms;
}

.album-card--perspective .album-card-artwork img {
  transform: scale(1.015);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.album-card--perspective .album-card-artwork:hover img {
  transform: scale(1.04);
}

.album-card--perspective .album-card-artwork::before {
  position: absolute;
  z-index: 1;
  inset: 0;
  background: radial-gradient(
    circle at var(--album-glint-x) var(--album-glint-y),
    rgba(255, 255, 255, 0.2),
    transparent 42%
  );
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.album-card--perspective .album-card-artwork:hover::before {
  opacity: 1;
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
