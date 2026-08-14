<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GenreSpectrumItem, ListeningGenreSpectrum } from '@shared/types/archive'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'

const props = defineProps<{
  data: ListeningGenreSpectrum | null
  loading?: boolean
}>()

/** SVG viewBox units (visual size is CSS-scaled). */
const RING_SIZE = 200
const RING_CENTER = RING_SIZE / 2
const RING_RADIUS = 72
const RING_STROKE = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
/** Visual gap between arc segments (in dash units). */
const SEGMENT_GAP = 4
/** Extra hit padding as fraction of wrap size (screen space). */
const HIT_PADDING_RATIO = 0.04
/** Default visible spectrum rows before expand. */
const SPECTRUM_DEFAULT_VISIBLE = 5

interface RingSegmentGeom {
  genre: string
  colorHex: string
  ratio: number
  start: number
  end: number
  dashArray: string
  dashOffset: number
  item: GenreSpectrumItem
}

const ringWrapRef = ref<HTMLElement | null>(null)
/** Click-selected genre: right panel shows Top3. */
const selectedGenre = ref<string | null>(null)
/** Hover preview genre: highlight only when nothing is selected. */
const hoveredGenre = ref<string | null>(null)
const spectrumExpanded = ref(false)

const items = computed(() => props.data?.items ?? [])

const topItem = computed(() => items.value[0] ?? null)

const hasData = computed(
  () => items.value.length > 0 && (props.data?.totalDurationSeconds ?? 0) > 0,
)

const ringSegments = computed((): RingSegmentGeom[] => {
  if (!hasData.value) return []

  const list = items.value
  const totalRatio = list.reduce((sum, item) => sum + item.ratio, 0) || 1
  const usable = Math.max(RING_CIRCUMFERENCE - SEGMENT_GAP * list.length, RING_CIRCUMFERENCE * 0.9)

  let offset = 0
  return list.map((item) => {
    const share = item.ratio / totalRatio
    const length = Math.max(share * usable, 2)
    const start = offset
    const end = offset + length
    const segment: RingSegmentGeom = {
      genre: item.genre,
      colorHex: item.colorHex,
      ratio: item.ratio,
      start,
      end,
      dashArray: `${length} ${RING_CIRCUMFERENCE - length}`,
      dashOffset: -start,
      item,
    }
    offset = end + SEGMENT_GAP
    return segment
  })
})

/** Ring visual focus: selected wins; hover only when not selected. */
const focusGenre = computed(() => selectedGenre.value ?? hoveredGenre.value)

const focusItem = computed(() => {
  if (!focusGenre.value) return null
  return items.value.find((item) => item.genre === focusGenre.value) ?? null
})

const selectedItem = computed(() => {
  if (!selectedGenre.value) return null
  return items.value.find((item) => item.genre === selectedGenre.value) ?? null
})

const centerItem = computed(() => focusItem.value ?? topItem.value)

const selectedTracks = computed(() => selectedItem.value?.topTracks ?? [])

const isDetailMode = computed(() => Boolean(selectedItem.value))

const canExpandSpectrum = computed(() => items.value.length > SPECTRUM_DEFAULT_VISIBLE)

const visibleSpectrumItems = computed(() => {
  if (spectrumExpanded.value || !canExpandSpectrum.value) return items.value
  return items.value.slice(0, SPECTRUM_DEFAULT_VISIBLE)
})

const hiddenSpectrumCount = computed(() =>
  Math.max(0, items.value.length - SPECTRUM_DEFAULT_VISIBLE),
)

const ringGlowColor = computed(() => focusItem.value?.colorHex ?? topItem.value?.colorHex ?? null)

watch(
  () => props.data?.year,
  () => {
    selectedGenre.value = null
    hoveredGenre.value = null
    spectrumExpanded.value = false
  },
)

watch(
  () => props.data,
  () => {
    if (!props.data) {
      selectedGenre.value = null
      hoveredGenre.value = null
      spectrumExpanded.value = false
    }
  },
)

function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 100)
  return `${pct}%`
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60))
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分`
}

function formatSpectrumIndex(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function barGradient(colorHex: string): string {
  return `linear-gradient(90deg, ${colorHex} 0%, color-mix(in srgb, ${colorHex} 50%, transparent) 100%)`
}

function segmentOpacity(genre: string): number {
  if (!focusGenre.value) return 1
  return genre === focusGenre.value ? 1 : 0.38
}

function segmentStrokeWidth(genre: string): number {
  if (focusGenre.value && genre === focusGenre.value) return RING_STROKE + 3
  return RING_STROKE
}

/**
 * Map pointer to circumference position (from 12 o'clock, clockwise).
 * Returns genre key or null when outside ring band / gap.
 */
function hitTestGenre(clientX: number, clientY: number): string | null {
  const wrap = ringWrapRef.value
  if (!wrap || ringSegments.value.length === 0) return null

  const rect = wrap.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const dist = Math.hypot(dx, dy)

  const scale = Math.min(rect.width, rect.height) / RING_SIZE
  const midR = RING_RADIUS * scale
  const halfStroke = (RING_STROKE / 2) * scale
  const pad = Math.min(rect.width, rect.height) * HIT_PADDING_RATIO
  const inner = midR - halfStroke - pad
  const outer = midR + halfStroke + pad
  if (dist < inner || dist > outer) return null

  const frac = ((Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
  const pos = frac * RING_CIRCUMFERENCE

  for (const seg of ringSegments.value) {
    if (pos >= seg.start && pos < seg.end) return seg.genre
  }
  return null
}

function handleRingPointerMove(event: PointerEvent): void {
  // Selected mode: other-sector hover has no effect at all.
  if (selectedGenre.value) return
  hoveredGenre.value = hitTestGenre(event.clientX, event.clientY)
}

function handleRingPointerLeave(): void {
  if (selectedGenre.value) return
  hoveredGenre.value = null
}

function handleRingClick(event: MouseEvent): void {
  const genre = hitTestGenre(event.clientX, event.clientY)
  if (!genre) return
  event.stopPropagation()

  if (selectedGenre.value === genre) {
    // Re-click same sector → exit detail.
    selectedGenre.value = null
    hoveredGenre.value = null
    return
  }

  // Enter or switch detail genre.
  selectedGenre.value = genre
  hoveredGenre.value = null
}

function clearSelection(): void {
  selectedGenre.value = null
  hoveredGenre.value = null
}

function handleStagePointerDown(event: PointerEvent): void {
  if (!selectedGenre.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-dna-keep-selection]')) return

  const wrap = ringWrapRef.value
  if (wrap?.contains(event.target as Node)) {
    // Ring area: let click handler decide (same/other sector).
    // If miss on ring band, treat as blank exit.
    const genre = hitTestGenre(event.clientX, event.clientY)
    if (genre) return
  }
  clearSelection()
}

function toggleSpectrumExpanded(): void {
  spectrumExpanded.value = !spectrumExpanded.value
}
</script>

<template>
  <section
    class="music-dna-stage"
    aria-label="Music DNA 音乐基因与风格图谱"
    @pointerdown="handleStagePointerDown"
  >
    <header class="music-dna-heading">
      <span class="music-dna-kicker">Music DNA</span>
      <h2>音乐基因</h2>
      <p>Genre &amp; Style Spectrum · 悬停高亮环段，点击查看该流派 Top 曲目</p>
    </header>

    <div v-if="loading" class="music-dna-state">正在解析风格图谱…</div>
    <div v-else-if="!hasData" class="music-dna-state">本年度暂无音乐基因数据</div>

    <div v-else class="music-dna-body">
      <div class="dna-platter-column">
        <div
          ref="ringWrapRef"
          class="dna-ring-wrap"
          :class="{ 'is-selected': Boolean(selectedGenre) }"
          :style="ringGlowColor ? { '--dna-glow': ringGlowColor } : undefined"
          @pointermove="handleRingPointerMove"
          @pointerleave="handleRingPointerLeave"
          @click="handleRingClick"
        >
          <div class="dna-ring-glow" aria-hidden="true"></div>
          <svg
            class="dna-ring-chart"
            :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`"
            role="img"
            :aria-label="
              centerItem
                ? `${focusGenre ? '当前' : '主导'}流派 ${centerItem.genre} ${formatPercent(centerItem.ratio)}`
                : '风格罗盘'
            "
          >
            <circle
              class="dna-ring-track"
              :cx="RING_CENTER"
              :cy="RING_CENTER"
              :r="RING_RADIUS"
              fill="none"
              :stroke-width="RING_STROKE"
            />
            <circle
              v-for="(segment, index) in ringSegments"
              :key="`${segment.genre}-${index}`"
              class="dna-ring-segment"
              :class="{ 'is-focus': focusGenre === segment.genre }"
              :cx="RING_CENTER"
              :cy="RING_CENTER"
              :r="RING_RADIUS"
              fill="none"
              :stroke="segment.colorHex"
              :stroke-width="segmentStrokeWidth(segment.genre)"
              stroke-linecap="butt"
              :stroke-dasharray="segment.dashArray"
              :stroke-dashoffset="segment.dashOffset"
              :style="{
                '--segment-index': index,
                opacity: segmentOpacity(segment.genre),
              }"
            />
          </svg>
          <div class="dna-ring-center">
            <span class="dna-ring-genre">{{ centerItem?.genre }}</span>
            <span class="dna-ring-percent">
              {{ centerItem ? formatPercent(centerItem.ratio) : '—' }}
            </span>
            <span class="dna-ring-caption">
              {{ selectedGenre ? '已选中' : focusGenre ? '当前风格' : '主导风格' }}
            </span>
          </div>
        </div>
        <p class="dna-ring-hint">悬停高亮 · 点击查看 Top 曲目 · 再点同段返回</p>
      </div>

      <div class="dna-side-column">
        <Transition name="dna-side-fade" mode="out-in">
          <!-- Detail: selected genre Top3 -->
          <div
            v-if="isDetailMode && selectedItem"
            key="detail"
            class="dna-detail-panel"
            data-dna-keep-selection
          >
            <div class="dna-detail-head">
              <div class="dna-detail-titles">
                <span class="dna-detail-kicker">Top Tracks</span>
                <h3>
                  <span
                    class="dna-detail-swatch"
                    :style="{ background: selectedItem.colorHex }"
                  ></span>
                  {{ selectedItem.genre }}
                </h3>
              </div>
              <span class="dna-detail-ratio">{{ formatPercent(selectedItem.ratio) }}</span>
            </div>

            <ol v-if="selectedTracks.length" class="dna-detail-tracks">
              <li v-for="(track, index) in selectedTracks" :key="track.trackId">
                <span class="dna-detail-rank">{{ index + 1 }}</span>
                <div class="dna-detail-art">
                  <img
                    v-if="getArtworkUrl(track.artworkCacheKey)"
                    :src="getArtworkUrl(track.artworkCacheKey) ?? undefined"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <span v-else class="i-lucide-disc-3 dna-detail-art-fallback"></span>
                </div>
                <div class="dna-detail-copy">
                  <span class="dna-detail-title">{{ track.title || '未知歌曲' }}</span>
                  <span class="dna-detail-artist">{{ formatArtist(track.artist) }}</span>
                </div>
                <span class="dna-detail-count">{{ track.playCount }} 次</span>
              </li>
            </ol>
            <p v-else class="dna-detail-empty">暂无曲目</p>

            <button
              type="button"
              class="dna-detail-back"
              data-dna-keep-selection
              @click="clearSelection"
            >
              返回光谱
            </button>
          </div>

          <!-- Default: genre spectrum list -->
          <div v-else key="spectrum" class="dna-spectrum-column">
            <div class="dna-spectrum-label">
              <span class="dna-spectrum-label-kicker">Spectrum</span>
              <span class="dna-spectrum-label-title">流派光谱</span>
            </div>

            <div class="dna-spectrum-list" role="list" aria-label="流派光谱">
              <div
                v-for="(item, index) in visibleSpectrumItems"
                :key="`${item.genre}-${index}`"
                class="spectrum-row"
                :class="{ 'is-focus': focusGenre === item.genre }"
                role="listitem"
                :style="{ '--row-accent': item.colorHex }"
              >
                <span class="spectrum-index">{{ formatSpectrumIndex(index) }}</span>
                <div class="spectrum-main">
                  <div class="spectrum-item-head">
                    <span class="spectrum-swatch" :style="{ background: item.colorHex }"></span>
                    <span class="spectrum-name">{{ item.genre }}</span>
                    <span class="spectrum-percent">{{ formatPercent(item.ratio) }}</span>
                  </div>
                  <div class="spectrum-bar-track">
                    <div
                      class="spectrum-bar-fill"
                      :style="{
                        width: `${Math.max(item.ratio * 100, 1.5)}%`,
                        background: barGradient(item.colorHex),
                        '--bar-delay': `${index * 40}ms`,
                      }"
                    ></div>
                  </div>
                  <div class="spectrum-item-meta">
                    <span>{{ item.count }} 次</span>
                    <span>{{ formatDuration(item.durationSeconds) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="canExpandSpectrum" class="dna-spectrum-footer">
              <button type="button" class="dna-spectrum-toggle" @click="toggleSpectrumExpanded">
                {{ spectrumExpanded ? '收起' : `展开更多（${hiddenSpectrumCount}）` }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<style scoped>
.music-dna-stage {
  margin-top: 32px;
  padding: 4px 2px 8px;
}

.music-dna-heading {
  max-width: 42rem;
}

.music-dna-kicker {
  display: block;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1;
  margin-bottom: 8px;
}

.music-dna-heading h2 {
  color: var(--auralis-text);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}

.music-dna-heading p {
  margin-top: 6px;
  color: var(--auralis-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.music-dna-state {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.music-dna-body {
  display: grid;
  grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.2fr);
  gap: 24px 36px;
  align-items: start;
  margin-top: 28px;
}

.dna-platter-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dna-ring-wrap {
  position: relative;
  width: min(100%, 300px);
  aspect-ratio: 1;
  margin-inline: auto;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  --dna-glow: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 55%, #6366f1);
}

.dna-ring-wrap.is-selected {
  cursor: pointer;
}

.dna-ring-glow {
  position: absolute;
  left: 50%;
  top: 52%;
  width: 78%;
  height: 78%;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--dna-glow) 28%, transparent) 0%,
    color-mix(in srgb, var(--dna-glow) 10%, transparent) 42%,
    transparent 72%
  );
  pointer-events: none;
  filter: blur(2px);
  z-index: 0;
}

.dna-ring-chart {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  pointer-events: none;
}

.dna-ring-track {
  stroke: color-mix(in srgb, var(--auralis-text) 10%, transparent);
}

.dna-ring-segment {
  transition:
    stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease,
    stroke-width 180ms ease;
  transition-delay: calc(var(--segment-index, 0) * 40ms), 0ms, 0ms;
  filter: drop-shadow(0 0 8px color-mix(in srgb, currentColor 30%, transparent));
}

.dna-ring-segment.is-focus {
  filter: drop-shadow(0 0 12px color-mix(in srgb, currentColor 50%, transparent));
}

.dna-ring-center {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px;
  pointer-events: none;
}

.dna-ring-genre {
  max-width: 100%;
  color: var(--auralis-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dna-ring-percent {
  margin-top: 4px;
  color: var(--auralis-text);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.dna-ring-caption {
  margin-top: 6px;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dna-ring-hint {
  margin: 0;
  color: var(--auralis-text-faint);
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
}

/* ── Right column shared ── */
.dna-side-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 240px;
  align-self: stretch;
}

.dna-side-column > * {
  flex: 1;
  min-height: 0;
}

.dna-side-fade-enter-active,
.dna-side-fade-leave-active {
  transition: opacity 180ms ease;
}

.dna-side-fade-enter-from,
.dna-side-fade-leave-to {
  opacity: 0;
}

/* ── Detail Top3 panel ── */
.dna-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.dna-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
}

.dna-detail-kicker {
  display: block;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.dna-detail-titles h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--auralis-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}

.dna-detail-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dna-detail-ratio {
  flex-shrink: 0;
  color: var(--auralis-text);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.03em;
  padding-top: 2px;
}

.dna-detail-tracks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dna-detail-tracks li {
  display: grid;
  grid-template-columns: 20px 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 6px 4px;
  border-radius: 10px;
  transition: background 160ms ease;
}

.dna-detail-tracks li:hover {
  background: color-mix(in srgb, var(--auralis-text) 4%, transparent);
}

.dna-detail-rank {
  color: var(--auralis-text-faint);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.dna-detail-art {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dna-detail-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dna-detail-art-fallback {
  width: 16px;
  height: 16px;
  color: var(--auralis-text-faint);
}

.dna-detail-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dna-detail-title {
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dna-detail-artist {
  color: var(--auralis-text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dna-detail-count {
  flex-shrink: 0;
  color: var(--auralis-text-faint);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.dna-detail-empty {
  margin: 0;
  padding: 28px 8px;
  color: var(--auralis-text-faint);
  font-size: 13px;
  text-align: center;
}

.dna-detail-back {
  align-self: flex-start;
  height: 28px;
  padding: 0 2px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 16%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 160ms ease,
    border-color 160ms ease;
}

.dna-detail-back:hover {
  color: var(--auralis-text);
  border-bottom-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 50%, transparent);
}

.dna-detail-back:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 58%, transparent);
  outline-offset: 3px;
}

/* ── Spectrum sheet ── */
.dna-spectrum-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 100%;
  padding-top: 2px;
}

.dna-spectrum-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 4px;
}

.dna-spectrum-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
}

.dna-spectrum-label-kicker {
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dna-spectrum-label-title {
  color: var(--auralis-text);
  font-size: 14px;
  font-weight: 800;
}

.dna-spectrum-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.spectrum-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 8px 8px 8px 4px;
  border-radius: 8px;
  border-left: 2px solid transparent;
  transition:
    background 160ms ease,
    border-color 160ms ease;
}

.spectrum-row:hover,
.spectrum-row.is-focus {
  background: color-mix(in srgb, var(--auralis-text) 4.5%, transparent);
}

.spectrum-row.is-focus {
  border-left-color: var(--row-accent, var(--auralis-sidebar-active-indicator));
  background: color-mix(in srgb, var(--row-accent, var(--auralis-text)) 8%, transparent);
}

.spectrum-index {
  padding-top: 2px;
  color: var(--auralis-text-faint);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.spectrum-main {
  min-width: 0;
}

.spectrum-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.spectrum-swatch {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.spectrum-name {
  flex: 1;
  min-width: 0;
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spectrum-percent {
  flex-shrink: 0;
  color: var(--auralis-text);
  font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.spectrum-bar-track {
  margin-top: 5px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 7%, transparent);
  overflow: hidden;
}

.spectrum-bar-fill {
  height: 100%;
  border-radius: inherit;
  min-width: 3px;
  transform-origin: left center;
  animation: spectrum-bar-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--bar-delay, 0ms);
}

.spectrum-item-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 3px;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 600;
}

.dna-spectrum-toggle {
  height: auto;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 160ms ease;
}

.dna-spectrum-toggle:hover {
  color: var(--auralis-text-muted);
}

.dna-spectrum-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 58%, transparent);
  outline-offset: 3px;
}

@keyframes spectrum-bar-in {
  from {
    transform: scaleX(0.15);
    opacity: 0.4;
  }
  to {
    transform: scaleX(1);
    opacity: 1;
  }
}

@media (max-width: 767px) {
  .music-dna-body {
    grid-template-columns: 1fr;
    gap: 22px;
  }

  .dna-ring-wrap {
    width: min(100%, 280px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dna-ring-segment {
    transition: none;
  }

  .spectrum-row,
  .dna-detail-tracks li {
    transition: none;
  }

  .spectrum-bar-fill {
    animation: none;
  }

  .dna-side-fade-enter-active,
  .dna-side-fade-leave-active {
    transition: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .dna-ring-glow {
    opacity: 0.45;
    filter: none;
  }
}
</style>
