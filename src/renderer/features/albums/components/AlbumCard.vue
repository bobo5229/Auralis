<script setup lang="ts">
import { ref, watch } from 'vue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
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

function openAlbum(): void {
  emit('open', props.album)
}

function onContextMenu(event: MouseEvent): void {
  emit('openContextMenu', props.album, event)
}
</script>

<template>
  <article
    class="album-card min-w-0"
    :class="[`album-card--${displayMode}`, { 'album-card--highlighted': highlighted }]"
  >
    <!-- cover-stage 锁定 1:1；cover-frame 承载 3D；img 绝对填充 + object-fit:cover 强制裁切 -->
    <div
      class="cover-stage"
      role="button"
      tabindex="0"
      :aria-label="`Open ${album.title}`"
      @click="openAlbum"
      @contextmenu.prevent="onContextMenu"
      @keydown.enter="openAlbum"
      @keydown.space.prevent="openAlbum"
    >
      <div class="cover-frame">
        <img
          v-if="getArtworkUrl(album.artworkCacheKey) && !imageFailed"
          :src="getArtworkUrl(album.artworkCacheKey)!"
          :alt="`${album.title} cover`"
          class="cover-img"
          loading="lazy"
          decoding="async"
          draggable="false"
          @error="imageFailed = true"
        />
        <div v-else class="cover-img cover-img--placeholder" aria-hidden="true">
          <span class="i-lucide-disc-3 h-10 w-10"></span>
        </div>
      </div>
    </div>

    <div class="album-card-meta">
      <h2 class="album-card-title">{{ album.title }}</h2>
      <p class="album-card-artist">{{ formatArtist(album.albumArtist) }}</p>
      <p class="album-card-year">
        <template v-if="album.releaseDate">{{ album.releaseDate.slice(0, 4) }}年</template>
        <template v-else>&nbsp;</template>
      </p>
    </div>
  </article>
</template>

<style scoped>
.album-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.album-card--highlighted .cover-stage {
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

/* ── 常规网格：舞台强制 1:1，图片 cover 裁切 ───────────── */
.cover-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--auralis-artwork-placeholder-bg);
  cursor: pointer;
  outline: none;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}

.cover-stage:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 3px;
}

/* 正方形画框：绝对铺满舞台，避免非 1:1 原图撑破比例 */
.cover-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: var(--auralis-artwork-placeholder-bg);
}

.cover-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}

.cover-img--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-disabled);
  background: var(--auralis-artwork-placeholder-bg);
}

.album-card--grid .cover-img {
  transition: transform 0.35s ease;
}

.album-card--grid:hover .cover-img {
  transform: scale(1.04);
}

/* ── 3D 透视展台：倾斜正方形 frame，img 仍强制 1:1 cover ─ */
.album-card--perspective .cover-stage {
  overflow: visible;
  background: transparent;
  box-shadow: none;
  perspective: 800px;
}

.album-card--perspective .cover-frame {
  /* 等距内缩保持正方形，并为投影留边 */
  inset: 6%;
  border-radius: 10px;
  transform: rotateY(-18deg) rotateX(8deg) scale(0.92);
  transform-style: preserve-3d;
  box-shadow:
    -12px 16px 30px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.album-card--perspective:hover .cover-frame,
.album-card--perspective:focus-within .cover-frame {
  transform: rotateY(0deg) rotateX(0deg) scale(1);
}

/* ── 元信息：固定高度 + 单行省略，全场卡片物理高度一致 ─ */
.album-card-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  height: 58px;
  margin-top: 12px;
  min-width: 0;
  overflow: hidden;
}

.album-card-title,
.album-card-artist,
.album-card-year {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
}

.album-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--auralis-text);
}

.album-card-artist {
  font-size: 12px;
  color: var(--auralis-text-muted);
}

.album-card-year {
  font-size: 11px;
  color: var(--auralis-text-faint);
  /* 无发行年时仍占一行，避免行高参差 */
  min-height: 1.25em;
}

@media (prefers-reduced-motion: reduce) {
  .album-card--grid .cover-img,
  .album-card--perspective .cover-frame {
    transition: none !important;
    transform: none !important;
  }

  .album-card--grid:hover .cover-img,
  .album-card--perspective:hover .cover-frame,
  .album-card--perspective:focus-within .cover-frame {
    transform: none !important;
  }
}
</style>
