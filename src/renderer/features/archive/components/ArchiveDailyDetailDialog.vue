<script setup lang="ts">
import { computed } from 'vue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { DailyListeningDetail } from '@shared/types/archive'
import {
  formatArchiveMinutes,
  resolveArchiveDailyDetailView,
  type ArchiveDailyDetailDialogModel,
} from '../utils/archiveDailyDetailState'

const props = defineProps<{
  dialog: ArchiveDailyDetailDialogModel
  detail: DailyListeningDetail | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const view = computed(() =>
  resolveArchiveDailyDetailView(props.loading, props.error, props.detail?.tracks.length ?? 0),
)
</script>

<template>
  <div
    class="archive-detail-backdrop"
    :class="{ 'is-visible': dialog.expanded }"
    @click.self="emit('close')"
  >
    <section
      class="archive-detail-dialog"
      :class="{ 'is-expanded': dialog.expanded }"
      :style="{
        '--dialog-origin-x': `${dialog.x}px`,
        '--dialog-origin-y': `${dialog.y}px`,
      }"
      role="dialog"
      aria-modal="true"
      :aria-label="`${dialog.label}播放排行`"
    >
      <header class="archive-detail-header">
        <div>
          <span>{{ dialog.label }}</span>
          <h2>当日播放 Top 10</h2>
          <p v-if="detail">
            {{ detail.totalPlayCount }} 次播放 ·
            {{ formatArchiveMinutes(detail.totalDurationSeconds) }}
          </p>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <span class="i-lucide-x h-4 w-4"></span>
        </button>
      </header>

      <div v-if="view === 'loading'" class="archive-detail-state">正在整理这一天的声迹…</div>
      <div v-else-if="view === 'error'" class="archive-detail-state">{{ error }}</div>
      <ol v-else-if="view === 'tracks'" class="archive-top-tracks">
        <li
          v-for="(track, index) in detail!.tracks"
          :key="track.trackId"
          :style="{ '--item-index': index }"
        >
          <span
            class="archive-track-rank"
            :class="{
              'rank-gold': index === 0,
              'rank-silver': index === 1,
              'rank-bronze': index === 2,
            }"
            >{{ index + 1 }}</span
          >
          <div class="archive-track-artwork">
            <img
              v-if="getArtworkUrl(track.artworkCacheKey)"
              :src="getArtworkUrl(track.artworkCacheKey) ?? undefined"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span v-else class="i-lucide-music-2 h-4 w-4"></span>
          </div>
          <div class="archive-track-copy">
            <strong>{{ track.title || '未知歌曲' }}</strong>
            <span>{{ track.artist || '未知艺人' }}</span>
          </div>
          <span class="archive-track-count">{{ track.playCount }} 次</span>
        </li>
      </ol>
      <div v-else class="archive-detail-state">
        <span class="i-lucide-calendar-clock h-6 w-6"></span>
        <p>这一天还没有可用的歌曲明细</p>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/archive.daily-detail.css"></style>
