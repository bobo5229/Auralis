<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LibraryPresentation } from '../types/libraryPresentation'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { formatArtist } from '../utils/formatArtist'
import { formatCatalogNumber } from '../constants/libraryArchivePresentation'
import AlbumCoverTrackRow from './AlbumCoverTrackRow.vue'
import LibraryArtworkPlaceholder from './LibraryArtworkPlaceholder.vue'

const props = withDefaults(
  defineProps<{
    group: LibraryAlbumGroup
    nowPlayingTrackId?: number | null
    isPlaying?: boolean
    groupIndex?: number
    totalGroups?: number
    selectedTrackId?: number | null
    focusedTrackId?: number | null
    presentation?: LibraryPresentation
  }>(),
  {
    nowPlayingTrackId: null,
    isPlaying: false,
    groupIndex: 0,
    totalGroups: 0,
    selectedTrackId: null,
    focusedTrackId: null,
    presentation: 'modern',
  },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focusTrack: [trackId: number]
  openTrackContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
  openAlbumArtworkContextMenu: [
    anchorTrackId: number,
    event: MouseEvent,
    openReason?: 'pointer' | 'keyboard',
  ]
}>()

const { t } = useI18n()
const imgError = ref(false)

watch(
  () => props.group.artworkCacheKey,
  () => {
    imgError.value = false
  },
)

const hasPlayingTrack = computed(() =>
  props.group.tracks.some((tr) => tr.id === props.nowPlayingTrackId),
)

const isGroupPlaying = computed(() => hasPlayingTrack.value && props.isPlaying)

function onArtworkContextMenu(event: MouseEvent): void {
  const anchorTrackId = props.group.tracks[0]?.id
  if (anchorTrackId != null) {
    emit('openAlbumArtworkContextMenu', anchorTrackId, event, 'pointer')
  }
}

function onArtworkKeyDown(event: KeyboardEvent): void {
  if (
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'ContextMenu' ||
    (event.key === 'F10' && event.shiftKey)
  ) {
    event.preventDefault()
    event.stopPropagation()
    const firstTrackId = props.group.tracks[0]?.id
    if (!firstTrackId) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const fakeEvent = new MouseEvent('contextmenu', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    })
    emit('openAlbumArtworkContextMenu', firstTrackId, fakeEvent, 'keyboard')
  }
}
</script>

<template>
  <div
    class="album-cover-group relative"
    :class="{ 'album-cover-group--manuscript': presentation === 'manuscript' }"
    :data-album-key="group.key"
  >
    <!-- Manuscript Header Bar (Positioned inside top 28px margin without altering layout flow) -->
    <div
      v-if="presentation === 'manuscript'"
      class="album-catalog-header-bar select-none absolute left-0 right-0 top-1.5 flex h-5.5 items-center pointer-events-none z-10"
    >
      <div
        class="catalog-header-aside flex w-[var(--library-cover-artwork-size)] items-center justify-between font-[var(--manuscript-font-numeric)] text-[11px] text-[var(--manuscript-content-ledger-label)]"
      >
        <span class="tabular-nums font-bold">
          {{
            t('library.manuscript.catalog.number', {
              number: formatCatalogNumber(groupIndex, totalGroups),
              count: group.tracks.length,
            })
          }}
        </span>
        <span
          v-if="hasPlayingTrack"
          class="manuscript-status-stamp pointer-events-none rounded-[var(--manuscript-radius-control-inner)] border border-[var(--manuscript-content-stamp)] bg-[var(--manuscript-surface-stamp)] px-1 py-0.2 font-[var(--manuscript-font-ui)] text-[10px] font-bold text-[var(--manuscript-content-stamp)]"
        >
          {{
            isGroupPlaying
              ? t('library.manuscript.status.playing')
              : t('library.manuscript.status.paused')
          }}
        </span>
      </div>

      <div
        class="catalog-header-tracks ml-[var(--library-cover-group-gap,3rem)] grid flex-1 grid-cols-[40px_minmax(0,1.4fr)_minmax(110px,1fr)_48px] gap-x-3 px-3 font-[var(--manuscript-font-numeric)] text-[11px] tracking-wider text-[var(--manuscript-content-ledger-label)]"
      >
        <span class="block w-full text-right font-mono">NO.</span>
        <span class="pl-1">TITLE</span>
        <span class="catalog-field-genre text-right font-mono">GENRE</span>
        <span class="block w-full text-right font-mono">TIME</span>
      </div>
    </div>

    <div class="album-cover-aside">
      <div
        class="album-cover-artwork select-none"
        :aria-label="
          t('library.a11y.albumArtwork', {
            album: group.album || t('library.manuscript.missing.album'),
          })
        "
        @contextmenu.prevent="onArtworkContextMenu"
        @keydown="onArtworkKeyDown"
      >
        <img
          v-if="getArtworkUrl(group.artworkCacheKey) && !imgError"
          :src="getArtworkUrl(group.artworkCacheKey)!"
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable="false"
          @error="imgError = true"
        />
        <LibraryArtworkPlaceholder
          v-else-if="presentation === 'manuscript'"
          size="catalog"
          class="h-full w-full"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
        >
          <span class="i-lucide-music text-3xl text-[var(--auralis-text-disabled)]"></span>
        </div>
      </div>

      <div class="album-cover-meta min-w-0">
        <p
          class="album-cover-meta-title truncate"
          :title="
            group.album ||
            (presentation === 'manuscript' ? t('library.manuscript.missing.album') : '')
          "
        >
          {{
            group.album ||
            (presentation === 'manuscript' ? t('library.manuscript.missing.album') : '')
          }}
        </p>
        <p
          class="album-cover-meta-line flex items-center justify-between gap-2 min-w-0"
          :title="
            (group.albumArtist ||
              (presentation === 'manuscript' ? t('library.manuscript.missing.artist') : '')) +
            (!group.releaseDate && presentation === 'manuscript'
              ? ` • ${t('library.manuscript.missing.date')}`
              : '')
          "
        >
          <span class="truncate">
            {{
              formatArtist(group.albumArtist) ||
              (presentation === 'manuscript' ? t('library.manuscript.missing.artist') : '')
            }}
          </span>
          <span
            v-if="!group.releaseDate && presentation === 'manuscript'"
            class="shrink-0 text-xs font-normal opacity-60 ml-auto"
          >
            {{ t('library.manuscript.missing.date') }}
          </span>
        </p>
        <p v-if="group.releaseDate" class="album-cover-meta-line album-cover-meta-date truncate">
          {{ group.releaseDate }}
        </p>
      </div>
    </div>

    <div class="album-cover-tracks">
      <AlbumCoverTrackRow
        v-for="(track, trackIdx) in group.tracks"
        :key="track.id"
        :track="track"
        :now-playing="nowPlayingTrackId === track.id"
        :is-playing="isPlaying"
        :selected="selectedTrackId === track.id"
        :focused="focusedTrackId === track.id"
        :index="trackIdx"
        :presentation="presentation"
        @select="emit('select', $event)"
        @play="emit('play', $event)"
        @focus="emit('focusTrack', $event)"
        @open-context-menu="
          (trackId, event, openReason) => emit('openTrackContextMenu', trackId, event, openReason)
        "
      />
    </div>
  </div>
</template>

<style scoped>
.album-cover-meta-date {
  font-weight: 500;
}

/* 左右列顶对齐：组高仍由虚拟列表按 max(封面, 曲目) 分配，面板不随组高 stretch */
.album-cover-group {
  align-items: start;
}

/* 复用专辑详情曲目列表面板壳；高度随内容收缩，少曲目时不留空壳。
 * padding / border-width 消费 libraryLayoutMetrics 注入的 --library-*，
 * 与 getAlbumGroupEstimatedHeight 同一事实源（Phase 6 REVIEW Finding 1）。 */
.album-cover-tracks {
  box-sizing: border-box;
  align-self: start;
  width: 100%;
  height: fit-content;
  min-width: 0;
  background: var(--auralis-track-list-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: var(--library-cover-panel-border-width) solid var(--auralis-track-list-border);
  border-radius: 20px;
  padding: var(--library-cover-panel-padding-block-side);
  box-shadow:
    0 12px 36px 0 rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
</style>
