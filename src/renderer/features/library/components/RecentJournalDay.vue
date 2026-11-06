<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import AlbumCard from '@renderer/shared/components/AlbumCard.vue'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { journalDayKey, type JournalDay } from '../utils/recentAddedJournal'
import RecentJournalTracks from './RecentJournalTracks.vue'

const props = defineProps<{
  day: JournalDay
  now: number
  currentTrackId: number | null
  isPlaying: boolean
}>()
defineEmits<{
  open: [album: AlbumSummary]
  playAlbum: [album: AlbumSummary]
  playTrack: [track: TrackListItem]
}>()
const { t, locale } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
function artistLabel(value: string): string {
  return value === 'Unknown Artist' ? t('library.missing.artist') : songValues(value)
}
const albumLimit = ref(12)
const additionLimit = ref(4)
const failedImages = ref(new Set<string>())
watch(
  () => props.day,
  () => {
    failedImages.value = new Set()
  },
)
const fullDate = computed(() =>
  props.day.date === null
    ? t('library.journal.undated')
    : new Intl.DateTimeFormat(locale.value, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }).format(props.day.date),
)
const dayLabel = computed(() => {
  if (props.day.date === null) return t('library.journal.undated')
  if (props.day.key === journalDayKey(props.now)) return t('library.journal.today')
  const yesterday = new Date(props.now)
  yesterday.setDate(yesterday.getDate() - 1)
  return props.day.key === journalDayKey(yesterday.getTime())
    ? t('library.journal.yesterday')
    : new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(props.day.date)
})
</script>

<template>
  <section class="journal-day" :data-journal-day="day.key" :aria-label="fullDate" tabindex="-1">
    <div class="journal-date" :title="fullDate">
      <span>{{ dayLabel }}</span
      ><template v-if="day.date !== null"
        ><strong>{{ new Date(day.date).getDate().toString().padStart(2, '0') }}</strong
        ><span>{{
          new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(day.date)
        }}</span></template
      >
    </div>
    <div class="journal-day-content">
      <article v-if="day.albums.length" class="journal-entry">
        <div class="journal-albums">
          <AlbumCard
            v-for="entry in day.albums.slice(0, albumLimit)"
            :key="entry.album.key"
            :album="entry.album"
            @open="$emit('open', entry.album)"
            @play="$emit('playAlbum', entry.album)"
          />
        </div>
        <button
          v-if="day.albums.length > albumLimit"
          type="button"
          class="journal-link journal-expand"
          @click="albumLimit += 24"
        >
          {{ t('library.journal.moreAlbums', { count: day.albums.length - albumLimit })
          }}<span class="i-lucide-chevron-down" aria-hidden="true"></span>
        </button>
      </article>
      <article
        v-for="entry in day.additions.slice(0, additionLimit)"
        :key="entry.album.key"
        class="journal-entry journal-addition"
      >
        <button type="button" class="journal-album-summary" @click="$emit('open', entry.album)">
          <span class="journal-thumbnail"
            ><img
              v-if="entry.album.artworkCacheKey && !failedImages.has(entry.album.artworkCacheKey)"
              :src="getArtworkUrl(entry.album.artworkCacheKey)!"
              alt=""
              loading="lazy"
              @error="failedImages.add(entry.album.artworkCacheKey!)" /><span
              v-else
              class="i-lucide-disc-3"
              aria-hidden="true"
            ></span
          ></span>
          <span class="journal-summary-copy"
            ><strong :title="songText(entry.album.title)">{{ songText(entry.album.title) }}</strong
            ><span :title="artistLabel(entry.album.albumArtist)">{{
              artistLabel(entry.album.albumArtist)
            }}</span></span
          ><span class="i-lucide-arrow-up-right" aria-hidden="true"></span>
        </button>
        <RecentJournalTracks
          :tracks="entry.tracks"
          :current-track-id="currentTrackId"
          :is-playing="isPlaying"
          @play="$emit('playTrack', $event)"
        />
      </article>
      <button
        v-if="day.additions.length > additionLimit"
        type="button"
        class="journal-link journal-expand"
        @click="additionLimit += 8"
      >
        {{ t('library.journal.moreRecords', { count: day.additions.length - additionLimit })
        }}<span class="i-lucide-chevron-down" aria-hidden="true"></span>
      </button>
      <article v-if="day.looseTracks.length" class="journal-entry journal-addition">
        <header>
          <h2>{{ t('library.journal.looseTracks') }}</h2>
        </header>
        <RecentJournalTracks
          :tracks="day.looseTracks"
          :current-track-id="currentTrackId"
          :is-playing="isPlaying"
          @play="$emit('playTrack', $event)"
        />
      </article>
    </div>
  </section>
</template>

<style scoped>
.journal-day {
  --journal-leading-width: 48px;
  --journal-row-gap: 14px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 24px;
  scroll-margin-top: 20px;
  outline: none;
}
.journal-date {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding-top: 2px;
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.journal-date > span:first-child {
  color: var(--auralis-theme-accent);
}
/* Calendar numerals are a display role; ordinary text uses the shared typography scale. */
.journal-date strong {
  font-size: 40px;
  line-height: 48px;
  font-weight: 400;
  letter-spacing: -1px;
  color: var(--auralis-text);
  font-variant-numeric: tabular-nums;
}
.journal-day-content {
  min-width: 0;
  padding: 0 0 36px 28px;
  border-left: 1px solid var(--auralis-border-subtle);
}
.journal-entry {
  position: relative;
}
.journal-entry::before {
  content: '';
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--auralis-theme-accent);
  left: -32px;
  top: 10px;
}
.journal-addition::before {
  background: var(--album-surface-color, var(--auralis-main-bg));
  border: 1px solid var(--auralis-theme-accent);
  box-sizing: border-box;
}
.journal-day-content > .journal-entry:not(:first-child) {
  margin-top: 30px;
}
.journal-entry header {
  margin-bottom: 20px;
}
h2 {
  margin: 0;
}
h2 {
  font-size: var(--auralis-type-section-size);
  line-height: var(--auralis-type-section-line-height);
  font-weight: 500;
}
.journal-albums {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 24px;
}
button {
  font: inherit;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}
.journal-link {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 6px 0;
  margin-top: 18px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.journal-link:hover {
  color: var(--auralis-text);
}
.journal-expand {
  margin-left: auto;
}
.journal-album-summary {
  display: flex;
  align-items: center;
  gap: var(--journal-row-gap);
  width: 100%;
  margin-bottom: 12px;
  padding: 6px 0;
  text-align: left;
  border-radius: 8px;
}
.journal-thumbnail {
  width: var(--journal-leading-width);
  height: var(--journal-leading-width);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: var(--auralis-control-hover-bg);
  border-radius: var(--auralis-artwork-radius-thumbnail, 4px);
  overflow: hidden;
}
.journal-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.journal-thumbnail > span {
  font-size: 24px;
  color: var(--auralis-text-faint);
}
.journal-summary-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}
.journal-summary-copy strong {
  font-weight: 500;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.journal-summary-copy > span {
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.journal-summary-copy > * {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-album-summary > span:last-child {
  color: var(--auralis-text-faint);
}
@container (max-width: 700px) {
  .journal-day {
    grid-template-columns: 66px minmax(0, 1fr);
    gap: 16px;
  }
  .journal-day-content {
    padding-left: 20px;
  }
  .journal-entry::before {
    left: -24px;
  }
  .journal-albums {
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 20px;
  }
}
@container (max-width: 450px) {
  .journal-day {
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
  }
  .journal-date strong {
    font-size: 32px;
    line-height: 40px;
  }
}
</style>
