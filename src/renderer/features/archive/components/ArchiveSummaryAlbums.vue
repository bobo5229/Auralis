<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AnnualAlbum } from '@shared/types/listeningArchive'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import ArchiveAlbumSpines from './ArchiveAlbumSpines.vue'
import ArchiveSummaryArtwork from './ArchiveSummaryArtwork.vue'

const props = defineProps<{ albums: AnnualAlbum[] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const selectedKey = ref<string | null>(null)
const selected = computed(
  () => props.albums.find((album) => album.key === selectedKey.value) ?? props.albums[0],
)
const rank = computed(() => props.albums.indexOf(selected.value) + 1)
const maximum = computed(() => Math.max(1, ...(selected.value?.monthlyPlays ?? [])))
watch(
  () => props.albums,
  () => {
    if (!props.albums.some((album) => album.key === selectedKey.value)) selectedKey.value = null
  },
)
</script>

<template>
  <section
    v-if="selected"
    id="summary-albums"
    class="summary-chapter"
    aria-labelledby="summary-albums-title"
  >
    <header class="summary-chapter-heading">
      <span class="summary-chapter-number" aria-hidden="true">01</span>
      <div>
        <h2 id="summary-albums-title">{{ t('archive.summary.albums') }}</h2>
        <p>{{ t('archive.summary.albumsIntro') }}</p>
      </div>
    </header>
    <div class="summary-album-feature">
      <div class="summary-jewel-case" aria-hidden="true">
        <div class="summary-jewel-tray"><span class="summary-jewel-disc"></span></div>
        <ArchiveSummaryArtwork
          :artwork-key="selected.artworkCacheKey"
          eager
          class="summary-jewel-cover"
        />
      </div>
      <div class="summary-album-story">
        <p class="summary-eyebrow">
          {{ t('archive.summary.albumRank', { rank: String(rank).padStart(2, '0') }) }}
        </p>
        <h3>{{ songText(selected.album) }}</h3>
        <p class="summary-artist">
          {{ songValues(selected.albumArtist) || t('archive.unknownArtist') }}
        </p>
        <p class="summary-album-count">
          {{ t('archive.playCount', { count: selected.playCount.toLocaleString() })
          }}<span>
            · {{ t('archive.summary.recordedTracks', { count: selected.trackCount }) }}</span
          >
        </p>
        <div
          class="summary-month-bars"
          role="img"
          :aria-label="t('archive.summary.monthDistribution')"
        >
          <div
            v-for="(count, index) in selected.monthlyPlays"
            :key="index"
            class="summary-month-bar"
            :title="t('archive.summary.monthPlays', { month: index + 1, count })"
          >
            <span
              :style="{ height: `${count ? Math.max(6, (count / maximum) * 100) : 2}%` }"
              :class="{ 'has-plays': count > 0 }"
            ></span>
            <small>{{ index + 1 }}</small>
          </div>
        </div>
        <RouterLink
          v-if="selected.available"
          class="summary-text-link"
          :to="{
            name: 'album-detail',
            query: { artist: selected.albumArtist || 'Unknown Artist', title: selected.album },
          }"
        >
          {{ t('archive.summary.browseAlbum')
          }}<span class="i-lucide-arrow-up-right" aria-hidden="true"></span>
        </RouterLink>
        <p v-else class="summary-note">{{ t('archive.summary.historical') }}</p>
      </div>
    </div>
    <ArchiveAlbumSpines
      v-if="albums.length > 1"
      :albums="albums"
      @select="selectedKey = albums[$event]?.key ?? null"
    />
  </section>
</template>
