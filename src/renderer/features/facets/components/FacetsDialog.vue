<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist, SmartPlaylistRuleCondition } from '@shared/types/smartPlaylist'
import { auralis } from '@renderer/shared/ipc/client'
import { splitGenreValues } from '@renderer/features/library/utils/formatGenre'
import { splitArtistValues } from '@renderer/features/library/utils/formatArtist'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'

type FacetKind = 'genre' | 'albumArtist' | 'album'

interface FacetOption {
  key: string
  label: string
  value: string | null
  trackCount: number
}

interface FacetContextMenuState {
  kind: Exclude<FacetKind, 'album'>
  option: FacetOption
  x: number
  y: number
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  created: [playlist: SmartPlaylist]
}>()

const UNKNOWN_GENRE = 'Unknown Genre'
const UNKNOWN_ARTIST = 'Unknown Artist'
const UNKNOWN_ALBUM = 'Unknown Album'

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

function getGenres(track: TrackListItem): Array<string | null> {
  const genres = splitGenreValues(track.genre)
  return genres.length > 0 ? genres : [null]
}

function getAlbumArtists(track: TrackListItem): Array<string | null> {
  const albumArtist = track.albumArtist || track.artist
  const artists = splitArtistValues(albumArtist)
  return artists.length > 0 ? artists : [null]
}

function getAlbumTitle(track: TrackListItem): string {
  return track.album?.trim() || UNKNOWN_ALBUM
}

function getAlbumKey(albumArtist: string | null, album: string): string {
  return `${albumArtist ?? ''}\u0000${album}`
}

function getFacetKey(value: string | null): string {
  return value === null ? 'unknown' : `value:${value}`
}

function getFacetLabel(kind: Exclude<FacetKind, 'album'>, value: string | null): string {
  if (value !== null) return value
  return kind === 'genre' ? UNKNOWN_GENRE : UNKNOWN_ARTIST
}

function countOptions(
  kind: Exclude<FacetKind, 'album'>,
  values: Iterable<string | null>,
): FacetOption[] {
  const counts = new Map<string, FacetOption>()

  for (const value of values) {
    const key = getFacetKey(value)
    const existing = counts.get(key)
    if (existing) {
      existing.trackCount += 1
    } else {
      counts.set(key, {
        key,
        label: getFacetLabel(kind, value),
        value,
        trackCount: 1,
      })
    }
  }

  return [...counts.values()].sort((left, right) => collator.compare(left.label, right.label))
}

function matchesGenre(track: TrackListItem): boolean {
  if (!selectedGenre.value) return true
  const selected = genreOptions.value.find((option) => option.key === selectedGenre.value)
  return selected ? getGenres(track).includes(selected.value) : true
}

function matchesAlbumArtist(track: TrackListItem): boolean {
  if (!selectedAlbumArtist.value) return true
  const selected = albumArtistOptions.value.find(
    (option) => option.key === selectedAlbumArtist.value,
  )
  return selected ? getAlbumArtists(track).includes(selected.value) : true
}

const genreOptions = computed<FacetOption[]>(() =>
  countOptions(
    'genre',
    tracks.value.flatMap((track) => getGenres(track)),
  ),
)

const albumArtistOptions = computed<FacetOption[]>(() =>
  countOptions(
    'albumArtist',
    tracks.value.filter(matchesGenre).flatMap((track) => getAlbumArtists(track)),
  ),
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) {
    if (contextMenu.value) {
      closeContextMenu()
      return
    }
    emit('close')
  }
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
  window.addEventListener('keydown', onKeydown)
  unsubscribeChanged = auralis.library.onChanged(() => {
    if (props.open) {
      void reloadTracks()
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribeChanged?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="facets-dialog-fade">
      <div v-if="open" class="facets-dialog-backdrop" @click.self="emit('close')">
        <section class="facets-dialog-panel" role="dialog" aria-modal="true" aria-label="Facets">
          <header class="facets-dialog-header">
            <div>
              <h2>Facets</h2>
              <p>{{ tracks.length }} tracks</p>
            </div>

            <div class="facets-dialog-actions">
              <button type="button" title="Reset" @click="clearSelection">
                <span class="i-lucide-rotate-ccw h-4 w-4"></span>
              </button>
              <button type="button" title="Close" @click="emit('close')">
                <span class="i-lucide-x h-4 w-4"></span>
              </button>
            </div>
          </header>

          <div v-if="isLoading" class="facets-dialog-loading">Loading facets...</div>

          <div v-else class="facets-dialog-grid">
            <div class="facet-column">
              <div class="facet-column-title">流派</div>
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
              <div class="facet-column-title">专辑艺术家</div>
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
              <div class="facet-column-title">专辑</div>
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
        </section>

        <div v-if="contextMenu" class="facets-context-layer" @click="closeContextMenu">
          <LiquidGlassPanel
            class="library-context-menu facets-context-menu"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
            @click.stop
          >
            <button class="library-context-menu-item" type="button" @click="createSmartPlaylist">
              <span class="i-lucide-list-plus"></span>
              <span>创建智能歌单</span>
            </button>
          </LiquidGlassPanel>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.facets-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.18);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.facets-dialog-panel {
  display: grid;
  width: min(780px, calc(100vw - 56px));
  height: min(500px, calc(100vh - 84px));
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: var(--auralis-main-bg);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
}

.facets-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--auralis-border-subtle);
}

.facets-dialog-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}

.facets-dialog-header p {
  margin: 2px 0 0;
  color: var(--auralis-text-subtle);
  font-size: 12px;
}

.facets-dialog-actions {
  display: flex;
  gap: 6px;
}

.facets-dialog-actions button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: var(--auralis-text-muted);
  background: transparent;
}

.facets-dialog-actions button:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-control-hover-bg) 72%, transparent);
}

.facets-dialog-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-faint);
  font-size: 12px;
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
  font-size: 11px;
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
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
}

.facet-option span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-option span:last-child {
  color: var(--auralis-text-faint);
  font-size: 11px;
  font-weight: 700;
}

.facet-option:hover {
  background: var(--auralis-control-hover-bg);
}

.facet-option-active {
  color: var(--auralis-sidebar-active-text);
  background: var(--auralis-sidebar-active-bg);
}

.facet-option-active span:last-child {
  color: var(--auralis-sidebar-active-icon);
}

.facets-dialog-fade-enter-active,
.facets-dialog-fade-leave-active {
  transition: opacity 160ms ease;
}

.facets-dialog-fade-enter-from,
.facets-dialog-fade-leave-to {
  opacity: 0;
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
