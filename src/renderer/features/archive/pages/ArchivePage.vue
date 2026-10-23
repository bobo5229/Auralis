<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import AnnualHeatmap from '../components/AnnualHeatmap.vue'
import ArchiveDayAlbums from '../components/ArchiveDayAlbums.vue'
import ArchiveSeasonBanner from '../components/ArchiveSeasonBanner.vue'
import { useAnnualPlayCounts } from '../composables/useAnnualPlayCounts'
import { useDayTopAlbums } from '../composables/useDayTopAlbums'
import { usePinnedArchiveDay } from '../composables/usePinnedArchiveDay'
import { resolveArchiveYear } from '../utils/archiveYear'

const { t } = useI18n()
const route = useRoute()
const year = ref(resolveArchiveYear(route.query.year))
watch(
  () => route.query.year,
  (value) => {
    year.value = resolveArchiveYear(value)
  },
)
const { days, isLoading, hasError } = useAnnualPlayCounts(year, auralis.archive, auralis.library)
const { date: pinnedDate, pin: pinDay } = usePinnedArchiveDay(days, year, () => route.query.date)
const {
  albums: pinnedAlbums,
  isLoading: pinnedAlbumsLoading,
  hasError: pinnedAlbumsError,
  refresh: refreshPinnedAlbums,
} = useDayTopAlbums(pinnedDate, auralis.archive, auralis.library, () =>
  days.value.find((day) => day.date === pinnedDate.value),
)

function changeYear(step: number) {
  // Keep navigation within the existing archive query's supported calendar range.
  year.value = Math.min(9999, Math.max(1900, year.value + step))
}
const statusMessage = computed(() => {
  if (hasError.value) return t('archive.loadError')
  if (isLoading.value) return t('archive.loading')
  if (!days.value.some((day) => day.playCount > 0)) return t('archive.empty')
  return ''
})
</script>

<template>
  <section class="archive-page" :aria-label="t('archive.title')">
    <div class="archive-calendar-section">
      <ArchiveSeasonBanner :year="year" class="archive-seasons" />
      <AnnualHeatmap
        :year="year"
        :days="days"
        :pinned-date="pinnedDate"
        :aria-busy="isLoading"
        @previous-year="changeYear(-1)"
        @next-year="changeYear(1)"
        @pin-date="pinDay"
      />
      <ArchiveDayAlbums
        :date="pinnedDate"
        :albums="pinnedAlbums"
        :loading="pinnedAlbumsLoading"
        :failed="pinnedAlbumsError"
        @retry="refreshPinnedAlbums"
      />
      <p class="sr-only" role="status">{{ statusMessage }}</p>
    </div>
  </section>
</template>

<style scoped>
.archive-page {
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
  padding-bottom: calc(var(--auralis-playbar-safe-area) + 24px);
  color: var(--auralis-text);
}

.archive-calendar-section {
  width: 100%;
  max-width: 1600px;
  min-width: 0;
  margin: 0 auto;
}

.archive-seasons {
  margin: 0 2px 24px;
}
</style>
