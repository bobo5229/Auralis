<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import {
  prefetchArtworkPalette,
  useArtworkPalette,
} from '@renderer/features/playback/composables/useArtworkPalette'
import { resolvePlayerPrimaryButtonTextColor } from '@renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { AlbumSummary } from '../types'
import { useAlbumCoverLongPress } from '../composables/useAlbumCoverLongPress'

const props = defineProps<{
  album: AlbumSummary
  highlighted?: boolean
  longPressEnabled?: boolean
  artworkUrl?: string
}>()

const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const displayAlbumTitle = computed(() =>
  props.album.title === 'Unknown Album' ? t('library.unknownAlbum') : songText(props.album.title),
)
const displayAlbumArtist = computed(() =>
  props.album.albumArtist === 'Unknown Artist'
    ? t('library.unknownArtist')
    : songValues(props.album.albumArtist),
)
const artworkCacheKey = computed(() => props.album.artworkCacheKey)
const artworkUrl = computed(() => props.artworkUrl ?? getArtworkUrl(props.album.artworkCacheKey))
const { palette } = useArtworkPalette(artworkCacheKey)
const playButtonStyle = computed(() => {
  const color =
    palette.value.quality !== 'fallback' && palette.value.key === artworkCacheKey.value
      ? (palette.value.dominant ?? palette.value.accents[0]?.rgb)
      : null
  if (!color) return undefined
  return {
    '--album-card-play-bg': `rgb(${color.r} ${color.g} ${color.b})`,
    '--album-card-play-fg': resolvePlayerPrimaryButtonTextColor(color),
  }
})

const emit = defineEmits<{
  open: [album: AlbumSummary]
  play: [album: AlbumSummary]
  openContextMenu: [album: AlbumSummary, event: MouseEvent]
  longPress: [album: AlbumSummary, cover: HTMLElement]
}>()

const longPress = useAlbumCoverLongPress(
  computed(() => Boolean(props.longPressEnabled)),
  (cover) => emit('longPress', props.album, cover),
)
const { holding } = longPress
watch(() => props.album.key, longPress.cancel)

const imageFailed = ref(false)
const cardRootRef = ref<HTMLElement | null>(null)
const playIconRef = ref<SVGSVGElement | null>(null)
let playIconAnimation: Animation | null = null
let visibilityObserver: IntersectionObserver | null = null

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
  cancelPlayIconAnimation()
  visibilityObserver?.disconnect()
  visibilityObserver = null
})

function openAlbum(event?: MouseEvent): void {
  if (longPress.consumeClick(event)) return
  emit('open', props.album)
}

function onCoverKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  if (event.repeat) return
  longPress.cancel()
  if (event.key === 'Enter' && event.shiftKey && props.longPressEnabled) {
    emit('longPress', props.album, event.currentTarget as HTMLElement)
  } else emit('open', props.album)
}

function onContextMenu(event: MouseEvent): void {
  longPress.cancel()
  const isCover = (event.currentTarget as HTMLElement | null)?.classList?.contains('cover-stage')
  if (isCover && longPress.consumeClick(event)) return
  emit('openContextMenu', props.album, event)
}
</script>

<template>
  <article
    ref="cardRootRef"
    class="album-card min-w-0"
    :class="{ 'album-card--highlighted': highlighted }"
    @pointerenter="prefetchCoverPalette"
  >
    <div class="album-card-cover">
      <!-- cover-stage 锁定 1:1；img 绝对填充并通过 object-fit:cover 裁切 -->
      <div
        class="cover-stage"
        :class="{ 'cover-stage--holding': holding }"
        role="button"
        tabindex="0"
        :aria-label="t('albums.a11y.openAlbum', { title: displayAlbumTitle })"
        :aria-description="longPressEnabled ? t('albums.a11y.longPressPlay') : undefined"
        @pointerdown="longPress.start"
        @dragstart.prevent
        @click="openAlbum"
        @contextmenu.prevent="onContextMenu"
        @keydown="onCoverKeydown"
      >
        <div class="cover-frame">
          <img
            v-if="artworkUrl && !imageFailed"
            :src="artworkUrl"
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
      <h2 class="album-card-title">{{ displayAlbumTitle }}</h2>
      <p class="album-card-artist">{{ displayAlbumArtist }}</p>
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
  --album-list-cover-radius: 12px;
  --album-list-cover-hold-outset: 3px;
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
  background-color: color-mix(
    in srgb,
    var(--album-card-play-bg, var(--auralis-control-primary-bg)) 80%,
    transparent
  );
  backdrop-filter: blur(14px) saturate(1.3);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  color: var(--album-card-play-fg, var(--auralis-control-primary-text));
  opacity: 0;
  pointer-events: none;
  transform: translateY(18px);
  transition:
    background-color 180ms ease-out,
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  cursor: pointer;
}

.album-card-play svg {
  display: block;
  width: 26px;
  height: 26px;
  /* 右向三角视觉质量偏左，相对几何中心右移 1px */
  transform: translateX(1px);
}

.album-card-cover:is(:hover, :has(:focus-visible)) .album-card-play {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.album-card-play:is(:hover, :focus-visible) {
  background-color: color-mix(
    in srgb,
    color-mix(in srgb, var(--album-card-play-bg, var(--auralis-control-primary-bg)) 88%, white) 92%,
    transparent
  );
}

.album-card-play:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
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
  border-radius: var(--album-list-cover-radius);
  overflow: visible;
  background: transparent;
  cursor: pointer;
  outline: none;
  touch-action: pan-y;
  user-select: none;
  -webkit-touch-callout: none;
}

.cover-stage--holding::after {
  position: absolute;
  inset: calc(0px - var(--album-list-cover-hold-outset));
  border: 2px solid var(--auralis-focus-ring);
  border-radius: calc(var(--album-list-cover-radius) + var(--album-list-cover-hold-outset));
  pointer-events: none;
  content: '';
  animation: album-cover-hold 500ms ease-out forwards;
}

@keyframes album-cover-hold {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.8;
  }
}

:where([data-reduced-motion='true']) .cover-stage--holding::after {
  animation: none;
  opacity: 0.6;
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

.cover-frame::after {
  position: absolute;
  z-index: 1;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.28), transparent 58%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease-out;
  content: '';
}

.album-card-cover:is(:hover, :has(:focus-visible)) .cover-frame::after {
  opacity: 1;
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

:where([data-reduced-motion='true']) .cover-frame::after {
  transition: none;
}
</style>
