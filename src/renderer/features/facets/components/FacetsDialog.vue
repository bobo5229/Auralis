<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumDetailRequest } from '@shared/types/albumDetail'
import type {
  SmartPlaylist,
  SmartPlaylistRule,
  SmartPlaylistRuleCondition,
} from '@shared/types/smartPlaylist'
import { auralis } from '@renderer/shared/ipc/client'
import {
  buildFacetOptions,
  buildAlbumFacetOptions,
  buildFacetPlaylistName,
  matchesFacet,
  type AlbumFacetOption,
  type FacetOption,
} from '../utils/facetOptions'

const { t } = useI18n()

type FacetKind = 'genre' | 'albumArtist'

interface PlaylistCreation {
  name: string
  rule: SmartPlaylistRule
}

interface FacetContextMenuState {
  kind: FacetKind
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
  openAlbum: [album: AlbumDetailRequest]
}>()

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(false)
const loadError = ref(false)
const isCreating = ref(false)
const failedCreation = shallowRef<PlaylistCreation | null>(null)
const selectedGenre = ref<string | null>(null)
const selectedAlbumArtist = ref<string | null>(null)
const contextMenu = ref<FacetContextMenuState | null>(null)
const menuCommand = ref<HTMLButtonElement | null>(null)
let contextMenuTrigger: HTMLElement | null = null
let unsubscribeChanged: (() => void) | null = null
let loadGeneration = 0
let disposed = false
const actionsDisabled = computed(() => isCreating.value || loadError.value)

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
const hasSelection = computed(() => !!activeGenreOption.value || !!activeAlbumArtistOption.value)
const filteredTracks = computed(() =>
  tracks.value.filter((track) => matchesGenre(track) && matchesAlbumArtist(track)),
)

const albumOptions = computed(() =>
  buildAlbumFacetOptions(filteredTracks.value, t('facets.unknownAlbum'), t('facets.unknownArtist')),
)

function selectFacet(kind: FacetKind, key: string): void {
  if (actionsDisabled.value) return
  if (kind === 'genre') {
    const next = selectedGenre.value === key ? null : key
    selectedGenre.value = next
    selectedAlbumArtist.value = null
    return
  }

  if (kind === 'albumArtist') {
    const next = selectedAlbumArtist.value === key ? null : key
    selectedAlbumArtist.value = next
  }
}

function isSelected(kind: FacetKind, key: string): boolean {
  if (kind === 'genre') return selectedGenre.value === key
  return selectedAlbumArtist.value === key
}

function openAlbum(option: AlbumFacetOption): void {
  if (actionsDisabled.value) return
  emit('openAlbum', { albumArtist: option.albumArtist, albumTitle: option.albumTitle })
  emit('close')
}

function clearSelection(): void {
  selectedGenre.value = null
  selectedAlbumArtist.value = null
}

function openContextMenu(kind: FacetKind, option: FacetOption, event: MouseEvent): void {
  if (actionsDisabled.value) return
  contextMenuTrigger = event.currentTarget as HTMLElement
  const rect = contextMenuTrigger?.getBoundingClientRect?.()
  const x = event.clientX || rect?.left || 0
  const y = event.clientY || rect?.bottom || 0
  const menuWidth = 190
  const menuHeight = 40
  contextMenu.value = {
    kind,
    option,
    x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
  }
  void nextTick(() => menuCommand.value?.focus?.({ preventScroll: true }))
}

function closeContextMenu(restoreFocus = true): void {
  contextMenu.value = null
  if (restoreFocus && contextMenuTrigger?.isConnected)
    contextMenuTrigger.focus({ preventScroll: true })
  contextMenuTrigger = null
}

async function submitCreation(request: PlaylistCreation): Promise<void> {
  if (isCreating.value || disposed || !props.open || loadError.value) return
  isCreating.value = true
  failedCreation.value = null
  try {
    const result = await auralis.smartPlaylists.create(request.name, request.rule)
    if (disposed || !props.open) return
    emit('created', result.playlist)
    emit('close')
  } catch {
    if (!disposed && props.open) failedCreation.value = request
  } finally {
    isCreating.value = false
  }
}

function retryCreation(): void {
  if (failedCreation.value) void submitCreation(failedCreation.value)
}

async function createSmartPlaylist(): Promise<void> {
  if (!contextMenu.value || actionsDisabled.value) return

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

  await submitCreation({ name: buildFacetPlaylistName(nameParts), rule: { conditions } })
}

async function reloadTracks(): Promise<void> {
  if (disposed || !props.open) return
  const generation = ++loadGeneration
  isLoading.value = tracks.value.length === 0
  loadError.value = false
  try {
    const result = await auralis.library.getTracks()
    if (disposed || !props.open || generation !== loadGeneration) return
    closeContextMenu()
    tracks.value = result
  } catch {
    if (!disposed && props.open && generation === loadGeneration) loadError.value = true
  } finally {
    if (generation === loadGeneration) isLoading.value = false
  }
}

function closeDialog(reason: 'button' | 'escape' | 'backdrop'): void {
  if (isCreating.value) return
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
      loadGeneration++
      isLoading.value = false
      loadError.value = false
      failedCreation.value = null
      closeContextMenu(false)
    }
  },
  { immediate: true },
)

watch(genreOptions, (options) => {
  if (selectedGenre.value && !options.some((option) => option.key === selectedGenre.value)) {
    clearSelection()
  }
})

watch(albumArtistOptions, (options) => {
  if (
    selectedAlbumArtist.value &&
    !options.some((option) => option.key === selectedAlbumArtist.value)
  ) {
    selectedAlbumArtist.value = null
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
  disposed = true
  loadGeneration++
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
    :busy="isLoading || isCreating"
    :dismissible="!isCreating"
    @close="closeDialog"
  >
    <template #subtitle>
      <p class="facet-count" role="status">
        {{
          hasSelection
            ? t('facets.matchCount', { count: filteredTracks.length, total: tracks.length })
            : t('facets.trackCount', { count: tracks.length })
        }}
      </p>
    </template>
    <template #header-actions>
      <button
        type="button"
        class="auralis-dialog-action facets-reset"
        :aria-label="t('facets.reset')"
        :disabled="!hasSelection || isCreating"
        @click="clearSelection"
      >
        <span class="i-lucide-rotate-ccw" aria-hidden="true" />
        {{ t('facets.reset') }}
      </button>
    </template>
    <div class="facets-dialog-content">
      <div v-if="loadError || failedCreation || isCreating" class="facets-feedback">
        <div v-if="loadError" class="facets-feedback-row" role="alert">
          <span>{{ t('facets.loadError') }}</span>
          <button type="button" class="auralis-dialog-action" @click="reloadTracks">
            {{ t('facets.retry') }}
          </button>
        </div>
        <div v-if="failedCreation" class="facets-feedback-row" role="alert">
          <span>{{ t('facets.createError') }}</span>
          <button
            type="button"
            class="auralis-dialog-action"
            :disabled="actionsDisabled"
            @click="retryCreation"
          >
            {{ t('facets.retry') }}
          </button>
        </div>
        <div v-if="isCreating" role="status">{{ t('facets.creating') }}</div>
      </div>
      <div v-if="isLoading" class="facets-dialog-loading" role="status">
        {{ t('facets.loading') }}
      </div>
      <div v-else-if="!tracks.length && !loadError" class="facets-dialog-loading">
        {{ t('facets.empty') }}
      </div>

      <div v-else-if="tracks.length" class="facets-dialog-grid">
        <div class="facet-column">
          <div class="facet-column-title">
            <span>{{ t('facets.genre') }}</span>
            <span class="facet-column-total">{{ genreOptions.length }}</span>
          </div>
          <div class="facet-column-options">
            <button
              v-for="option in genreOptions"
              :key="option.key"
              class="facet-option"
              :class="{ 'facet-option-active': isSelected('genre', option.key) }"
              :aria-pressed="isSelected('genre', option.key)"
              :title="option.label"
              :disabled="actionsDisabled"
              type="button"
              @click="selectFacet('genre', option.key)"
              @contextmenu.prevent="openContextMenu('genre', option, $event)"
            >
              <span>{{ option.label }}</span>
              <span class="facet-option-count">{{ option.trackCount }}</span>
              <span class="facet-option-affordance" aria-hidden="true">
                <span v-if="isSelected('genre', option.key)" class="i-lucide-check" />
              </span>
            </button>
          </div>
        </div>

        <div class="facet-column">
          <div class="facet-column-title">
            <span>{{ t('facets.albumArtist') }}</span>
            <span class="facet-column-total">{{ albumArtistOptions.length }}</span>
          </div>
          <div class="facet-column-options">
            <button
              v-for="option in albumArtistOptions"
              :key="option.key"
              class="facet-option"
              :class="{ 'facet-option-active': isSelected('albumArtist', option.key) }"
              :aria-pressed="isSelected('albumArtist', option.key)"
              :title="option.label"
              :disabled="actionsDisabled"
              type="button"
              @click="selectFacet('albumArtist', option.key)"
              @contextmenu.prevent="openContextMenu('albumArtist', option, $event)"
            >
              <span>{{ option.label }}</span>
              <span class="facet-option-count">{{ option.trackCount }}</span>
              <span class="facet-option-affordance" aria-hidden="true">
                <span v-if="isSelected('albumArtist', option.key)" class="i-lucide-check" />
              </span>
            </button>
          </div>
        </div>

        <div class="facet-column">
          <div class="facet-column-title">
            <span>{{ t('facets.album') }}</span>
            <span class="facet-column-total">{{ albumOptions.length }}</span>
          </div>
          <div class="facet-column-options">
            <button
              v-for="option in albumOptions"
              :key="option.key"
              class="facet-option facet-option-album"
              :title="`${option.label} · ${option.artistLabel}`"
              :aria-label="
                t('facets.openAlbum', { title: option.label, artist: option.artistLabel })
              "
              :disabled="actionsDisabled"
              type="button"
              @click="openAlbum(option)"
            >
              <span class="facet-album-label">
                <span>{{ option.label }}</span>
                <small class="facet-album-artist">{{ option.artistLabel }}</small>
              </span>
              <span class="facet-option-count">{{ option.trackCount }}</span>
              <span class="facet-option-affordance facet-album-arrow" aria-hidden="true">
                <span class="i-lucide-chevron-right" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="facets-help">
        <span>{{ t('facets.albumHint') }}</span>
        <span>{{ t('facets.playlistHint') }}</span>
      </div>
    </template>
    <template #overlay>
      <div v-if="contextMenu" class="facets-context-layer" @click="closeContextMenu()">
        <div
          class="library-context-menu frosted-context-menu facets-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          :aria-label="t('facets.createSmartPlaylist')"
          @click.stop
        >
          <button
            ref="menuCommand"
            class="library-context-menu-item"
            type="button"
            role="menuitem"
            @click="createSmartPlaylist"
            @keydown.tab.prevent="closeContextMenu()"
          >
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
  margin: 4px 0 0;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.facets-reset {
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  color: var(--auralis-text);
}

.facets-reset > span {
  width: 14px;
  height: 14px;
}

.facets-dialog-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.facets-dialog-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.facets-feedback {
  flex: none;
  padding: 12px 16px;
  border-bottom: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.facets-feedback [role='status'] {
  color: var(--auralis-text-muted);
}

.facets-reset:disabled,
.facets-feedback .auralis-dialog-action:disabled {
  color: var(--auralis-text-disabled);
  opacity: 1;
}

.facets-feedback-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--auralis-danger) 8%, transparent);
}

.facets-feedback-row + .facets-feedback-row {
  margin-top: 8px;
}

.facets-dialog-grid {
  flex: 1;
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.2fr);
  overflow: hidden;
}

.facet-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--auralis-border-subtle);
  background: var(--auralis-main-bg);
}

.facet-column:last-child {
  border-right: 0;
}

.facet-column-title {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 42px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 600;
}

.facet-column-title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-column-total {
  flex: none;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.facet-column-options {
  flex: 1;
  min-height: 0;
  padding: 6px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-scrollbar-thumb) transparent;
}

.facet-option {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto 14px;
  align-items: center;
  gap: 8px;
  border: 0;
  min-height: 34px;
  margin-bottom: 2px;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--auralis-text);
  background: transparent;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.facet-option > span:first-child,
.facet-album-label > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-option-count,
.facet-album-artist {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.facet-option-count {
  min-width: 2ch;
  color: var(--auralis-text-subtle);
  text-align: right;
}

.facet-option-album {
  min-height: 50px;
  padding-block: 6px;
}

.facet-album-label {
  display: grid;
  min-width: 0;
}

.facet-album-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text-muted);
  font-weight: 400;
}

.facet-option:disabled {
  color: var(--auralis-text-disabled);
  cursor: default;
}

.facet-option:disabled :is(.facet-option-count, .facet-album-artist, .facet-option-affordance) {
  color: inherit;
}

.facet-option:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -2px;
}

.facet-option:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.facet-option-active,
.facet-option-active:hover:not(:disabled) {
  color: var(--auralis-text);
  background: var(--auralis-control-active-bg);
  font-weight: 600;
}

.facet-option-affordance {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  color: var(--auralis-theme-accent);
}

.facet-option-affordance > span {
  width: 14px;
  height: 14px;
}

.facet-album-arrow {
  color: var(--auralis-text-subtle);
  visibility: hidden;
}

.facet-option-album:is(:hover, :focus-visible):not(:disabled) .facet-album-arrow {
  visibility: visible;
}

.facets-help {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 20px;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}

@media (max-width: 760px) {
  .facets-dialog-grid {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.15fr);
  }

  .facet-column-title {
    padding-inline: 12px;
  }

  .facet-option {
    gap: 6px;
    padding-inline: 8px;
  }
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
