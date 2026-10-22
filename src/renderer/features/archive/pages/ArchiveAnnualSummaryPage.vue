<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteUpdate, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { DailyTopAlbum } from '@shared/types/listeningArchive'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { LIBRARY_PLAYLISTS_CHANGED_EVENT } from '@renderer/features/library/utils/libraryRouteScope'
import { useAnnualSummary } from '../composables/useAnnualSummary'
import { useAnnualSummaryActions } from '../composables/useAnnualSummaryActions'
import ArchiveSummaryArtwork from '../components/ArchiveSummaryArtwork.vue'
import ArchiveSummaryAlbums from '../components/ArchiveSummaryAlbums.vue'
import ArchiveSummarySeasons from '../components/ArchiveSummarySeasons.vue'
import { seasonBannerStyle } from '../utils/seasonArtwork'
import '../styles/annualSummary.css'

const props = defineProps<{ year: number }>()
const { t, locale } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const root = ref<HTMLElement | null>(null)
const { summary, loading, failed, refresh } = useAnnualSummary(
  () => props.year,
  auralis.archive,
  auralis.library,
)
const { saving, playing, actionError, unavailableCount, savedPlaylistId, play, save } =
  useAnnualSummaryActions(
    summary,
    auralis.playlists,
    usePlayback(),
    (year) => t('archive.summary.selectionName', { year }),
    () => window.dispatchEvent(new CustomEvent(LIBRARY_PLAYLISTS_CHANGED_EVENT)),
  )
const title = computed(() => t('archive.annualSummaryPageTitle', { year: props.year }))
const number = (value: number) => value.toLocaleString(locale.value)
function date(value: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
const yearPeriod = computed(() => {
  const today = new Date()
  return props.year === today.getFullYear()
    ? t('archive.summary.asOf', {
        date: new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric' }).format(
          today,
        ),
      })
    : t('archive.summary.fullYear')
})
const chapters = computed(() => [
  ...(summary.value?.albums.length ? [{ id: 'albums', label: t('archive.summary.albums') }] : []),
  { id: 'seasons', label: t('archive.summary.seasons') },
  ...(summary.value?.tracks.length ? [{ id: 'voices', label: t('archive.summary.voices') }] : []),
  { id: 'moments', label: t('archive.summary.moments') },
  ...(summary.value?.selection.length
    ? [{ id: 'selection', label: t('archive.summary.selection') }]
    : []),
])
function jump(id: string) {
  const section = root.value?.querySelector<HTMLElement>(`#summary-${id}`)
  section?.scrollIntoView({ block: 'start' })
  const heading = section?.querySelector<HTMLElement>('h2')
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}
const moments = computed(() => {
  const data = summary.value
  if (!data) return []
  const result: {
    key: string
    date: string
    label: string
    heading: string
    detail: string
    album: DailyTopAlbum | null
  }[] = []
  if (data.peakDay)
    result.push({
      key: 'peak',
      date: data.peakDay.date,
      label: t('archive.summary.peakDay'),
      heading: date(data.peakDay.date),
      detail: t('archive.summary.peakPlays', { count: number(data.peakDay.playCount) }),
      album: data.peakDay.album,
    })
  if (data.longestRun && data.longestRun.days > 1)
    result.push({
      key: 'run',
      date: data.longestRun.start,
      label: t('archive.summary.longestRun'),
      heading: t('archive.summary.days', { count: data.longestRun.days }),
      detail: `${date(data.longestRun.start)} — ${date(data.longestRun.end)}`,
      album: null,
    })
  if (data.albums[0])
    result.push({
      key: 'first',
      date: data.albums[0].firstPlayedDate,
      label: t('archive.summary.firstRecord'),
      heading: date(data.albums[0].firstPlayedDate),
      detail: t('archive.summary.firstRecordDetail'),
      album: data.albums[0],
    })
  return result
})
watch(
  () => props.year,
  () => {
    if (root.value) root.value.scrollTop = 0
  },
)
onBeforeRouteUpdate((to) => (Number(to.params.year) < 1900 ? { name: 'archive' } : true))
</script>

<template>
  <section ref="root" class="archive-summary-page" :aria-label="title" :aria-busy="loading">
    <div class="summary-page-content">
      <header class="summary-page-header">
        <RouterLink
          class="summary-back-link"
          :to="{ name: 'archive', query: { year: String(year) } }"
          ><span class="i-lucide-chevron-left" aria-hidden="true"></span
          >{{ t('archive.backToYear', { year }) }}</RouterLink
        >
        <span class="summary-page-label">{{ t('archive.annualSummary') }}</span>
      </header>
      <div v-if="failed" class="summary-load-error" role="alert">
        <p>{{ t('archive.loadError') }}</p>
        <button class="summary-button" type="button" @click="refresh">
          {{ t('archive.retry') }}
        </button>
      </div>
      <div v-if="!summary && loading" class="summary-loading" role="status">
        <span class="i-lucide-disc-3" aria-hidden="true"></span>{{ t('archive.loading') }}
      </div>
      <template v-if="summary">
        <header class="summary-frontispiece" :style="seasonBannerStyle">
          <div class="summary-frontispiece-wash" aria-hidden="true"></div>
          <div class="summary-frontispiece-copy">
            <p class="summary-eyebrow">{{ t('archive.summary.eyebrow') }}</p>
            <h1>
              {{ year }}<span>{{ t('archive.summary.headline') }}</span>
            </h1>
            <p class="summary-period">{{ yearPeriod }}</p>
            <dl v-if="summary.playCount" class="summary-totals">
              <div>
                <dt>{{ t('archive.summary.effectivePlays') }}</dt>
                <dd>{{ number(summary.playCount) }}</dd>
              </div>
              <div>
                <dt>{{ t('archive.summary.listeningDays') }}</dt>
                <dd>{{ number(summary.activeDays) }}</dd>
              </div>
              <div>
                <dt>{{ t('archive.summary.albumsHeard') }}</dt>
                <dd>{{ number(summary.albumCount) }}</dd>
              </div>
            </dl>
            <p v-else class="summary-empty-message">{{ t('archive.summary.emptyYear') }}</p>
          </div>
          <div v-if="summary.albums.length" class="summary-cover-composition" aria-hidden="true">
            <ArchiveSummaryArtwork
              v-for="album in summary.albums.slice(0, 3).reverse()"
              :key="album.key"
              :artwork-key="album.artworkCacheKey"
              eager
            />
          </div>
          <span class="summary-frontispiece-footnote">{{ t('archive.summary.localRecord') }}</span>
        </header>
        <template v-if="summary.playCount">
          <nav class="summary-chapters" :aria-label="t('archive.summary.chapters')">
            <button
              v-for="chapter in chapters"
              :key="chapter.id"
              type="button"
              @click="jump(chapter.id)"
            >
              {{ chapter.label }}
            </button>
          </nav>
          <ArchiveSummaryAlbums :albums="summary.albums" />
          <ArchiveSummarySeasons :summary="summary" />
          <section
            v-if="summary.tracks.length || summary.artists.length"
            id="summary-voices"
            class="summary-chapter"
            aria-labelledby="summary-voices-title"
          >
            <header class="summary-chapter-heading">
              <span class="summary-chapter-number" aria-hidden="true">03</span>
              <div>
                <h2 id="summary-voices-title">{{ t('archive.summary.voices') }}</h2>
                <p>{{ t('archive.summary.voicesIntro') }}</p>
              </div>
            </header>
            <div class="summary-voices">
              <div>
                <h3 class="summary-list-title">{{ t('archive.summary.tracks') }}</h3>
                <ol class="summary-track-list">
                  <li v-for="(track, index) in summary.tracks" :key="track.key">
                    <span class="summary-rank">{{ String(index + 1).padStart(2, '0') }}</span
                    ><ArchiveSummaryArtwork :artwork-key="track.artworkCacheKey" />
                    <div class="summary-track-text">
                      <h4>{{ songText(track.title) || t('archive.unknownTrack') }}</h4>
                      <p>{{ songValues(track.artist) || t('archive.unknownArtist') }}</p>
                      <small
                        >{{ t('archive.playCount', { count: number(track.playCount) })
                        }}<template v-if="!track.playback">
                          · {{ t('archive.summary.unavailable') }}</template
                        ></small
                      >
                    </div>
                    <button
                      class="summary-icon-button"
                      type="button"
                      :disabled="!track.playback || playing"
                      :aria-label="
                        t('archive.summary.playTrack', {
                          title: songText(track.title) || t('archive.unknownTrack'),
                        })
                      "
                      @click="track.playback && play([track.playback])"
                    >
                      <span class="i-lucide-play" aria-hidden="true"></span>
                    </button>
                  </li>
                </ol>
              </div>
              <div>
                <h3 class="summary-list-title">{{ t('archive.summary.artists') }}</h3>
                <ol class="summary-artist-list">
                  <li v-for="(artist, index) in summary.artists" :key="artist.name">
                    <span class="summary-rank">{{ String(index + 1).padStart(2, '0') }}</span>
                    <div class="summary-track-text">
                      <h4>{{ songText(artist.name) }}</h4>
                      <p>{{ t('archive.playCount', { count: number(artist.playCount) }) }}</p>
                    </div>
                    <div class="summary-artist-covers">
                      <component
                        :is="album.available ? RouterLink : 'span'"
                        v-for="album in artist.albums"
                        :key="album.key"
                        :title="songText(album.album)"
                        :aria-label="songText(album.album)"
                        :to="
                          album.available
                            ? {
                                name: 'album-detail',
                                query: {
                                  artist: album.albumArtist || 'Unknown Artist',
                                  title: album.album,
                                },
                              }
                            : undefined
                        "
                        ><ArchiveSummaryArtwork :artwork-key="album.artworkCacheKey"
                      /></component>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
            <p v-if="actionError === 'play'" class="summary-action-error" role="alert">
              {{ t('archive.summary.playFailed') }}
            </p>
          </section>
          <section
            v-if="moments.length"
            id="summary-moments"
            class="summary-chapter"
            aria-labelledby="summary-moments-title"
          >
            <header class="summary-chapter-heading">
              <span class="summary-chapter-number" aria-hidden="true">04</span>
              <div>
                <h2 id="summary-moments-title">{{ t('archive.summary.moments') }}</h2>
                <p>{{ t('archive.summary.momentsIntro') }}</p>
              </div>
            </header>
            <div class="summary-moments">
              <RouterLink
                v-for="moment in moments"
                :key="moment.key"
                class="summary-moment"
                :to="{ name: 'archive', query: { year: String(year), date: moment.date } }"
                ><p class="summary-eyebrow">{{ moment.label }}</p>
                <h3>{{ moment.heading }}</h3>
                <p>{{ moment.detail }}</p>
                <div v-if="moment.album" class="summary-moment-album">
                  <ArchiveSummaryArtwork :artwork-key="moment.album.artworkCacheKey" /><span>{{
                    songText(moment.album.album)
                  }}</span>
                </div>
                <span v-else class="summary-run-mark" aria-hidden="true"
                  ><i v-for="i in Math.min(summary.longestRun?.days ?? 0, 14)" :key="i"></i></span
                ><span class="summary-text-link"
                  >{{ t('archive.summary.returnToDay')
                  }}<span class="i-lucide-arrow-up-right" aria-hidden="true"></span></span
              ></RouterLink>
            </div>
          </section>
          <section
            v-if="summary.selection.length"
            id="summary-selection"
            class="summary-chapter summary-selection"
            aria-labelledby="summary-selection-title"
          >
            <div class="summary-selection-sleeve" :style="seasonBannerStyle" aria-hidden="true">
              <div class="summary-selection-covers">
                <ArchiveSummaryArtwork
                  v-for="track in summary.selection.slice(0, 4)"
                  :key="track.id"
                  :artwork-key="track.artworkCacheKey"
                />
              </div>
              <span>{{ year }}</span>
            </div>
            <div class="summary-selection-copy">
              <p class="summary-eyebrow">
                {{ t('archive.summary.selection') }} ·
                {{ t('archive.summary.trackCount', { count: summary.selection.length }) }}
              </p>
              <h2 id="summary-selection-title">{{ t('archive.summary.selectionHeadline') }}</h2>
              <p>{{ t('archive.summary.selectionIntro') }}</p>
              <div class="summary-selection-actions">
                <button
                  class="summary-button summary-button-primary"
                  type="button"
                  :disabled="playing"
                  @click="play(summary.selection)"
                >
                  <span class="i-lucide-play" aria-hidden="true"></span
                  >{{ t('archive.summary.playSelection') }}</button
                ><RouterLink
                  v-if="savedPlaylistId"
                  class="summary-button"
                  :to="{ name: 'playlist', params: { id: savedPlaylistId } }"
                  ><span class="i-lucide-check" aria-hidden="true"></span
                  >{{ t('archive.summary.openSaved') }}</RouterLink
                ><button
                  v-else
                  class="summary-button"
                  type="button"
                  :disabled="saving"
                  @click="save"
                >
                  <span class="i-lucide-list-plus" aria-hidden="true"></span
                  >{{ saving ? t('archive.summary.saving') : t('archive.summary.saveSelection') }}
                </button>
              </div>
              <p v-if="actionError === 'save'" class="summary-action-error" role="alert">
                {{ t('archive.summary.saveFailed') }}
              </p>
              <p v-if="unavailableCount" class="summary-note" role="status">
                {{ t('archive.summary.skippedTracks', { count: unavailableCount }) }}
              </p>
            </div>
          </section>
          <p v-else class="summary-note summary-no-selection">
            {{ t('archive.summary.noPlayableTracks') }}
          </p>
        </template>
        <footer class="summary-footer">
          <span>Auralis · {{ year }}</span>
          <p>{{ t('archive.summary.recordNote') }}</p>
          <RouterLink
            class="summary-text-link"
            :to="{ name: 'archive', query: { year: String(year) } }"
            >{{ t('archive.backToYear', { year })
            }}<span class="i-lucide-arrow-up-right" aria-hidden="true"></span
          ></RouterLink>
        </footer>
      </template>
    </div>
  </section>
</template>
