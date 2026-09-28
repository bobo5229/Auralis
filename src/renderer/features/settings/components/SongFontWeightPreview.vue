<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSongFontWeights } from '@renderer/features/appearance/composables/useSongFontWeights'
import { useCoverArtworkCorners } from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import type { SongFontWeightView } from '@renderer/features/appearance/constants/songFontWeights'

defineProps<{
  view: SongFontWeightView
}>()

const { t } = useI18n()
const { songFontWeightStyle } = useSongFontWeights()
const { coverArtworkRounded, coverArtworkRadius } = useCoverArtworkCorners()
const previewBrand = 'Auralis'
</script>

<template>
  <div class="song-font-preview" :style="songFontWeightStyle">
    <div v-if="view === 'list'" class="song-font-preview-list">
      <div class="song-font-preview-thumb" aria-hidden="true">
        <span class="i-lucide-music text-sm text-[var(--auralis-text-disabled)]"></span>
      </div>
      <span class="song-font-preview-list-title truncate text-sm text-[var(--auralis-text)]">{{
        previewBrand
      }}</span>
      <span
        class="song-font-preview-list-artist truncate text-xs text-[var(--auralis-text-muted)]"
        >{{ previewBrand }}</span
      >
      <span
        class="song-font-preview-list-album truncate text-right text-xs text-[var(--auralis-text-subtle)]"
        >{{ previewBrand }}</span
      >
      <span
        class="song-font-preview-list-duration text-right text-sm text-[var(--auralis-text-faint)] tabular-nums"
        >{{ t('settings.appearance.songFontWeight.sample.duration') }}</span
      >
    </div>

    <div v-else class="song-font-preview-cover">
      <div class="song-font-preview-aside">
        <div
          class="song-font-preview-artwork"
          :style="{ borderRadius: coverArtworkRounded ? `${coverArtworkRadius}px` : '0px' }"
          aria-hidden="true"
        >
          <span class="i-lucide-music text-3xl text-[var(--auralis-text-disabled)]"></span>
        </div>
        <div class="song-font-preview-meta">
          <p class="song-font-preview-album truncate">
            {{ previewBrand }}
          </p>
          <p class="song-font-preview-album-artist truncate">
            {{ previewBrand }}
          </p>
          <p class="song-font-preview-release-date truncate">
            {{ t('settings.appearance.songFontWeight.sample.releaseDate') }}
          </p>
        </div>
      </div>
      <div class="song-font-preview-tracks">
        <div class="song-font-preview-disc">Disc 01</div>
        <div class="song-font-preview-track">
          <span
            class="song-font-preview-track-number text-center text-xs text-[var(--auralis-text-muted)] tabular-nums"
            >{{ t('settings.appearance.songFontWeight.sample.trackNumber') }}</span
          >
          <span class="min-w-0">
            <span
              class="song-font-preview-cover-title block truncate text-sm leading-5 text-[var(--auralis-text)]"
              >{{ previewBrand }}</span
            >
            <span
              class="song-font-preview-cover-artist block truncate text-xs leading-[18px] text-[var(--auralis-text-faint)]"
              >{{ previewBrand }}</span
            >
          </span>
          <span
            class="song-font-preview-genre truncate text-right text-xs text-[var(--auralis-text-muted)]"
            >{{ previewBrand }}</span
          >
          <span
            class="song-font-preview-cover-duration text-right text-xs text-[var(--auralis-text-muted)] tabular-nums"
            >{{ t('settings.appearance.songFontWeight.sample.duration') }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-font-preview {
  container-type: inline-size;
  min-width: 0;
}

.song-font-preview-list {
  display: grid;
  grid-template-columns: 44px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0 10px;
  align-items: center;
  min-height: 44px;
}

.song-font-preview-list > :not(.song-font-preview-list-duration) {
  min-width: 0;
}

.song-font-preview-thumb,
.song-font-preview-artwork {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--auralis-artwork-placeholder-bg);
}

.song-font-preview-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
}

.song-font-preview-list-title {
  font-weight: var(--auralis-song-list-title-weight, 700);
}

.song-font-preview-list-artist {
  font-weight: var(--auralis-song-list-artist-weight, 600);
}

.song-font-preview-list-album {
  font-weight: var(--auralis-song-list-album-weight, 600);
}

.song-font-preview-list-duration {
  font-weight: var(--auralis-song-list-duration-weight, 400);
}

.song-font-preview-cover {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.song-font-preview-artwork {
  width: 120px;
  height: 120px;
  border-radius: 8px;
}

.song-font-preview-aside,
.song-font-preview-tracks {
  min-width: 0;
}

.song-font-preview-album,
.song-font-preview-album-artist,
.song-font-preview-release-date {
  margin: 0;
}

.song-font-preview-album {
  margin-top: 12px;
  color: var(--auralis-text);
  font-size: 16px;
  font-weight: var(--auralis-song-cover-album-weight, 700);
  line-height: 20px;
}

.song-font-preview-album-artist,
.song-font-preview-release-date {
  color: var(--auralis-text-muted);
  font-size: 12px;
  line-height: 20px;
}

.song-font-preview-album-artist {
  font-weight: var(--auralis-song-cover-album-artist-weight, 600);
}

.song-font-preview-release-date {
  font-weight: var(--auralis-song-cover-release-date-weight, 500);
}

.song-font-preview-disc {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  height: 24px;
  margin-top: 8px;
  padding-inline: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.045);
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: var(--auralis-song-cover-disc-heading-weight, 700);
  letter-spacing: 0.06em;
}

.song-font-preview-track {
  display: grid;
  grid-template-columns: 32px minmax(0, 1.4fr) minmax(0, 1fr) 44px;
  column-gap: 12px;
  align-items: center;
  min-height: 48px;
}

.song-font-preview-track-number {
  font-weight: var(--auralis-song-cover-track-number-weight, 400);
}

.song-font-preview-cover-title {
  font-weight: var(--auralis-song-cover-title-weight, 500);
}

.song-font-preview-cover-artist {
  font-weight: var(--auralis-song-cover-artist-weight, 400);
}

.song-font-preview-genre {
  font-weight: var(--auralis-song-cover-genre-weight, 400);
}

.song-font-preview-cover-duration {
  font-weight: var(--auralis-song-cover-duration-weight, 400);
}

@container (max-width: 460px) {
  .song-font-preview-list {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    grid-template-areas:
      'artwork title duration'
      'artwork artist artist'
      'artwork album album';
    row-gap: 2px;
    min-height: 0;
    padding-block: 8px;
  }

  .song-font-preview-thumb {
    grid-area: artwork;
  }

  .song-font-preview-list-title {
    grid-area: title;
  }

  .song-font-preview-list-duration {
    grid-area: duration;
  }

  .song-font-preview-list-artist {
    grid-area: artist;
  }

  .song-font-preview-list-album {
    grid-area: album;
  }

  .song-font-preview-list-artist,
  .song-font-preview-list-album {
    text-align: left;
  }

  .song-font-preview-cover {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
