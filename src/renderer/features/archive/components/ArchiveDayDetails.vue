<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyTopTrack } from '@shared/types/listeningArchive'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

const props = defineProps<{
  headingId: string
  date: string
  playCount: number
  durationSeconds: number
  tracks: DailyTopTrack[]
  loading: boolean
  failed: boolean
}>()
const { t, locale } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const dateLabel = computed(() => {
  const weekday = new Intl.DateTimeFormat(locale.value, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${props.date}T00:00:00Z`))
  return `${props.date} ${weekday}`
})
</script>

<template>
  <p :id="headingId" class="archive-day-date auralis-type-control">{{ dateLabel }}</p>
  <p class="archive-day-summary auralis-type-caption">
    {{ t('archive.daySummary', { count: playCount, minutes: Math.round(durationSeconds / 60) }) }}
  </p>
  <div class="archive-day-track-content">
    <p v-if="loading" class="archive-day-message auralis-type-caption" role="status">
      {{ t('archive.loading') }}
    </p>
    <p v-else-if="failed" class="archive-day-message auralis-type-caption" role="status">
      {{ t('archive.dayLoadError') }}
    </p>
    <ol v-else-if="tracks.length" class="archive-day-tracks">
      <li v-for="(track, index) in tracks" :key="track.trackId" class="archive-day-track">
        <span class="archive-day-rank auralis-type-caption">{{ index + 1 }}</span>
        <div class="archive-day-track-text">
          <p class="archive-day-track-title auralis-type-control">
            {{ songText(track.title) || t('archive.unknownTrack') }}
          </p>
          <p class="archive-day-artist auralis-type-caption">
            {{ songValues(track.artist) || t('archive.unknownArtist') }}
          </p>
        </div>
        <span class="archive-day-count auralis-type-caption">{{
          t('archive.playCount', { count: track.playCount })
        }}</span>
      </li>
    </ol>
    <p v-else class="archive-day-message archive-day-message--empty auralis-type-caption">
      {{ t('archive.dayEmpty') }}
    </p>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}
.archive-day-date {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.archive-day-summary {
  margin-top: 4px;
  color: var(--auralis-text-muted);
}
.archive-day-track-content {
  margin-top: 12px;
  min-height: 38px;
  overflow: auto;
}
.archive-day-tracks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-rows: 38px;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.archive-day-track {
  display: flex;
  align-items: center;
  gap: 8px;
}
.archive-day-rank {
  width: 12px;
  flex-shrink: 0;
  color: var(--auralis-text-muted);
}
.archive-day-track-text {
  flex: 1;
  min-width: 0;
}
.archive-day-track-title,
.archive-day-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-day-artist {
  color: var(--auralis-text-muted);
}
.archive-day-count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.archive-day-message {
  display: flex;
  align-items: center;
  min-height: 38px;
  color: var(--auralis-text-muted);
}
.archive-day-message--empty {
  justify-content: center;
  text-align: center;
}
</style>
