<script setup lang="ts">
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import { auralis } from '@renderer/shared/ipc/client'
import { useDayTopTracks } from '../composables/useDayTopTracks'
import ArchiveDayDetails from './ArchiveDayDetails.vue'

const props = defineProps<{ date: string; daySummary?: DailyPlayCount }>()
const { tracks, loading, failed, refresh } = useDayTopTracks(
  () => props.date,
  auralis.archive,
  auralis.library,
  () => props.daySummary,
)
</script>

<template>
  <ArchiveDayDetails :tracks="tracks" :loading="loading" :failed="failed" @retry="refresh" />
</template>
