<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { animatePlaybackBars } from '@renderer/shared/animation/motion'
import { formatDuration } from '../utils/formatDuration'
import { formatArtist, isMultiValueArtist } from '../utils/formatArtist'
import { formatGenre } from '../utils/formatGenre'
import { formatMetadataDisplay } from '../utils/formatMetadataDisplay'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    isPlaying?: boolean
    selected?: boolean
    focused?: boolean
    index?: number
    discEnd?: boolean
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
const titleDisplay = computed(() =>
  formatMetadataDisplay(props.track.title, t('library.missing.title')),
)
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
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
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
    class="cover-track-row auralis-track-row-divider"
    :class="{
      'cover-track-row--playing': nowPlaying,
      'cover-track-row--single-line': !isMultiValueArtist(track.artist),
      'cover-track-row--disc-end': discEnd,
    }"
    :data-track-id="track.id"
    role="button"
    :tabindex="focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: index + 1,
        title: titleDisplay.text,
        artist: track.artist ?? '',
      })
    "
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
    <div class="cover-track-info min-w-0 flex flex-col overflow-hidden max-h-full">
      <span
        v-tooltip.overflow="titleDisplay.text"
        class="cover-track-title truncate text-sm leading-5 text-[var(--auralis-text)]"
        >{{ titleDisplay.text }}</span
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
      v-tooltip.overflow="formatDuration(track.durationSeconds)"
      class="cover-track-duration min-w-0 truncate text-right text-xs text-[var(--auralis-text-muted)] tabular-nums"
      >{{ formatDuration(track.durationSeconds) }}</span
    >
  </div>
</template>

<style scoped src="../../../shared/styles/trackRowDivider.css"></style>

<style scoped>
.cover-track-number {
  font-weight: var(--auralis-song-cover-track-number-weight, 400);
  font-size: var(--auralis-song-cover-track-number-size, 12px);
  line-height: max(16px, 1.2em);
}

.cover-track-title {
  font-weight: var(--auralis-song-cover-title-weight, 500);
  font-size: var(--auralis-song-cover-title-size, 14px);
  line-height: max(20px, 1.2em);
}

.cover-track-artist-line {
  font-weight: var(--auralis-song-cover-artist-weight, 400);
  font-size: var(--auralis-song-cover-artist-size, 12px);
  line-height: max(18px, 1.2em);
}

.cover-track-genre {
  font-weight: var(--auralis-song-cover-genre-weight, 400);
  font-size: var(--auralis-song-cover-genre-size, 12px);
  line-height: max(16px, 1.2em);
}

.cover-track-duration {
  font-weight: var(--auralis-song-cover-duration-weight, 400);
  font-size: var(--auralis-song-cover-duration-size, 12px);
  line-height: max(16px, 1.2em);
}

.cover-track-row {
  /* 各列在完整行框内居中；双行文字共 38px，上下各留 5px，完整显示副行下伸部。 */
  align-items: center;
}

.cover-track-row--single-line,
.app-shell.is-lyrics-collapsed .cover-track-row:not(.cover-track-row--single-line) {
  /* 单行文字共用基线，按内容高度形成一组，再在完整行框中整体居中。 */
  grid-template-rows: max-content;
  align-content: center;
  align-items: first baseline;
}

/* 右侧面板收起时，多值艺术家与标题并排；各自省略，保持曲目行的固定高度。 */
.app-shell.is-lyrics-collapsed
  .cover-track-row:not(.cover-track-row--single-line)
  .cover-track-info {
  flex-direction: row;
  align-items: baseline;
  gap: 12px;
}

.app-shell.is-lyrics-collapsed
  .cover-track-row:not(.cover-track-row--single-line)
  :is(.cover-track-title, .cover-track-artist-line) {
  flex: 0 1 auto;
  min-width: 0;
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
.cover-track-row--disc-end::after {
  content: '';
}

.cover-track-row::before {
  top: 0;
}

.cover-track-row--disc-end::after {
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
