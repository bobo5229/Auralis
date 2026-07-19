<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { PlaybackMode, PlaybackTrack } from '@renderer/features/playback/types'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { auralis } from '@renderer/shared/ipc/client'
import type { MiniPlayerPopoverDirection } from '@shared/ipc/contracts'

type MiniPopover = 'queue' | 'mode' | 'volume' | null

const playback = usePlayback()
const activePopover = ref<MiniPopover>(null)
const popoverDirection = ref<MiniPlayerPopoverDirection>('below')
const imageErrorIds = ref<Set<number>>(new Set())
let unsubscribeMiniPlayerState: (() => void) | undefined

const miniWindow = auralis.window
const currentTrack = computed(() => playback.state.currentTrack)
const progressRatio = computed(() => {
  if (!playback.state.duration) return 0
  return Math.min(1, Math.max(0, playback.state.currentTime / playback.state.duration))
})
const progressStyle = computed(() => ({ '--mini-progress': `${progressRatio.value * 100}%` }))
const volumeStyle = computed(() => ({ '--mini-volume': `${playback.state.volume * 100}%` }))

const modeIcon = computed(() => {
  const icons: Record<PlaybackMode, string> = {
    sequential: 'i-lucide-list-end',
    'repeat-all': 'i-lucide-repeat',
    'repeat-one': 'i-lucide-repeat-1',
    shuffle: 'i-lucide-shuffle',
    'album-shuffle': 'i-lucide-disc-3',
  }
  return icons[playback.state.playbackMode]
})

const volumeIcon = computed(() => {
  if (playback.state.isMuted) return 'i-lucide-volume-x'
  if (playback.state.volume <= 0.33) return 'i-lucide-volume'
  if (playback.state.volume <= 0.66) return 'i-lucide-volume-1'
  return 'i-lucide-volume-2'
})

const modes: Array<{ id: PlaybackMode; label: string; icon: string }> = [
  { id: 'sequential', label: '顺序播放', icon: 'i-lucide-list-end' },
  { id: 'repeat-all', label: '列表循环', icon: 'i-lucide-repeat' },
  { id: 'repeat-one', label: '单曲循环', icon: 'i-lucide-repeat-1' },
  { id: 'shuffle', label: '随机播放', icon: 'i-lucide-shuffle' },
  { id: 'album-shuffle', label: '专辑随机', icon: 'i-lucide-disc-3' },
]

function artworkFailed(trackId: number): boolean {
  return imageErrorIds.value.has(trackId)
}

function handleArtworkError(trackId: number): void {
  imageErrorIds.value = new Set(imageErrorIds.value).add(trackId)
}

async function setPopover(next: MiniPopover): Promise<void> {
  activePopover.value = next
  const height = next === 'queue' ? 330 : next === 'mode' ? 212 : next === 'volume' ? 88 : 0
  const result = await miniWindow.setMiniPlayerPopover({
    open: next !== null,
    direction: popoverDirection.value,
    height,
  })
  if (result?.popover.direction) popoverDirection.value = result.popover.direction
}

function togglePopover(popover: Exclude<MiniPopover, null>): void {
  void setPopover(activePopover.value === popover ? null : popover)
}

function selectPlaybackMode(mode: PlaybackMode): void {
  playback.setPlaybackMode(mode)
  closePopover()
}

function closePopover(): void {
  if (!activePopover.value) return
  void setPopover(null)
}

function handleOutsidePointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!(target instanceof Element)) {
    closePopover()
    return
  }

  if (target.closest('.mini-popover')) return

  const trigger = target.closest<HTMLElement>('[data-mini-popover-trigger]')
  if (trigger?.dataset.miniPopoverTrigger === activePopover.value) return

  closePopover()
}

function progressRatioFromEvent(event: PointerEvent): number {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function seekFromPointer(event: PointerEvent): void {
  if (!playback.state.duration) return
  playback.seekByRatio(progressRatioFromEvent(event))
}

function handleProgressPointerDown(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  seekFromPointer(event)
}

function handleProgressPointerMove(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) seekFromPointer(event)
}

function handleProgressPointerUp(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  seekFromPointer(event)
}

function handleProgressKeydown(event: KeyboardEvent): void {
  if (!playback.state.duration) return
  const delta = event.shiftKey ? 10 : 5
  if (event.key === 'ArrowLeft') playback.seekTo(playback.state.currentTime - delta)
  if (event.key === 'ArrowRight') playback.seekTo(playback.state.currentTime + delta)
}

async function playQueueTrack(track: PlaybackTrack): Promise<void> {
  await playback.playTrackFromQueue(playback.state.queue, track.id)
}

function restoreMainWindow(): void {
  void miniWindow.restoreFromMiniPlayer()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePopover()
}

onMounted(() => {
  document.documentElement.classList.add('mini-player-root')
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  document.addEventListener('keydown', handleKeydown)
  void miniWindow.getMiniPlayerState().then((state) => {
    popoverDirection.value = state.popover.direction
  })
  unsubscribeMiniPlayerState = miniWindow.onMiniPlayerStateChanged((state) => {
    popoverDirection.value = state.popover.direction
  })
})

onUnmounted(() => {
  document.documentElement.classList.remove('mini-player-root')
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  document.removeEventListener('keydown', handleKeydown)
  unsubscribeMiniPlayerState?.()
})
</script>

<template>
  <main class="mini-player-canvas" :class="`mini-player-canvas--${popoverDirection}`">
    <section v-if="activePopover" class="mini-popover" data-mini-interactive>
      <div
        v-if="activePopover === 'queue'"
        class="mini-queue-panel"
        role="dialog"
        aria-label="播放队列"
      >
        <div class="mini-panel-heading">
          <span>播放队列</span><span>{{ playback.state.queue.length }} 首</span>
        </div>
        <div v-if="playback.state.queue.length === 0" class="mini-empty">暂无播放队列</div>
        <div v-else class="mini-queue-list scrollbar-none">
          <button
            v-for="track in playback.state.queue"
            :key="track.id"
            class="mini-queue-item"
            :class="{ 'mini-queue-item--active': track.id === playback.state.currentTrackId }"
            type="button"
            :aria-label="`播放 ${track.title || '未知歌曲'}`"
            @click="playQueueTrack(track)"
          >
            <div class="mini-queue-cover">
              <img
                v-if="getArtworkUrl(track.artworkCacheKey) && !artworkFailed(track.id)"
                :src="getArtworkUrl(track.artworkCacheKey)!"
                alt=""
                draggable="false"
                @error="handleArtworkError(track.id)"
              />
              <span v-else class="h-4 w-4 i-lucide-music" />
            </div>
            <span class="mini-queue-copy"
              ><b>{{ track.title || '未知歌曲' }}</b
              ><small>{{ formatPlaybackSubtitle(track) }}</small></span
            >
            <span
              v-if="track.id === playback.state.currentTrackId"
              class="h-4 w-4 i-lucide-volume-2"
            />
          </button>
        </div>
      </div>

      <div
        v-else-if="activePopover === 'mode'"
        class="mini-mode-panel"
        role="menu"
        aria-label="播放模式"
      >
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="mini-mode-option"
          :class="{ 'mini-mode-option--active': mode.id === playback.state.playbackMode }"
          type="button"
          role="menuitemradio"
          :aria-checked="mode.id === playback.state.playbackMode"
          @click="selectPlaybackMode(mode.id)"
        >
          <span class="h-4 w-4" :class="mode.icon" /><span>{{ mode.label }}</span
          ><span
            v-if="mode.id === playback.state.playbackMode"
            class="ml-auto h-4 w-4 i-lucide-check"
          />
        </button>
      </div>

      <div v-else class="mini-volume-panel" role="dialog" aria-label="音量">
        <div class="mini-panel-heading">
          <span>音量</span><span>{{ Math.round(playback.state.volume * 100) }}%</span>
        </div>
        <div class="mini-volume-control">
          <button
            class="mini-icon-button"
            type="button"
            aria-label="静音"
            data-tooltip="静音"
            @click="playback.toggleMute()"
          >
            <span class="h-4 w-4" :class="volumeIcon" />
          </button>
          <input
            :value="playback.state.volume"
            class="mini-volume-slider"
            :style="volumeStyle"
            type="range"
            min="0"
            max="1"
            step="0.01"
            aria-label="音量"
            @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </section>

    <section class="mini-player">
      <div class="mini-drag-region" aria-hidden="true" />
      <div class="mini-track" data-mini-interactive>
        <div class="mini-cover">
          <img
            v-if="
              currentTrack &&
              getArtworkUrl(currentTrack.artworkCacheKey) &&
              !artworkFailed(currentTrack.id)
            "
            :src="getArtworkUrl(currentTrack.artworkCacheKey)!"
            alt=""
            draggable="false"
            @error="handleArtworkError(currentTrack.id)"
          />
          <span v-else class="h-5 w-5 i-lucide-music" />
        </div>
        <div class="mini-track-copy">
          <strong>{{ currentTrack?.title || 'Auralis' }}</strong
          ><span>{{ currentTrack ? formatPlaybackSubtitle(currentTrack) : '尚未播放' }}</span>
        </div>
      </div>
      <div class="mini-transport" data-mini-interactive>
        <button
          class="mini-icon-button"
          type="button"
          aria-label="上一首"
          data-tooltip="上一首"
          @click="playback.playPrevious()"
        >
          <span class="h-4 w-4 i-lucide-skip-back" />
        </button>
        <button
          class="mini-play-button"
          type="button"
          :aria-label="playback.state.isPlaying ? '暂停' : '播放'"
          :data-tooltip="playback.state.isPlaying ? '暂停' : '播放'"
          @click="playback.togglePlayPause()"
        >
          <span
            class="h-5 w-5"
            :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          />
        </button>
        <button
          class="mini-icon-button"
          type="button"
          aria-label="下一首"
          data-tooltip="下一首"
          @click="playback.playNext()"
        >
          <span class="h-4 w-4 i-lucide-skip-forward" />
        </button>
      </div>
      <div class="mini-actions" data-mini-interactive>
        <button
          class="mini-icon-button"
          :class="{ 'mini-icon-button--active': activePopover === 'queue' }"
          type="button"
          aria-label="播放队列"
          data-tooltip="播放队列"
          data-mini-popover-trigger="queue"
          @click="togglePopover('queue')"
        >
          <span class="h-4 w-4 i-lucide-list-music" />
        </button>
        <button
          class="mini-icon-button"
          :class="{ 'mini-icon-button--active': activePopover === 'mode' }"
          type="button"
          aria-label="播放模式"
          data-tooltip="播放模式"
          data-mini-popover-trigger="mode"
          @click="togglePopover('mode')"
        >
          <span class="h-4 w-4" :class="modeIcon" />
        </button>
        <button
          class="mini-icon-button"
          :class="{ 'mini-icon-button--active': activePopover === 'volume' }"
          type="button"
          aria-label="音量"
          data-tooltip="音量"
          data-mini-popover-trigger="volume"
          @click="togglePopover('volume')"
        >
          <span class="h-4 w-4" :class="volumeIcon" />
        </button>
      </div>
      <div class="mini-window-actions" data-mini-interactive>
        <button
          class="mini-icon-button"
          type="button"
          aria-label="最小化"
          data-tooltip="最小化"
          @click="auralis.window.minimize()"
        >
          <span class="h-3.5 w-3.5 i-lucide-minus" />
        </button>
        <button
          class="mini-icon-button"
          type="button"
          aria-label="恢复主界面"
          data-tooltip="恢复主界面"
          @click="restoreMainWindow"
        >
          <span class="h-3.5 w-3.5 i-lucide-panel-top-open" />
        </button>
        <button
          class="mini-icon-button mini-close-button"
          type="button"
          aria-label="关闭 Auralis"
          data-tooltip="关闭 Auralis"
          @click="auralis.window.close()"
        >
          <span class="h-3.5 w-3.5 i-lucide-x" />
        </button>
      </div>
      <div
        class="mini-progress"
        data-mini-interactive
        role="slider"
        tabindex="0"
        aria-label="播放进度"
        aria-valuemin="0"
        :aria-valuemax="Math.round(playback.state.duration)"
        :aria-valuenow="Math.round(playback.state.currentTime)"
        :style="progressStyle"
        @pointerdown="handleProgressPointerDown"
        @pointermove="handleProgressPointerMove"
        @pointerup="handleProgressPointerUp"
        @keydown="handleProgressKeydown"
      >
        <span />
      </div>
    </section>
  </main>
</template>

<style scoped>
:global(.mini-player-root),
:global(.mini-player-root body),
:global(.mini-player-root #app) {
  width: 100%;
  min-height: 100%;
  overflow: hidden;
  background: transparent !important;
}
.mini-player-canvas {
  width: 440px;
  min-height: 146px;
  display: flex;
  gap: 10px;
  pointer-events: none;
}
.mini-player-canvas--above {
  flex-direction: column;
  justify-content: flex-end;
}
.mini-player-canvas--below {
  flex-direction: column-reverse;
  justify-content: flex-end;
}
.mini-player,
.mini-popover {
  pointer-events: auto;
  width: 440px;
  border: 1px solid var(--auralis-border-subtle, rgb(127 127 127 / 0.24));
  background: var(--auralis-surface-floating, #232529);
  box-shadow: 0 16px 42px rgb(0 0 0 / 0.24);
}
.mini-player {
  position: relative;
  height: 146px;
  border-radius: 18px;
  overflow: hidden;
  color: var(--auralis-text-primary, #f5f5f5);
}
.mini-drag-region {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}
.mini-track,
.mini-transport,
.mini-actions,
.mini-window-actions,
.mini-progress,
.mini-popover {
  -webkit-app-region: no-drag;
}
.mini-track {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  width: 158px;
  gap: 10px;
  align-items: center;
}
.mini-cover,
.mini-queue-cover {
  display: grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  background: var(--auralis-surface-raised, #34363a);
  color: var(--auralis-text-faint, #a0a0a5);
}
.mini-cover {
  width: 54px;
  height: 54px;
  border-radius: 10px;
}
.mini-cover img,
.mini-queue-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-track-copy,
.mini-queue-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.mini-track-copy strong,
.mini-queue-copy b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}
.mini-track-copy span,
.mini-queue-copy small {
  overflow: hidden;
  color: var(--auralis-text-secondary, #ababaf);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.mini-transport {
  position: absolute;
  top: 28px;
  left: 184px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-actions {
  position: absolute;
  top: 36px;
  right: 12px;
  display: flex;
  gap: 2px;
}
.mini-window-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 1px;
}
.mini-icon-button,
.mini-play-button {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--auralis-text-secondary, #cacace);
  background: transparent;
  cursor: pointer;
}
.mini-icon-button:hover,
.mini-icon-button--active {
  color: var(--auralis-text-primary, #fff);
  background: rgb(255 255 255 / 0.11);
}
.mini-icon-button:active,
.mini-play-button:active {
  transform: scale(0.96);
}
.mini-play-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #151515;
  background: var(--auralis-text-primary, #f7f7f7);
}
.mini-close-button:hover {
  color: white;
  background: #d34c4c;
}
.mini-icon-button[data-tooltip]::after,
.mini-play-button[data-tooltip]::after {
  position: absolute;
  z-index: 20;
  top: calc(100% + 7px);
  left: 50%;
  padding: 4px 6px;
  border-radius: 5px;
  color: white;
  background: rgb(0 0 0 / 0.78);
  content: attr(data-tooltip);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-2px);
  transition:
    opacity 0.14s,
    transform 0.14s;
}
.mini-icon-button[data-tooltip]:hover::after,
.mini-play-button[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%);
}

.mini-window-actions .mini-icon-button:last-child[data-tooltip]::after {
  right: 0;
  left: auto;
  transform: translateY(-2px);
}

.mini-window-actions .mini-icon-button:last-child[data-tooltip]:hover::after {
  transform: translateY(0);
}
.mini-progress {
  position: absolute;
  right: 20px;
  bottom: 21px;
  left: 20px;
  height: 8px;
  cursor: pointer;
  outline: none;
}
.mini-progress::before,
.mini-progress span {
  position: absolute;
  top: 3px;
  right: 0;
  left: 0;
  height: 2px;
  border-radius: 999px;
  content: '';
}
.mini-progress::before {
  background: var(--auralis-progress-track, rgb(255 255 255 / 0.18));
}
.mini-progress span {
  width: var(--mini-progress);
  background: var(--auralis-sidebar-active-indicator, #8ab4f8);
}
.mini-progress:hover::before,
.mini-progress:hover span {
  height: 4px;
  top: 2px;
}
.mini-popover {
  max-height: 330px;
  border-radius: 14px;
  overflow: hidden;
}
.mini-panel-heading {
  display: flex;
  justify-content: space-between;
  padding: 13px 14px 10px;
  color: var(--auralis-text-secondary, #c4c4c8);
  font-size: 11px;
}
.mini-panel-heading span:first-child {
  color: var(--auralis-text-primary, #f5f5f5);
  font-size: 13px;
  font-weight: 650;
}
.mini-empty {
  padding: 30px;
  color: var(--auralis-text-faint, #949499);
  text-align: center;
  font-size: 12px;
}
.mini-queue-list {
  max-height: 270px;
  overflow: auto;
  padding: 0 7px 7px;
}
.mini-queue-item,
.mini-mode-option {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 9px;
  padding: 7px;
  color: var(--auralis-text-secondary, #c7c7cc);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.mini-queue-item:hover,
.mini-mode-option:hover,
.mini-queue-item--active,
.mini-mode-option--active {
  color: var(--auralis-text-primary, #fff);
  background: rgb(255 255 255 / 0.08);
}
.mini-queue-cover {
  width: 36px;
  height: 36px;
  border-radius: 7px;
}
.mini-queue-copy {
  flex: 1;
}
.mini-queue-item--active .mini-queue-copy b {
  color: var(--auralis-sidebar-active-indicator, #8ab4f8);
}
.mini-mode-panel {
  padding: 7px;
}
.mini-mode-option {
  min-height: 34px;
  font-size: 12px;
}
.mini-volume-panel {
  padding: 4px 14px 15px;
}
.mini-volume-control {
  display: flex;
  gap: 10px;
  align-items: center;
}
.mini-volume-slider {
  flex: 1;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--auralis-sidebar-active-indicator, #8ab4f8) 0 var(--mini-volume),
    var(--auralis-progress-track, rgb(255 255 255 / 0.18)) var(--mini-volume) 100%
  );
  outline: none;
}
.mini-volume-slider::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  appearance: none;
  border-radius: 50%;
  background: var(--auralis-text-primary, #fff);
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .mini-icon-button,
  .mini-play-button,
  .mini-icon-button::after,
  .mini-play-button::after {
    transition: none;
  }
}
</style>
