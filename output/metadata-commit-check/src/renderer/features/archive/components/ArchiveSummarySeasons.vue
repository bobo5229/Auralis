<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AnnualSummary } from '@shared/types/listeningArchive'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import ArchiveSummaryArtwork from './ArchiveSummaryArtwork.vue'

const props = defineProps<{ summary: AnnualSummary }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const selectedMonth = ref<number | null>(null)
const root = ref<HTMLElement | null>(null)
async function closeMonth() {
  const month = selectedMonth.value
  selectedMonth.value = null
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>(`[data-month="${month}"]`)?.focus()
}
const monthDetail = computed(() =>
  props.summary.months.find((month) => month.month === selectedMonth.value),
)
const seasonNames = ['spring', 'summer', 'autumn', 'winter'] as const
watch(
  () => props.summary.year,
  () => {
    selectedMonth.value = null
  },
)
</script>

<template>
  <section
    id="summary-seasons"
    ref="root"
    class="summary-chapter"
    aria-labelledby="summary-seasons-title"
  >
    <header class="summary-chapter-heading">
      <span class="summary-chapter-number" aria-hidden="true">02</span>
      <div>
        <h2 id="summary-seasons-title">{{ t('archive.summary.seasons') }}</h2>
        <p>{{ t('archive.summary.seasonsIntro') }}</p>
      </div>
    </header>
    <div class="summary-seasons">
      <article
        v-for="(season, index) in summary.seasons"
        :key="index"
        class="summary-season"
        :class="`summary-season-${seasonNames[index]}`"
      >
        <header>
          <h3>{{ t(`archive.summary.${seasonNames[index]}`) }}</h3>
          <span>{{ t(`archive.summary.${seasonNames[index]}Months`) }}</span>
        </header>
        <ArchiveSummaryArtwork
          :artwork-key="season.album?.artworkCacheKey ?? null"
          class="summary-season-cover"
        />
        <div class="summary-season-caption">
          <h4>
            {{ season.album ? songText(season.album.album) : t('archive.summary.quietSeason') }}
          </h4>
          <p v-if="season.album">
            {{ songValues(season.album.albumArtist) || t('archive.unknownArtist') }}
          </p>
        </div>
        <div class="summary-season-months">
          <button
            v-for="month in season.months"
            :key="month"
            :data-month="month"
            type="button"
            :aria-expanded="selectedMonth === month"
            aria-controls="summary-month-detail"
            :class="{ 'is-selected': selectedMonth === month }"
            @click="selectedMonth = selectedMonth === month ? null : month"
          >
            <ArchiveSummaryArtwork
              :artwork-key="summary.months[month - 1]?.albums[0]?.artworkCacheKey ?? null"
            />
            <span>{{ t('archive.summary.month', { month }) }}</span>
          </button>
        </div>
      </article>
    </div>
    <div
      v-if="monthDetail"
      id="summary-month-detail"
      class="summary-month-detail"
      @keydown.esc.stop="closeMonth"
    >
      <header>
        <h3>
          {{ t('archive.summary.monthTitle', { year: summary.year, month: monthDetail.month }) }}
        </h3>
        <span>{{ t('archive.playCount', { count: monthDetail.playCount }) }}</span
        ><button
          class="summary-icon-button"
          type="button"
          :aria-label="t('archive.summary.closeMonth')"
          @click="closeMonth"
        >
          <span class="i-lucide-x" aria-hidden="true"></span>
        </button>
      </header>
      <div v-if="monthDetail.albums.length" class="summary-month-albums">
        <component
          :is="album.available ? RouterLink : 'div'"
          v-for="album in monthDetail.albums"
          :key="album.key"
          class="summary-month-album"
          :to="
            album.available
              ? {
                  name: 'album-detail',
                  query: { artist: album.albumArtist || 'Unknown Artist', title: album.album },
                }
              : undefined
          "
        >
          <ArchiveSummaryArtwork :artwork-key="album.artworkCacheKey" />
          <div>
            <h4>{{ songText(album.album) }}</h4>
            <p>{{ songValues(album.albumArtist) || t('archive.unknownArtist') }}</p>
            <small>{{
              t('archive.playCount', { count: album.monthlyPlays[monthDetail.month - 1] })
            }}</small>
          </div>
        </component>
      </div>
      <p v-else class="summary-note">{{ t('archive.summary.quietMonth') }}</p>
    </div>
  </section>
</template>
