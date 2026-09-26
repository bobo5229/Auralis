<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ListeningRankingItem, ListeningRankingTarget } from '@shared/types/archive'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { formatArchiveMinutes } from '../utils/archiveDailyDetailState'
import { animateRankingRecord } from '@renderer/shared/animation/motion'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { resolvePlayerPrimaryButtonTextColor } from '@renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor'

const props = defineProps<{ items: ListeningRankingItem[]; target: ListeningRankingTarget }>()
const items = computed(() => props.items.slice(0, 10))
const spinePalettes = Array.from({ length: 10 }, (_, index) =>
  useArtworkPalette(computed(() => items.value[index]?.artworkCacheKey ?? null)),
)
const spineStyles = computed(() =>
  spinePalettes.map(({ palette }) => {
    const color = palette.value.dominant ?? { r: 41, g: 45, b: 50 }
    return {
      backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`,
      color: resolvePlayerPrimaryButtonTextColor(color),
    }
  }),
)
const viewport = ref<HTMLElement | null>(null)
const shelf = ref<HTMLElement | null>(null)
const rack = ref<HTMLElement | null>(null)
const selected = ref(0)
const hovered = ref<number | null>(null)
const focused = ref<number | null>(null)
const active = computed(() => hovered.value ?? focused.value)
const current = computed(() => items.value[selected.value] ?? items.value[0])
const failedImages = ref(new Set<string>())
const controls = new Map<HTMLElement, ReturnType<typeof animateRankingRecord>>()
let observer: ResizeObserver | undefined
let reducedMotion: MediaQueryList | undefined
let disposed = false

function title(item: ListeningRankingItem): string {
  return item.title || (props.target === 'album' ? '未知专辑' : '未知歌曲')
}
function artist(item: ListeningRankingItem): string {
  return formatArtist(item.artist) || '未知艺术家'
}
function paint(): void {
  rack.value?.querySelectorAll<HTMLElement>('.record').forEach((record, index) => {
    controls.get(record)?.stop()
    controls.set(
      record,
      animateRankingRecord(record, index === active.value, reducedMotion?.matches ?? false),
    )
  })
}
watch(
  active,
  (index) => {
    if (index !== null) selected.value = index
    paint()
  },
  { flush: 'post' },
)

// Measure a copy so hover never changes the shelf's scale or resting center.
function measureSpacing(): void {
  const first = rack.value?.querySelector<HTMLElement>('.slot')
  if (!first || !rack.value || !viewport.value) return
  rack.value.style.transform = 'none'
  const probe = first.cloneNode(true) as HTMLElement
  probe.classList.remove('active')
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none'
  probe.tabIndex = -1
  probe.setAttribute('aria-hidden', 'true')
  const record = probe.querySelector<HTMLElement>('.record')!
  record.style.transform = 'rotateY(-50deg)'
  rack.value.append(probe)
  for (let pass = 0; pass < 3; pass++) {
    const width = probe.querySelector<HTMLElement>('.face')!.getBoundingClientRect().width
    viewport.value.style.setProperty('--step', `${width * 0.9}px`)
  }
  const measureBounds = (): { left: number; right: number; top: number } => {
    const origin = probe.getBoundingClientRect()
    const surfaces = Array.from(
      probe.querySelectorAll<HTMLElement>('.face, .spine, .top-edge, .back'),
      (surface) => surface.getBoundingClientRect(),
    )
    return {
      left: Math.min(...surfaces.map((surface) => surface.left)) - origin.left,
      right: Math.max(...surfaces.map((surface) => surface.right)) - origin.left,
      top: Math.min(...surfaces.map((surface) => surface.top)) - origin.top,
    }
  }
  const resting = measureBounds()
  const step = probe.getBoundingClientRect().width
  record.style.transform = 'translateY(-28px) translateZ(90px) rotateY(-18deg)'
  const pulled = measureBounds()
  probe.remove()

  const groupLeft = first.offsetLeft + resting.left
  const groupWidth = step * (items.value.length - 1) + resting.right - resting.left
  // Reserve equal room on both sides for the first/last cover to pull out.
  const clearance = Math.max(0, resting.left - pulled.left, pulled.right - resting.right) + 16
  const availableWidth = viewport.value.clientWidth
  const scale = Math.min(1, availableWidth / (groupWidth + clearance * 2))
  const offset = (availableWidth - groupWidth * scale) / 2 - groupLeft * scale
  rack.value.style.transform = `translateX(${offset}px) scale(${scale})`
  viewport.value.style.height = `${rack.value.offsetHeight * scale}px`
  // Keep the 40px controls 16px above the highest cover, including its pulled pose.
  const navigationTop = Math.max(
    0,
    (first.offsetTop + Math.min(resting.top, pulled.top)) * scale - 16,
  )
  shelf.value?.style.setProperty('--navigation-top', `${navigationTop}px`)
  shelf.value?.style.setProperty(
    '--navigation-right',
    `${(availableWidth - groupWidth * scale) / 2}px`,
  )
}
function navigate(index: number): void {
  const count = items.value.length
  if (count === 0) return
  const bounded = ((index % count) + count) % count
  hovered.value = null
  focused.value = bounded
  selected.value = bounded
  const button = rack.value?.querySelectorAll<HTMLButtonElement>('.slot')[bounded]
  button?.focus({ preventScroll: true })
}
function keydown(event: KeyboardEvent, index: number): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    navigate(index + (event.key === 'ArrowRight' ? 1 : -1))
  } else if (event.key === 'Escape') {
    hovered.value = null
    focused.value = null
    ;(event.currentTarget as HTMLElement).blur()
  }
}
watch(
  () => props.items,
  async (_nextItems, previousItems) => {
    const selectedKey = previousItems[selected.value]?.key
    const nextSelected = items.value.findIndex((item) => item.key === selectedKey)
    controls.forEach((control) => control.cancel())
    controls.clear()
    hovered.value = focused.value = null
    selected.value = nextSelected >= 0 ? nextSelected : 0
    failedImages.value = new Set()
    await nextTick()
    if (disposed) return
    viewport.value?.scrollTo({ left: 0 })
    measureSpacing()
  },
)
onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.addEventListener('change', paint)
  let previousWidth = -1
  observer = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === previousWidth) return
    previousWidth = entry.contentRect.width
    measureSpacing()
  })
  if (viewport.value) observer.observe(viewport.value)
  measureSpacing()
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  reducedMotion?.removeEventListener('change', paint)
  controls.forEach((control) => control.cancel())
})
</script>

<template>
  <div ref="shelf" class="ranking-shelf">
    <div class="shelf-navigation">
      <button
        type="button"
        aria-label="上一张"
        :disabled="items.length < 2"
        @click="navigate(selected - 1)"
      >
        <span class="i-lucide-chevron-left" />
      </button>
      <button
        type="button"
        aria-label="下一张"
        :disabled="items.length < 2"
        @click="navigate(selected + 1)"
      >
        <span class="i-lucide-chevron-right" />
      </button>
    </div>
    <div ref="viewport" class="shelf-viewport" role="region" aria-label="听歌排行唱片架">
      <div ref="rack" class="rack" :class="{ 'has-active': active !== null }">
        <button
          v-for="(item, index) in items"
          :key="item.key"
          type="button"
          class="slot"
          :class="{ active: active === index }"
          :style="{ zIndex: active === index ? items.length + 1 : items.length - index }"
          :aria-label="`第 ${index + 1} 名，${artist(item)} - ${title(item)}`"
          @pointerenter="
            (event) => {
              if (event.pointerType === 'mouse') {
                focused = null
                hovered = index
              }
            }
          "
          @pointerleave="hovered = null"
          @pointerdown="focused = null"
          @focus="
            (event) => {
              if ((event.target as HTMLElement).matches(':focus-visible')) focused = index
            }
          "
          @blur="focused = null"
          @click="
            (event) => {
              selected = index
              if (event.detail > 0) focused = null
            }
          "
          @keydown="keydown($event, index)"
        >
          <span class="record">
            <span class="back" />
            <span class="spine" :style="spineStyles[index]"
              ><span class="spine-label">{{ artist(item) }} - {{ title(item) }}</span></span
            >
            <span class="top-edge" />
            <span class="face">
              <img
                v-if="getArtworkUrl(item.artworkCacheKey) && !failedImages.has(item.key)"
                :src="getArtworkUrl(item.artworkCacheKey)!"
                alt=""
                loading="lazy"
                decoding="async"
                draggable="false"
                @error="failedImages.add(item.key)"
              />
              <span v-else class="cover-placeholder"><span class="i-lucide-disc-3" /></span>
            </span>
          </span>
          <span class="rank">{{ String(index + 1).padStart(2, '0') }}</span>
        </button>
      </div>
    </div>
    <div v-if="current" class="shelf-info" aria-live="polite">
      <div class="shelf-copy">
        <h3>{{ title(current) }}</h3>
        <p>{{ artist(current) }} · 第 {{ selected + 1 }} 名</p>
      </div>
      <div class="shelf-metrics">
        <div>
          <strong>{{ current.playCount }} 次</strong><span>播放次数</span>
        </div>
        <div>
          <strong>{{ formatArchiveMinutes(current.durationSeconds) }}</strong
          ><span>收听时长</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-shelf {
  min-width: 0;
  position: relative;
  padding-top: 40px;
}
.shelf-navigation {
  position: absolute;
  top: var(--navigation-top, 0px);
  right: var(--navigation-right, 0px);
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 0;
}
.shelf-navigation button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 40px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  color: var(--auralis-text);
  font-size: 16px;
  cursor: pointer;
}
.shelf-navigation button:hover:not(:disabled) {
  color: var(--auralis-text-muted);
}
.shelf-navigation button:disabled {
  opacity: 0.3;
  cursor: default;
}
.shelf-navigation button:focus-visible,
.slot:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 4px;
}
.shelf-viewport {
  --size: 250px;
  --step: 155px;
  overflow: clip;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-scrollbar-thumb, #42464e) transparent;
  overscroll-behavior-x: contain;
}
.rack {
  transform-origin: left top;
  position: relative;
  display: flex;
  width: max-content;
  padding: 100px 0 50px;
  isolation: isolate;
}
.slot {
  width: var(--step);
  height: 330px;
  position: relative;
  flex-shrink: 0;
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
  color: inherit;
  perspective: 1100px;
  pointer-events: none;
  cursor: pointer;
}
.face,
.spine,
.top-edge,
.back {
  pointer-events: auto;
}
.record {
  position: absolute;
  top: 20px;
  left: 0;
  width: var(--size);
  height: var(--size);
  transform-style: preserve-3d;
  transform-origin: 32% 65%;
  transform: translateY(0px) translateZ(0px) rotateY(-50deg);
  pointer-events: none;
}
.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  transform: translateZ(5px);
  border-radius: 3px;
  overflow: hidden;
  background: #292d32;
  box-shadow: 0 24px 32px #0007;
}
.face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.face::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, #ffffff1a, transparent 25%, #0002 85%);
  box-shadow:
    inset 1px 0 #ffffff50,
    inset -2px 0 #0006;
}
.spine {
  position: absolute;
  top: 0;
  left: 100%;
  width: 26px;
  height: 100%;
  transform-origin: left;
  transform: translateZ(5px) rotateY(90deg);
  background: #292d32;
  color: #f3eee6;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 1px 0 #ffffff30,
    inset -1px 0 #0008;
}
.spine-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: calc(100% - 24px);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.top-edge {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 26px;
  background: #c5c3bf;
  transform-origin: top;
  transform: translateZ(5px) rotateX(-90deg);
}
.back {
  position: absolute;
  inset: 0;
  background: #292c31;
  transform: translateZ(-21px);
  border-radius: 3px;
}
.rank {
  position: absolute;
  bottom: 12px;
  left: 14px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--auralis-text-subtle);
}
.active .rank {
  color: var(--auralis-text);
}
.has-active .slot:not(.active) .face,
.has-active .slot:not(.active) .spine-label,
.has-active .slot:not(.active) .rank {
  filter: blur(3px);
}
.cover-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: var(--auralis-surface-raised);
  color: var(--auralis-text-muted);
  font-size: 64px;
}
.shelf-info {
  padding: 22px 0 12px;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  min-height: 110px;
}
.shelf-copy {
  min-width: 0;
  flex: 1;
}
.shelf-copy h3 {
  margin: 0 0 9px;
  font-size: 24px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  color: var(--auralis-text);
}
.shelf-copy p {
  margin: 0;
  color: var(--auralis-text-muted);
}
.shelf-metrics {
  display: flex;
  gap: 32px;
  align-items: center;
}
.shelf-metrics strong {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.shelf-metrics span {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  color: var(--auralis-text-subtle);
}
@media (max-width: 900px) {
  .shelf-viewport {
    --size: 220px;
  }
  .slot {
    height: 295px;
  }
  .shelf-info {
    flex-direction: column;
  }
}
</style>
