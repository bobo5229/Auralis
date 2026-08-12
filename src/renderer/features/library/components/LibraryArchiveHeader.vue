<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFolioNumber } from '../constants/libraryArchivePresentation'

const props = defineProps<{
  trackCount: number
  currentFolio: number
  totalFolios: number
  isLoading: boolean
}>()

const { t } = useI18n()

const formattedTrackCount = computed(() => {
  if (props.isLoading) return '---'
  return props.trackCount.toLocaleString()
})

const formattedCurrentFolio = computed(() => {
  if (props.isLoading) return '000'
  return formatFolioNumber(props.currentFolio)
})

const formattedTotalFolios = computed(() => {
  if (props.isLoading) return '000'
  return formatFolioNumber(props.totalFolios)
})
</script>

<template>
  <header
    class="library-archive-header select-none border-b border-[var(--manuscript-border-ledger)] px-8 pt-6 pb-4 transition-colors"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-4 pr-32">
      <div class="flex flex-col gap-1">
        <h1
          class="font-[var(--manuscript-font-body)] text-2xl font-semibold tracking-wide text-[var(--manuscript-content-primary)]"
        >
          {{ t('library.manuscript.header.title') }}
        </h1>
        <p
          class="font-[var(--manuscript-font-body)] text-xs tracking-wider text-[var(--manuscript-content-ledger-label)]"
        >
          {{ t('library.manuscript.header.subtitle') }}
        </p>
      </div>

      <div
        class="flex items-center gap-6 font-[var(--manuscript-font-numeric)] text-xs text-[var(--manuscript-content-ledger-label)]"
      >
        <span class="tabular-nums">
          {{ t('library.manuscript.header.trackCount', { count: formattedTrackCount }) }}
        </span>
        <span class="opacity-40">|</span>
        <span class="tabular-nums tracking-widest">
          {{
            t('library.manuscript.header.folio', {
              current: formattedCurrentFolio,
              total: formattedTotalFolios,
            })
          }}
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.library-archive-header {
  container-type: inline-size;
  container-name: archive-header;
}
</style>
