<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist, SmartPlaylistRuleCondition } from '@shared/types/smartPlaylist'
import { auralis } from '@renderer/shared/ipc/client'
import {
  buildFacetOptions,
  getFacetValues,
  matchesFacet,
  type FacetOption,
} from '../utils/facetOptions'

const { t } = useI18n()

type FacetKind = 'genre' | 'albumArtist' | 'album'

interface FacetContextMenuState {
  kind: Exclude<FacetKind, 'album'>
  option: FacetOption
  x: number
  y: number
}

const props = withDefaults(
  defineProps<{
    open: boolean
  }>(),
  {},
)

const emit = defineEmits<{
  close: []
  created: [playlist: SmartPlaylist]
}>()

const collator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(false)
const selectedGenre = ref<string | null>(null)
const selectedAlbumArtist = ref<string | null>(null)
const selectedAlbumKey = ref<string | null>(null)
const contextMenu = ref<FacetContextMenuState | null>(null)
let unsubscribeChanged: (() => void) | null = null

function getAlbumArtists(track: TrackListItem): Array<string | null> {
  return getFacetValues(track, 'albumArtist')
}

function getAlbumTitle(track: TrackListItem): string {
  return track.album?.trim() || t('facets.unknownAlbum')
}

function getAlbumKey(albumArtist: string | null, album: string): string {
  return `${albumArtist ?? ''}\u0000${album}`
}

function matchesGenre(track: TrackListItem): boolean {
  const selected = activeGenreOption.value
  return selected ? matchesFacet(track, 'genre', selected.key) : true
}

function matchesAlbumArtist(track: TrackListItem): boolean {
  const selected = activeAlbumArtistOption.value
  return selected ? matchesFacet(track, 'albumArtist', selected.key) : true
}

const genreOptions = computed<FacetOption[]>(() =>
  buildFacetOptions(tracks.value, 'genre', t('facets.unknownGenre')),
)
const activeGenreOption = computed(() =>
  selectedGenre.value
    ? genreOptions.value.find((option) => option.key === selectedGenre.value)
    : undefined,
)

const albumArtistOptions = computed<FacetOption[]>(() =>
  buildFacetOptions(tracks.value.filter(matchesGenre), 'albumArtist', t('facets.unknownArtist')),
)
const activeAlbumArtistOption = computed(() =>
  selectedAlbumArtist.value
    ? albumArtistOptions.value.find((option) => option.key === selectedAlbumArtist.value)
    : undefined,
)

const albumOptions = computed<FacetOption[]>(() => {
  const counts = new Map<string, FacetOption>()

  for (const track of tracks.value) {
    if (!matchesGenre(track) || !matchesAlbumArtist(track)) continue

    const album = getAlbumTitle(track)
    for (const albumArtist of getAlbumArtists(track)) {
      const key = getAlbumKey(albumArtist, album)
      const existing = counts.get(key)

      if (existing) {
        existing.trackCount += 1
      } else {
        counts.set(key, { key, label: album, value: album, trackCount: 1 })
      }
    }
  }

  return [...counts.values()].sort((left, right) => collator.compare(left.label, right.label))
})

function selectFacet(kind: FacetKind, key: string): void {
  if (kind === 'genre') {
    const next = selectedGenre.value === key ? null : key
    selectedGenre.value = next
    selectedAlbumArtist.value = null
    selectedAlbumKey.value = null
    return
  }

  if (kind === 'albumArtist') {
    const next = selectedAlbumArtist.value === key ? null : key
    selectedAlbumArtist.value = next
    selectedAlbumKey.value = null
    return
  }

  selectedAlbumKey.value = selectedAlbumKey.value === key ? null : key
}

function isSelected(kind: FacetKind, key: string): boolean {
  if (kind === 'genre') return selectedGenre.value === key
  if (kind === 'albumArtist') return selectedAlbumArtist.value === key
  return selectedAlbumKey.value === key
}

function clearSelection(): void {
  selectedGenre.value = null
  selectedAlbumArtist.value = null
  selectedAlbumKey.value = null
}

function openContextMenu(
  kind: Exclude<FacetKind, 'album'>,
  option: FacetOption,
  event: MouseEvent,
): void {
  const menuWidth = 190
  const menuHeight = 40
  contextMenu.value = {
    kind,
    option,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

async function createSmartPlaylist(): Promise<void> {
  if (!contextMenu.value) return

  const { kind, option } = contextMenu.value
  const conditions: SmartPlaylistRuleCondition[] = []
  const nameParts: string[] = []

  if (kind === 'albumArtist' && selectedGenre.value) {
    const genre = genreOptions.value.find((item) => item.key === selectedGenre.value)
    if (genre) {
      conditions.push({ field: 'genre', value: genre.value })
      nameParts.push(genre.label)
    }
  }

  conditions.push({ field: kind, value: option.value })
  nameParts.push(option.label)
  closeContextMenu()

  const result = await auralis.smartPlaylists.create(nameParts.join(' · '), { conditions })
  emit('created', result.playlist)
  emit('close')
}

async function reloadTracks(): Promise<void> {
  isLoading.value = tracks.value.length === 0
  try {
    tracks.value = await auralis.library.getTracks()
  } finally {
    isLoading.value = false
  }
}

function closeDialog(reason: 'button' | 'escape' | 'backdrop'): void {
  if (reason === 'escape' && contextMenu.value) {
    closeContextMenu()
    return
  }
  emit('close')
}
watch(
  () => props.open,
  (open) => {
    if (open) {
      void reloadTracks()
    } else {
      closeContextMenu()
    }
  },
)

watch(albumArtistOptions, (options) => {
  if (
    selectedAlbumArtist.value &&
    !options.some((option) => option.key === selectedAlbumArtist.value)
  ) {
    selectedAlbumArtist.value = null
    selectedAlbumKey.value = null
  }
})

watch(albumOptions, (options) => {
  if (selectedAlbumKey.value && !options.some((option) => option.key === selectedAlbumKey.value)) {
    selectedAlbumKey.value = null
  }
})

onMounted(() => {
  unsubscribeChanged = auralis.library.onChanged((event) => {
    // Play-count ticks must not full-reload facet track lists
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    if (props.open) {
      void reloadTracks()
    }
  })
})

onBeforeUnmount(() => {
  unsubscribeChanged?.()
})
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('facets.title')"
    title-id="facets-dialog-title"
    fill
    :padded="false"
    :scroll="false"
    @close="closeDialog"
  >
    <template #subtitle
      ><p class="facet-count">{{ t('facets.trackCount', { count: tracks.length }) }}</p></template
    >
    <template #header-actions>
      <button
        type="button"
        class="auralis-dialog-close"
        :aria-label="t('facets.reset')"
        @click="clearSelection"
      >
        <span class="i-lucide-rotate-ccw" aria-hidden="true" />
      </button>
    </template>
    <div v-if="isLoading" class="facets-dialog-loading">{{ t('facets.loading') }}</div>

    <div v-else class="facets-dialog-grid">
      <div class="facet-column">
        <div class="facet-column-title">{{ t('facets.genre') }}</div>
        <button
          v-for="option in genreOptions"
          :key="option.key"
          class="facet-option"
          :class="{ 'facet-option-active': isSelected('genre', option.key) }"
          type="button"
          @click="selectFacet('genre', option.key)"
          @contextmenu.prevent="openContextMenu('genre', option, $event)"
        >
          <span>{{ option.label }}</span>
          <span>{{ option.trackCount }}</span>
        </button>
      </div>

      <div class="facet-column">
        <div class="facet-column-title">{{ t('facets.albumArtist') }}</div>
        <button
          v-for="option in albumArtistOptions"
          :key="option.key"
          class="facet-option"
          :class="{ 'facet-option-active': isSelected('albumArtist', option.key) }"
          type="button"
          @click="selectFacet('albumArtist', option.key)"
          @contextmenu.prevent="openContextMenu('albumArtist', option, $event)"
        >
          <span>{{ option.label }}</span>
          <span>{{ option.trackCount }}</span>
        </button>
      </div>

      <div class="facet-column">
        <div class="facet-column-title">{{ t('facets.album') }}</div>
        <button
          v-for="option in albumOptions"
          :key="option.key"
          class="facet-option"
          :class="{ 'facet-option-active': isSelected('album', option.key) }"
          type="button"
          @click="selectFacet('album', option.key)"
        >
          <span>{{ option.label }}</span>
          <span>{{ option.trackCount }}</span>
        </button>
      </div>
    </div>
    <template #overlay>
      <div v-if="contextMenu" class="facets-context-layer" @click="closeContextMenu">
        <div
          class="library-context-menu frosted-context-menu facets-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button class="library-context-menu-item" type="button" @click="createSmartPlaylist">
            <span class="i-lucide-list-plus"></span>
            <span>{{ t('facets.createSmartPlaylist') }}</span>
          </button>
        </div>
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.facet-count {
  margin: 2px 0 0;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.facets-dialog-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}

.facets-dialog-grid {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
}

.facet-column {
  min-width: 0;
  overflow: auto;
  border-right: 1px solid var(--auralis-border-subtle);
  background: var(--auralis-sidebar-bg);
}

.facet-column:last-child {
  border-right: 0;
}

.facet-column-title {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px 7px;
  border-bottom: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text-subtle);
  background: var(--auralis-sidebar-bg);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 750;
}

.facet-option {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 70%, transparent);
  min-height: 28px;
  padding: 5px 10px;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 650;
  text-align: left;
}

.facet-option span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-option span:last-child {
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 700;
}

.facet-option:hover {
  background: var(--auralis-control-hover-bg);
}

.facet-option-active,
.facet-option-active:hover {
  color: var(--auralis-control-primary-text);
  background: var(--auralis-theme-accent);
}

.facet-option-active span:last-child {
  color: var(--auralis-control-primary-text);
}

.facet-option-active:focus-visible {
  outline: 2px solid var(--auralis-control-primary-text);
  outline-offset: -2px;
}

.facets-context-layer {
  position: fixed;
  inset: 0;
  z-index: 2;
}

.facets-context-menu {
  position: fixed;
  width: 190px;
}
</style>
