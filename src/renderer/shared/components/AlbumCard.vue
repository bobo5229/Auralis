<script setup lang="ts">
import { resolveIndexArtist } from '@shared/utils/artistIndex'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'
import {
  prefetchArtworkPalette,
  useArtworkPalette,
} from '@renderer/shared/artwork/useArtworkPalette'
import { resolveArtworkButtonTextColor } from '@renderer/shared/color/resolveArtworkButtonTextColor'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { AlbumSummary } from '@shared/types/albumSummary'

const props = defineProps<{
  album: AlbumSummary
  highlighted?: boolean
  highlightRevision?: number
}>()

const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const displayAlbumTitle = computed(() =>
  props.album.title === 'Unknown Album' ? t('library.missing.album') : songText(props.album.title),
)
const indexArtist = computed(
  () =>
    props.album.indexArtist ??
    (resolveIndexArtist(props.album.albumArtist, props.album.tracks[0]?.artist) ||
      'Unknown Artist'),
)
const displayAlbumArtist = computed(() =>
  indexArtist.value === 'Unknown Artist'
    ? t('library.missing.artist')
    : songValues(indexArtist.value),
)
const artworkCacheKey = computed(() => props.album.artworkCacheKey)
const { palette } = useArtworkPalette(artworkCacheKey)
const playButtonStyle = computed(() => {
  const color =
    palette.value.quality !== 'fallback' && palette.value.key === artworkCacheKey.value
      ? (palette.value.dominant ?? palette.value.accents[0]?.rgb)
      : null
  if (!color) return undefined
  const foreground = resolveArtworkButtonTextColor(color)
  return {
    '--album-card-play-fg': foreground,
    '--album-card-play-outline': foreground === '#ffffff' ? '#1f1f1f' : '#ffffff',
  }
})

const emit = defineEmits<{
  open: [album: AlbumSummary]
  play: [album: AlbumSummary]
  openContextMenu: [album: AlbumSummary, event: MouseEvent]
}>()

const imageFailed = ref(false)
const cardRootRef = ref<HTMLElement | null>(null)
const coverRef = ref<HTMLElement | null>(null)
const playIconRef = ref<SVGSVGElement | null>(null)
let searchHighlightAnimation: Animation | null = null
let playIconAnimation: Animation | null = null
let visibilityObserver: IntersectionObserver | null = null

function cancelSearchHighlight(): void {
  searchHighlightAnimation?.cancel()
  searchHighlightAnimation = null
}

function updateSearchHighlight(): void {
  cancelSearchHighlight()
  const cover = coverRef.value
  if (!props.highlighted || !cover?.animate) return
  const tint =
    '0 0 0 2px color-mix(in srgb, var(--auralis-theme-accent) 45%, transparent), ' +
    '0 4px 12px color-mix(in srgb, var(--auralis-theme-accent) 8%, transparent)'
  const clear = '0 0 0 2px transparent, 0 4px 12px transparent'
  const frames: Keyframe[] = createReducedMotionQuery().matches
    ? [{ boxShadow: tint }, { boxShadow: tint }]
    : [
        { boxShadow: clear, offset: 0, easing: 'ease-out' },
        { boxShadow: tint, offset: 0.125 },
        { boxShadow: tint, offset: 0.3125, easing: 'ease-out' },
        { boxShadow: clear, offset: 1 },
      ]
  const animation = cover.animate(frames, { duration: 800, composite: 'add' })
  searchHighlightAnimation = animation
  animation.onfinish = () => {
    if (searchHighlightAnimation === animation) searchHighlightAnimation = null
  }
}

watch(
  [() => props.album.key, () => props.highlighted, () => props.highlightRevision],
  updateSearchHighlight,
  { flush: 'post' },
)

function cancelPlayIconAnimation(): void {
  playIconAnimation?.cancel()
  playIconAnimation = null
}

function playAlbum(): void {
  emit('play', props.album)
  cancelPlayIconAnimation()
  const icon = playIconRef.value
  if (!icon?.animate || createReducedMotionQuery().matches) return

  // 保留原有 1px 光学居中，只移动图标；再次点击从原位重新起跳。
  const animation = icon.animate(
    [
      { transform: 'translate(1px, 0)', offset: 0, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      { transform: 'translate(1px, -4px)', offset: 0.4, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
      { transform: 'translate(1px, 0.6px)', offset: 0.82, easing: 'ease-out' },
      { transform: 'translate(1px, 0)', offset: 1 },
    ],
    { duration: 260 },
  )
  playIconAnimation = animation
  animation.onfinish = () => {
    if (playIconAnimation === animation) playIconAnimation = null
  }
}

watch(() => props.album.key, cancelPlayIconAnimation)

function prefetchCoverPalette(): void {
  prefetchArtworkPalette(props.album.artworkCacheKey)
}

watch(
  () => props.album.artworkCacheKey,
  () => {
    imageFailed.value = false
    prefetchCoverPalette()
  },
)

onMounted(() => {
  updateSearchHighlight()
  const card = cardRootRef.value
  if (card && typeof IntersectionObserver !== 'undefined') {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) prefetchCoverPalette()
      },
      { rootMargin: '120px', threshold: 0.01 },
    )
    visibilityObserver.observe(card)
  } else {
    prefetchCoverPalette()
  }
})

onBeforeUnmount(() => {
  cancelSearchHighlight()
  cancelPlayIconAnimation()
  visibilityObserver?.disconnect()
  visibilityObserver = null
})

function openAlbum(): void {
  emit('open', props.album)
}

function onCoverKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  if (event.repeat) return
  emit('open', props.album)
}

function onContextMenu(event: MouseEvent): void {
  emit('openContextMenu', props.album, event)
}
</script>

<template>
  <article ref="cardRootRef" class="album-card min-w-0" @pointerenter="prefetchCoverPalette">
    <div class="album-card-cover">
      <!-- cover-stage 锁定 1:1；img 绝对填充并通过 object-fit:cover 裁切 -->
      <div
        ref="coverRef"
        class="cover-stage"
        role="button"
        tabindex="0"
        :aria-label="t('albums.a11y.openAlbum', { title: displayAlbumTitle })"
        @dragstart.prevent
        @click="openAlbum"
        @contextmenu.prevent="onContextMenu"
        @keydown="onCoverKeydown"
      >
        <div class="cover-frame">
          <img
            v-if="album.artworkCacheKey && !imageFailed"
            :src="getArtworkUrl(album.artworkCacheKey) ?? undefined"
            :alt="t('albums.a11y.coverAlt', { title: displayAlbumTitle })"
            class="cover-img"
            loading="lazy"
            decoding="auto"
            draggable="false"
            @error="imageFailed = true"
          />
          <div v-else class="cover-img cover-img--placeholder" aria-hidden="true">
            <span class="i-lucide-disc-3 h-10 w-10"></span>
          </div>
        </div>
      </div>
      <div class="album-card-play-clip">
        <button
          type="button"
          class="album-card-play"
          :style="playButtonStyle"
          :aria-label="t('albums.contextMenu.play', { title: displayAlbumTitle })"
          @click="playAlbum"
          @contextmenu.prevent="onContextMenu"
        >
          <svg ref="playIconRef" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <!-- M6 起笔：bbox 中心落在 viewBox 中线；原先 M8 会让三角在 48px 圆里偏右约 2.4px -->
            <path
              d="M6 5.5c0-.9 1-1.5 1.8-1l10 6.5a1.2 1.2 0 0 1 0 2l-10 6.5c-.8.5-1.8-.1-1.8-1V5.5Z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="album-card-meta">
      <h2 v-tooltip.overflow="displayAlbumTitle" class="album-card-title">
        {{ displayAlbumTitle }}
      </h2>
      <p v-tooltip.overflow="displayAlbumArtist" class="album-card-artist">
        {{ displayAlbumArtist }}
      </p>
      <div class="album-card-index-line">
        <span class="album-card-year">
          <template v-if="album.releaseDate">
            {{ t('albums.year', { year: album.releaseDate.slice(0, 4) }) }}
          </template>
          <template v-else>&nbsp;</template>
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
:global(:root) {
  /* Album-list cover geometry; root scope also reaches inert layout-transition clones. */
  --album-list-cover-radius: var(--auralis-artwork-radius-card);
}

.album-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.album-card-cover {
  position: relative;
}

.album-card-play-clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--album-list-cover-radius);
  pointer-events: none;
}

.album-card-play {
  position: absolute;
  z-index: 1;
  bottom: 8px;
  left: 8px;
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--album-card-play-fg, #ffffff);
  opacity: 0;
  pointer-events: none;
  transform: translateY(18px);
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  cursor: pointer;
}

.album-card-play svg {
  display: block;
  width: 26px;
  height: 26px;
  stroke: var(--album-card-play-outline, #1f1f1f);
  stroke-width: 1.2;
  stroke-linejoin: round;
  paint-order: stroke fill;
  /* 右向三角视觉质量偏左，相对几何中心右移 1px */
  transform: translateX(1px);
}

.album-card-cover:is(:hover, :has(:focus-visible)) .album-card-play {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.album-card-play:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}

/* ── 常规网格：舞台强制 1:1，图片 cover 裁切 ───────────── */
.cover-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  flex-shrink: 0;
  border-radius: var(--album-list-cover-radius);
  overflow: visible;
  background: transparent;
  cursor: pointer;
  outline: none;
  touch-action: pan-y;
  user-select: none;
  -webkit-touch-callout: none;
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
  box-shadow: var(--auralis-surface-shadow, 0 10px 24px rgba(0, 0, 0, 0.28));
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
  flex-direction: column;
  gap: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-disabled);
  background: var(--auralis-artwork-placeholder-bg);
}

.album-card-missing-artwork {
  font-size: 11px;
}

/* 元信息统一高度随排版参数扩展；单行省略保持同一网格内的卡片几何一致。 */
.album-card-meta {
  display: flex;
  flex-direction: column;
  gap: var(--album-list-text-gap, 3px);
  height: var(--album-list-meta-height, 58px);
  margin-top: var(--album-list-meta-gap, 12px);
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
}

.album-card-index-line {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.album-card-catalog-number {
  min-width: 0;
  overflow: hidden;
  color: var(--auralis-text-faint);
  font-size: 10px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-card-title {
  font-size: var(--album-list-type-title-size);
  font-weight: var(--album-list-type-title-weight);
  line-height: var(--album-list-type-title-line-height);
  color: var(--auralis-text);
}

.album-card-artist {
  font-size: var(--album-list-type-artist-size);
  font-weight: var(--album-list-type-artist-weight);
  line-height: var(--album-list-type-artist-line-height);
  color: var(--auralis-text-muted);
}

.album-card-year {
  font-size: var(--album-list-type-year-size);
  font-weight: var(--album-list-type-year-weight);
  line-height: var(--album-list-type-year-line-height);
  color: var(--auralis-text-faint);
  /* 无发行年时仍占一行，避免行高参差 */
  min-height: 1.25em;
}

:where([data-reduced-motion='true']) .album-card-play {
  transition: none;
}

</style>
