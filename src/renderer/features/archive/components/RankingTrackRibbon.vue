<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ListeningRankingItem } from '@shared/types/archive'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { animateRankingRibbon } from '@renderer/shared/animation/motion'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'

const props = defineProps<{
  item: ListeningRankingItem
  index: number
  expanded: boolean
  playing: boolean
  busy: boolean
}>()
defineEmits<{ inspect: []; play: [] }>()
const root = ref<HTMLElement | null>(null)
const failed = ref(false)
const { palette } = useArtworkPalette(computed(() => props.item.artworkCacheKey))
const tint = computed(() => {
  const color = palette.value.dominant ?? palette.value.background
  return `rgb(${color.r}, ${color.g}, ${color.b})`
})
const name = computed(() => props.item.title || '未知歌曲')
let stop: (() => void) | undefined
let reduced: MediaQueryList | undefined
function update(): void {
  stop?.()
  if (root.value) stop = animateRankingRibbon(root.value, props.expanded, reduced?.matches ?? false)
}
watch(() => props.expanded, update)
watch(
  () => props.item.artworkCacheKey,
  () => {
    failed.value = false
  },
)
onMounted(() => {
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.addEventListener('change', update)
  update()
})
onBeforeUnmount(() => {
  stop?.()
  reduced?.removeEventListener('change', update)
})
</script>

<template>
  <li
    ref="root"
    class="ribbon"
    :class="{ open: expanded, playing }"
    :style="{ '--tint': tint }"
    :data-index="index"
  >
    <button
      class="inspect"
      :aria-label="`展开 ${name}`"
      :aria-expanded="expanded"
      @click="$emit('inspect')"
    >
      <span class="rank">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="art">
        <img
          v-if="getArtworkUrl(item.artworkCacheKey) && !failed"
          :src="getArtworkUrl(item.artworkCacheKey)!"
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          @error="failed = true"
        />
        <span v-else class="i-lucide-music-2" />
      </span>
      <span class="copy">
        <span class="name">{{ name }}</span>
        <span class="artist">{{ formatArtist(item.artist) || '未知艺术家' }}</span>
        <span class="details" :aria-hidden="!expanded"
          >{{ item.playCount }} 次播放 · 收听 {{ formatArchiveMinutes(item.durationSeconds) }}</span
        >
      </span>
      <span class="count">{{ item.playCount }}<small>次</small></span>
    </button>
    <button
      class="play"
      :aria-label="`${playing ? '暂停' : '播放'} ${name}`"
      :aria-pressed="playing"
      :disabled="busy"
      @click="$emit('play')"
    >
      <svg v-if="playing" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="5" height="16" rx="1" />
        <rect x="14" y="4" width="5" height="16" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 4.7c0-1 1.1-1.6 1.9-1.1l12 7.3a1.3 1.3 0 0 1 0 2.2l-12 7.3A1.3 1.3 0 0 1 6 19.3Z"
        />
      </svg>
    </button>
  </li>
</template>

<style scoped>
.ribbon {
  --reveal: 0;
  --cover-open: 164px;
  --height-open: 208px;
  --title-open: 26px;
  position: relative;
  height: calc(76px + (var(--height-open) - 76px) * var(--reveal));
  border-bottom: 1px solid var(--auralis-border-subtle);
  isolation: isolate;
}
.ribbon::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(90deg, transparent, var(--tint), transparent);
  opacity: calc(var(--reveal) * 0.11);
}
button {
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -3px;
}
.inspect {
  --cover-width: calc(52px + (var(--cover-open) - 52px) * var(--reveal));
  display: grid;
  grid-template-columns: 34px var(--cover-width) minmax(0, 1fr) 74px;
  gap: 22px;
  align-items: center;
  width: calc(100% - 72px);
  height: 100%;
  text-align: left;
  padding: 0 16px;
}
.rank {
  color: var(--auralis-text-subtle);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.ribbon:nth-child(-n + 3) .rank {
  color: var(--auralis-text);
}
.art {
  width: var(--cover-width);
  height: var(--cover-width);
  overflow: hidden;
  border-radius: 3px;
  background: var(--auralis-surface-raised);
  display: grid;
  place-items: center;
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.copy {
  min-width: 0;
}
.name {
  display: block;
  font-size: calc(16px + (var(--title-open) - 16px) * var(--reveal));
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist {
  display: block;
  color: var(--auralis-text-muted);
  font-size: 12px;
  margin-top: 5px;
}
.details {
  display: block;
  height: calc(42px * var(--reveal));
  padding-top: calc(20px * var(--reveal));
  overflow: hidden;
  opacity: var(--reveal);
  color: var(--auralis-text-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.count {
  text-align: right;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
.count small {
  display: block;
  font-size: 11px;
  color: var(--auralis-text-subtle);
  margin-top: 4px;
}
.play {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  opacity: var(--reveal);
}
.playing .play,
.play:focus-visible {
  opacity: 1;
}
.play:hover {
  color: var(--auralis-text-muted);
}
.play:disabled {
  cursor: wait;
}
.play svg {
  width: 22px;
  height: 22px;
  fill: currentColor;
}
.playing::after {
  content: '';
  position: absolute;
  left: 0;
  top: calc(50% - 7px);
  width: 2px;
  height: 14px;
  background: var(--auralis-text);
}
@media (max-width: 900px) {
  .ribbon {
    --cover-open: 90px;
    --height-open: 164px;
    --title-open: 19px;
  }
  .inspect {
    --cover-width: calc(40px + 50px * var(--reveal));
    grid-template-columns: 24px var(--cover-width) minmax(0, 1fr);
    gap: 12px;
    padding-inline: 8px;
    width: calc(100% - 48px);
  }
  .count {
    display: none;
  }
  .play {
    right: 2px;
  }
}
@media (hover: none) {
  .play {
    opacity: 1;
  }
}
</style>
