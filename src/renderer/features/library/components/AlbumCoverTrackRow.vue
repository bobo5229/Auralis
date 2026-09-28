<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { animatePlaybackBars } from '@renderer/shared/animation/motion'
import { formatDuration } from '../utils/formatDuration'
import { formatArtist, isMultiValueArtist } from '../utils/formatArtist'
import { formatGenre } from '../utils/formatGenre'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    isPlaying?: boolean
    selected?: boolean
    focused?: boolean
    index?: number
  }>(),
  { isPlaying: false, selected: false, focused: false, index: 0 },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focus: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()
const { t } = useI18n()
const barsRef = ref<HTMLElement | null>(null)

// 仅当前曲目行存在音柱 DOM 时注册动画资源；每次依赖变化先执行上一次的清理函数。
watch(
  [barsRef, () => props.nowPlaying, () => props.isPlaying],
  (_, __, onCleanup) => {
    const bars = Array.from(
      barsRef.value?.querySelectorAll<HTMLElement>('.cover-track-bars__bar') ?? [],
    )
    if (bars.length === 0) return
    onCleanup(animatePlaybackBars(bars, props.isPlaying))
  },
  { flush: 'post', immediate: true },
)

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === ' ') {
    event.preventDefault()
    emit('select', props.track.id)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    emit('play', props.track.id)
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    emit(
      'openContextMenu',
      props.track.id,
      new MouseEvent('contextmenu', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
      'keyboard',
    )
  }
}
</script>

<template>
  <div
    class="cover-track-row"
    :class="{
      'cover-track-row--playing': nowPlaying,
      'cover-track-row--single-line': !isMultiValueArtist(track.artist),
    }"
    :data-track-id="track.id"
    role="button"
    :tabindex="focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: index + 1,
        title: track.title ?? '',
        artist: track.artist ?? '',
      })
    "
    @click="emit('select', track.id)"
    @dblclick="emit('play', track.id)"
    @contextmenu.prevent="emit('openContextMenu', track.id, $event, 'pointer')"
    @keydown="onKeyDown"
    @focus="emit('focus', track.id)"
  >
    <span class="cover-track-index block w-full">
      <span
        class="cover-track-number block w-full text-center text-xs text-[var(--auralis-text-muted)] tabular-nums select-none"
        :class="{ 'cover-track-index__number--hidden': nowPlaying }"
      >
        {{
          track.trackNo == null ? (nowPlaying ? '00' : '') : String(track.trackNo).padStart(2, '0')
        }}
      </span>
      <span v-if="nowPlaying" ref="barsRef" class="cover-track-bars" aria-hidden="true">
        <span class="cover-track-bars__bar"></span>
        <span class="cover-track-bars__bar"></span>
        <span class="cover-track-bars__bar"></span>
      </span>
    </span>
    <div class="min-w-0 flex flex-col overflow-hidden max-h-full">
      <span
        v-tooltip.overflow="track.title"
        class="cover-track-title truncate text-sm leading-5 text-[var(--auralis-text)]"
        >{{ track.title ?? '' }}</span
      >
      <span
        v-if="isMultiValueArtist(track.artist)"
        v-tooltip.overflow="formatArtist(track.artist)"
        class="cover-track-artist-line truncate text-xs leading-[18px] text-[var(--auralis-text-faint)]"
        >{{ formatArtist(track.artist) }}</span
      >
    </div>
    <span
      v-tooltip.overflow="formatGenre(track.genre)"
      class="cover-track-genre truncate text-right text-xs text-[var(--auralis-text-muted)] min-w-0"
      >{{ formatGenre(track.genre) }}</span
    >
    <span
      class="cover-track-duration text-right text-xs text-[var(--auralis-text-muted)] tabular-nums"
      >{{ formatDuration(track.durationSeconds) }}</span
    >
  </div>
</template>

<style scoped>
.cover-track-number {
  font-weight: var(--auralis-song-cover-track-number-weight, 400);
}

.cover-track-title {
  font-weight: var(--auralis-song-cover-title-weight, 500);
}

.cover-track-artist-line {
  font-weight: var(--auralis-song-cover-artist-weight, 400);
}

.cover-track-genre {
  font-weight: var(--auralis-song-cover-genre-weight, 400);
}

.cover-track-duration {
  font-weight: var(--auralis-song-cover-duration-weight, 400);
}

.cover-track-row {
  /* 各列在完整行框内居中；双行文字共 38px，上下各留 5px，完整显示副行下伸部。 */
  align-items: center;
}

.cover-track-row--single-line {
  /* 单行文字共用基线，按内容高度形成一组，再在完整行框中整体居中。 */
  grid-template-rows: max-content;
  align-content: center;
  align-items: first baseline;
}

.cover-track-index {
  position: relative;
  display: block;
  width: 100%;
}

.cover-track-index__number--hidden {
  /* 保留单元格行框与基线占位，隐藏数字不重复暴露给辅助技术。 */
  visibility: hidden;
}

/* 14×14 图标外框；绝对定位覆盖在原音轨号列内，不参与单行基线计算。 */
.cover-track-bars {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 14px;
  height: 14px;
  color: var(--auralis-song-row-now-playing-title);
  pointer-events: none;
  user-select: none;
  transform: translate(-50%, -50%);
}

.cover-track-bars__bar {
  width: 2px;
  height: 12px;
  border-radius: 1px;
  background: currentColor;
  transform-origin: bottom;
}

/* 初始静态柱高 5/10/7px；播放动画由 motion.ts 在同一 transform 上覆盖。 */
.cover-track-bars__bar:nth-child(1) {
  transform: scaleY(0.417);
}

.cover-track-bars__bar:nth-child(2) {
  transform: scaleY(0.833);
}

.cover-track-bars__bar:nth-child(3) {
  transform: scaleY(0.583);
}

.cover-track-row::before,
.cover-track-row:last-child::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  /* 使用边框的设备像素取整，避免非整数缩放下实心矩形出现粗细差异。 */
  height: 0;
  border-top: 1px solid var(--auralis-cover-track-divider);
  pointer-events: none;
}

.cover-track-row::before {
  top: 0;
}

.cover-track-row:last-child::after {
  bottom: 0;
}

/* 相邻分割线由下一行绘制；首尾边界也随悬停、选择或播放状态隐藏。 */
.cover-track-row:is(:hover, [aria-pressed='true'], .cover-track-row--playing)::before,
.cover-track-row:is(:hover, [aria-pressed='true'], .cover-track-row--playing)::after,
.cover-track-row:is(:hover, [aria-pressed='true'], .cover-track-row--playing)
  + .cover-track-row::before {
  display: none;
}
</style>
