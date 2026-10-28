<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyPlayCount, DailyTopAlbum } from '@shared/types/listeningArchive'
import ArchiveAlbumSpines from './ArchiveAlbumSpines.vue'
import ArchiveDayTracks from './ArchiveDayTracks.vue'

const props = defineProps<{
  date: string | null
  albums: DailyTopAlbum[]
  loading: boolean
  failed: boolean
  daySummary?: DailyPlayCount
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
const sectionId = useId()
const dateNumber = computed(() => props.date?.slice(5).replace('-', '.') ?? '')
const weekday = computed(() =>
  props.date
    ? new Intl.DateTimeFormat(locale.value, {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${props.date}T00:00:00Z`))
    : '',
)
const dateLabel = computed(() => {
  if (!props.date) return ''
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${props.date}T00:00:00Z`))
})
</script>

<template>
  <section class="archive-day-albums" :aria-label="dateLabel || t('archive.title')">
    <header class="archive-day-albums-header">
      <div v-if="date" :key="date" class="archive-day-date-block" aria-live="polite">
        <time :datetime="date" :aria-label="dateLabel" class="archive-day-date-number">{{
          dateNumber
        }}</time>
        <div class="archive-day-date-context auralis-type-caption">
          <span>{{ weekday }}</span
          ><span>{{ date.slice(0, 4) }}</span>
        </div>
      </div>
    </header>

    <div class="archive-day-content">
      <section class="archive-day-albums-panel" :aria-labelledby="sectionId + '-albums'">
        <h3 :id="sectionId + '-albums'" class="archive-day-section-title auralis-type-control">
          {{ t('archive.dayAlbumsTitle') }}
        </h3>
        <div class="archive-day-album-stage" :aria-busy="loading">
          <p v-if="!date" class="archive-day-albums-empty auralis-type-caption">
            {{ t('archive.dayAlbumsNoDate') }}
          </p>
          <ArchiveAlbumSpines v-else-if="albums.length" :key="date ?? ''" :albums="albums" />
          <p
            v-else-if="loading"
            class="archive-day-albums-message auralis-type-caption"
            role="status"
          >
            {{ t('archive.loading') }}
          </p>
          <p v-else-if="!failed" class="archive-day-albums-empty auralis-type-caption">
            {{ t('archive.dayAlbumsEmpty') }}
          </p>
          <p
            v-if="date && failed"
            class="archive-day-albums-message auralis-type-caption"
            role="status"
          >
            {{ t('archive.dayAlbumsLoadError') }}
            <button type="button" class="archive-day-albums-retry" @click="emit('retry')">
              {{ t('archive.retry') }}
            </button>
          </p>
        </div>
      </section>
      <section
        v-if="date"
        class="archive-day-tracks-panel"
        :aria-labelledby="sectionId + '-tracks'"
      >
        <h3 :id="sectionId + '-tracks'" class="archive-day-section-title auralis-type-control">
          {{ t('archive.dayTracks') }}
        </h3>
        <ArchiveDayTracks :date="date" :day-summary="daySummary" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.archive-day-albums {
  margin-top: 28px;
  padding-top: 28px;
  border-top: 1px solid var(--auralis-border-subtle);
  container-type: inline-size;
}

.archive-day-albums-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
  flex-wrap: wrap;
  min-height: 48px;
  margin-bottom: 24px;
  padding-inline: 2px;
}

.archive-day-section-title {
  margin: 0;
  color: var(--auralis-text);
  font-weight: 600;
}

.archive-day-date-block {
  display: flex;
  align-items: center;
  gap: 16px;
  animation: archive-day-reveal 180ms ease-out;
}
.archive-day-date-number {
  /* The date is this section's display anchor, using the shared hero scale. */
  font-size: var(--auralis-type-hero-title-size);
  line-height: var(--auralis-type-hero-title-line-height);
  font-weight: 500;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.archive-day-date-context {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--auralis-text-muted);
}
.archive-day-date-context > span:last-child {
  color: var(--auralis-text-faint);
}
.archive-day-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.archive-day-albums-panel,
.archive-day-tracks-panel {
  min-width: 0;
}
.archive-day-tracks-panel {
  padding-top: 20px;
  border-top: 1px solid var(--auralis-border-subtle);
}
.archive-day-album-stage {
  min-height: 390px;
}
.archive-day-album-stage > .archive-album-spines {
  animation: archive-day-reveal 180ms ease-out;
}

.archive-day-albums-message,
.archive-day-albums-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 160px;
  margin: 0;
  padding-inline: 2px;
  color: var(--auralis-text-muted);
}

.archive-day-albums-empty {
  justify-content: center;
  min-height: 240px;
  color: var(--auralis-text-faint);
  text-align: center;
}
@keyframes archive-day-reveal {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@container (max-width: 520px) {
  .archive-day-date-block {
    gap: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .archive-day-date-block,
  .archive-day-album-stage > .archive-album-spines {
    animation: none;
  }
}
:where([data-reduced-motion='true']) .archive-day-date-block,
:where([data-reduced-motion='true']) .archive-day-album-stage > .archive-album-spines {
  animation: none;
}

.archive-day-albums-retry {
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--auralis-theme-accent);
  font: inherit;
  cursor: pointer;
}

.archive-day-albums-retry:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
</style>
