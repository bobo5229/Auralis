<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyTopAlbum } from '@shared/types/listeningArchive'
import ArchiveAlbumSpines from './ArchiveAlbumSpines.vue'

const props = defineProps<{
  date: string | null
  albums: DailyTopAlbum[]
  loading: boolean
  failed: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
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
  <section
    class="archive-day-albums"
    :aria-label="t('archive.dayAlbumsTitle')"
    :aria-busy="loading"
  >
    <header class="archive-day-albums-header">
      <div class="archive-day-albums-heading">
        <h3 class="archive-day-albums-title auralis-type-control">
          {{ t('archive.dayAlbumsTitle') }}
        </h3>
        <p v-if="date" class="archive-day-albums-date auralis-type-caption">{{ dateLabel }}</p>
      </div>
      <p v-if="date" class="archive-day-albums-hint auralis-type-caption">
        {{ t('archive.dayAlbumsHint') }}
      </p>
    </header>

    <p v-if="!date" class="archive-day-albums-empty auralis-type-caption">
      {{ t('archive.dayAlbumsNoDate') }}
    </p>
    <p v-else-if="loading" class="archive-day-albums-message auralis-type-caption" role="status">
      {{ t('archive.loading') }}
    </p>
    <p v-else-if="failed" class="archive-day-albums-message auralis-type-caption">
      {{ t('archive.dayAlbumsLoadError') }}
      <button type="button" class="archive-day-albums-retry" @click="emit('retry')">
        {{ t('archive.retry') }}
      </button>
    </p>
    <ArchiveAlbumSpines v-else-if="albums.length" :key="date ?? ''" :albums="albums" />
    <p v-else class="archive-day-albums-empty auralis-type-caption">
      {{ t('archive.dayAlbumsEmpty') }}
    </p>
  </section>
</template>

<style scoped>
.archive-day-albums {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--auralis-border-subtle);
}

.archive-day-albums-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-inline: 2px;
}

.archive-day-albums-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
}

.archive-day-albums-title {
  margin: 0;
  color: var(--auralis-text);
  font-weight: 600;
}

.archive-day-albums-date,
.archive-day-albums-hint {
  margin: 0;
  color: var(--auralis-text-muted);
}

.archive-day-albums-hint {
  color: var(--auralis-text-faint);
}

.archive-day-albums-message,
.archive-day-albums-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  margin: 0;
  padding-inline: 2px;
  color: var(--auralis-text-muted);
}

.archive-day-albums-empty {
  justify-content: center;
  min-height: 88px;
  color: var(--auralis-text-faint);
  text-align: center;
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
