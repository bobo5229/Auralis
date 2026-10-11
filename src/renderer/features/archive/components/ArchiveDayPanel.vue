<script setup lang="ts">
import type { DailyTopTrack } from '@shared/types/listeningArchive'
import ArchiveDayDetails from './ArchiveDayDetails.vue'
defineProps<{
  id: string
  date: string
  playCount: number
  durationSeconds: number
  tracks: DailyTopTrack[]
  loading: boolean
  failed: boolean
}>()
</script>
<template>
  <div
    :id="id"
    class="archive-day-panel"
    role="dialog"
    aria-modal="false"
    :aria-labelledby="`${id}-date`"
  >
    <div class="archive-day-panel-surface" aria-hidden="true"></div>
    <div class="archive-day-panel-content">
      <ArchiveDayDetails
        :heading-id="`${id}-date`"
        :date="date"
        :play-count="playCount"
        :duration-seconds="durationSeconds"
        :tracks="tracks"
        :loading="loading"
        :failed="failed"
      />
    </div>
  </div>
</template>

<style scoped>
.archive-day-panel {
  position: fixed;
  z-index: 100;
  width: 300px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  padding: 16px;
  color: var(--auralis-text);
}
.archive-day-panel-surface {
  position: absolute;
  inset: 0;
  transform-origin: top left;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 16%, var(--archive-panel-fill));
  border-radius: 10px;
  background: var(--archive-panel-fill);
  box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
  pointer-events: none;
}
.archive-day-panel-content {
  position: relative;
}
</style>
