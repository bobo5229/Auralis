<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDefaultPlaylistName } from '../utils/useDefaultPlaylistName'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { SMART_PLAYLIST_MAX_OPERANDS } from '@shared/smartPlaylists/ruleLimits'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { resolveRestorableFocusTarget } from '@renderer/app/utils/sidebarModalFocus'
import { libraryCatalogClient } from '@renderer/features/library/utils/libraryCatalogClient'
import {
  buildPlaylistRule,
  evaluateBuilder,
  indexBuilderTracks,
  newBuilderState,
  type BuilderField,
} from '../utils/smartPlaylistBuilder'

const props = defineProps<{ open: boolean; trigger: HTMLElement | null }>()
const emit = defineEmits<{ close: []; created: [playlist: SmartPlaylist] }>()
const fields: BuilderField[] = ['genre', 'artist']
const { t } = useI18n()
const labels = computed(() => ({
  genre: t('smartBuilder.genre'),
  artist: t('smartBuilder.artist'),
}))
const icons = { genre: 'i-lucide-list-filter', artist: 'i-lucide-user-round' }
const state = ref(newBuilderState())
const mode = ref<'single' | 'and' | 'or'>('single')
const lastSelectedField = ref<BuilderField>('genre')
const {
  name,
  nameEdited,
  reset: resetName,
} = useDefaultPlaylistName(() => t('smartBuilder.defaultName'))
const queries = ref({ genre: '', artist: '' })
const limits = ref({ genre: 100, artist: 100 })
const tracks = shallowRef<TrackListItem[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const restoreTrigger = ref<HTMLElement | null>(null)
const activeSingleField = computed(() =>
  fields.find((field) => state.value.groups[field].values.length > 0),
)
const ruleState = computed(() => ({
  ...state.value,
  fields:
    mode.value === 'single' ? fields.filter((field) => field === activeSingleField.value) : fields,
  relation: mode.value === 'or' ? ('or' as const) : ('and' as const),
}))
function isGroupDisabled(field: BuilderField): boolean {
  return mode.value === 'single' && !!activeSingleField.value && activeSingleField.value !== field
}
function selectMode(value: 'single' | 'and' | 'or'): void {
  if (value === 'single' && fields.every((field) => state.value.groups[field].values.length)) {
    const other = lastSelectedField.value === 'genre' ? 'artist' : 'genre'
    state.value.groups[other].values = []
  }
  mode.value = value
  saveError.value = ''
}
function toggleValue(field: BuilderField, value: string): void {
  if (isGroupDisabled(field)) return
  const values = state.value.groups[field].values
  if (values.includes(value)) remove(field, value)
  else {
    if (values.length >= SMART_PLAYLIST_MAX_OPERANDS) return
    values.push(value)
    lastSelectedField.value = field
  }
}
const options = computed(() => indexBuilderTracks(tracks.value))
const result = computed(() => evaluateBuilder(ruleState.value, options.value))
const canCreate = computed(
  () =>
    !loading.value &&
    !saving.value &&
    !loadError.value &&
    !!name.value.trim() &&
    result.value.complete &&
    result.value.ids.size > 0,
)
const filtered = computed(
  () =>
    Object.fromEntries(
      fields.map((field) => [
        field,
        options.value[field].filter((option) =>
          option.label
            .toLocaleLowerCase()
            .includes(queries.value[field].trim().toLocaleLowerCase()),
        ),
      ]),
    ) as Record<BuilderField, typeof options.value.genre>,
)
function label(field: BuilderField, value: string): string {
  return options.value[field].find((option) => option.value === value)?.label ?? value
}
const notice = computed(() => {
  if (!result.value.withinLimits)
    return t('smartBuilder.selectionLimit', { count: SMART_PLAYLIST_MAX_OPERANDS })
  if (!result.value.complete)
    return t(mode.value === 'single' ? 'smartBuilder.chooseSingle' : 'smartBuilder.chooseGroups')
  if (result.value.ids.size) return ''
  return result.value.groups.some((group) => group.ids.size === 0)
    ? t('smartBuilder.groupEmpty')
    : t('smartBuilder.noIntersection')
})
function groupCount(field: BuilderField): number {
  return result.value.groups.find((group) => group.field === field)?.ids.size ?? 0
}
function close(): void {
  if (!saving.value) emit('close')
}
function restoreBuilderFocus(): void {
  const fallback = document.querySelector<HTMLElement>('.app-sidebar .smart-playlist-add-button')
  const target =
    resolveRestorableFocusTarget(restoreTrigger.value) ?? resolveRestorableFocusTarget(fallback)
  restoreTrigger.value = null
  target?.focus({ preventScroll: true })
}

let disposed = false
let generation = 0
let pending = false
let pendingLibraryRevision: string | undefined
let running = false
let unsubscribe: (() => void) | undefined
async function load(
  freshness: 'fresh' | 'snapshot' = 'snapshot',
  supersede = true,
  libraryRevision?: string,
): Promise<boolean> {
  pending = true
  pendingLibraryRevision = libraryRevision
  // Import notifications queue another complete preview without invalidating
  // the current preview or a create request's freshness boundary.
  if (supersede) generation++
  if (running) return false
  pending = false
  running = true
  loading.value = true
  const token = generation
  loadError.value = ''
  try {
    const snapshot = await libraryCatalogClient.load(
      () => !disposed && props.open && token === generation,
      freshness,
      libraryRevision,
    )
    if (disposed || !props.open || token !== generation) return false
    if (!libraryCatalogClient.isSnapshotCurrent(snapshot)) return false
    tracks.value = [...snapshot.tracks]
    return true
  } catch (cause) {
    if (disposed || !props.open || token !== generation) return false
    loadError.value = 'smartBuilder.loadError'
    rendererDiagnostics.warn({
      scope: 'sidebar.smart-playlist-builder',
      message: 'Failed to load builder catalog',
      cause,
    })
    return false
  } finally {
    running = false
    loading.value = false
    // Keep follow-up previews independent: create waits for its own fresh
    // snapshot, rather than waiting for a continuous import stream to stop.
    if (pending && props.open && !disposed) void load('snapshot', false, pendingLibraryRevision)
  }
}
watch(
  () => props.open,
  (open) => {
    if (!open) {
      generation++
      pending = false
      tracks.value = []
      return
    }
    restoreTrigger.value = props.trigger
    state.value = newBuilderState()
    mode.value = 'single'
    lastSelectedField.value = 'genre'
    resetName()
    queries.value = { genre: '', artist: '' }
    limits.value = { genre: 100, artist: 100 }
    saveError.value = ''
    void load()
  },
)
watch(
  queries,
  () => {
    limits.value = { genre: 100, artist: 100 }
  },
  { deep: true },
)
watch(
  state,
  () => {
    saveError.value = ''
  },
  { deep: true },
)
function remove(field: BuilderField, value: string): void {
  state.value.groups[field].values = state.value.groups[field].values.filter(
    (item) => item !== value,
  )
}
async function create(): Promise<void> {
  if (!canCreate.value) return
  saving.value = true
  saveError.value = ''
  try {
    // Recheck against a fresh complete snapshot before persisting the dynamic rule.
    libraryCatalogClient.invalidate()
    const refreshed = await load('fresh')
    if (disposed || !props.open || loadError.value) return
    if (!refreshed) {
      saveError.value = 'smartBuilder.createError'
      return
    }
    const current = evaluateBuilder(ruleState.value, indexBuilderTracks(tracks.value))
    if (!current.withinLimits) return
    if (!current.complete || !current.ids.size) {
      saveError.value = 'smartBuilder.noMatches'
      return
    }
    const created = await auralis.smartPlaylists.create(
      name.value.trim(),
      buildPlaylistRule(ruleState.value),
    )
    if (disposed) return
    window.dispatchEvent(new CustomEvent('auralis-smart-playlists-changed'))
    emit('created', created.playlist)
    emit('close')
  } catch (cause) {
    saveError.value = 'smartBuilder.createError'
    rendererDiagnostics.warn({
      scope: 'sidebar.smart-playlist-builder',
      message: 'Failed to create smart playlist',
      cause,
    })
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  unsubscribe = auralis.library.onChanged((event) => {
    if (
      disposed ||
      !props.open ||
      event.reason === 'play-stats-updated' ||
      event.reason === 'play-stats-reset'
    )
      return
    if (event.reason === 'track-added' || event.reason === 'track-relocated') {
      libraryCatalogClient.invalidate('import')
      void load('snapshot', false)
      return
    }
    if (event.libraryRevision)
      libraryCatalogClient.invalidateForLibraryRevision(event.libraryRevision)
    else libraryCatalogClient.invalidate()
    void load('snapshot', true, event.libraryRevision)
  })
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  pending = false
  unsubscribe?.()
})
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('smartBuilder.title')"
    title-id="playlist-builder-title"
    described-by="playlist-builder-description"
    :busy="saving"
    :dismissible="!saving"
    :return-focus-to="restoreTrigger"
    :restore-focus="restoreBuilderFocus"
    :padded="false"
    :scroll="false"
    @close="close"
  >
    <template #subtitle>
      <p id="playlist-builder-description" class="builder-description">
        {{ t('smartBuilder.description') }}
      </p>
    </template>
    <div class="stage">
      <p v-if="loading" class="notice neutral load-notice" role="status">
        <span class="i-lucide-library" aria-hidden="true" />
        {{ t('smartBuilder.loading') }}
      </p>
      <p v-if="loadError" class="notice load-notice" role="alert">
        {{ t(loadError) }}
        <button type="button" class="retry" :disabled="loading || saving" @click="load()">
          {{ t('albums.status.retry') }}
        </button>
      </p>
      <div class="name-row">
        <label for="smart-playlist-name" class="label">{{ t('sidebar.playlistName') }}</label>
        <input
          id="smart-playlist-name"
          v-model="name"
          class="name"
          :placeholder="t('sidebar.playlistName')"
          maxlength="80"
          :disabled="saving"
          @input="nameEdited = true"
        />
      </div>
      <fieldset :disabled="saving || loading || !!loadError" class="controls">
        <div class="relation outer">
          <div class="relation-description">
            <span class="label">{{ t('smartBuilder.betweenGroups') }}</span>
            <p id="smart-playlist-mode-description" class="hint">
              {{ t(`smartBuilder.modeDescription.${mode}`) }}
            </p>
          </div>
          <div
            class="switch"
            role="group"
            :aria-label="t('smartBuilder.betweenGroupsAria')"
            aria-describedby="smart-playlist-mode-description"
          >
            <button type="button" :aria-pressed="mode === 'single'" @click="selectMode('single')">
              {{ t('smartBuilder.single') }}
            </button>
            <button type="button" :aria-pressed="mode === 'and'" @click="selectMode('and')">
              {{ t('smartBuilder.andAll') }}
            </button>
            <button type="button" :aria-pressed="mode === 'or'" @click="selectMode('or')">
              {{ t('smartBuilder.orAny') }}
            </button>
          </div>
        </div>
        <div class="condition-groups parallel-groups">
          <fieldset
            v-for="field in fields"
            :key="field"
            class="group"
            :class="{ 'group-disabled': isGroupDisabled(field) }"
            :disabled="isGroupDisabled(field)"
            :aria-label="labels[field]"
            :aria-describedby="isGroupDisabled(field) ? `builder-${field}-disabled` : undefined"
          >
            <div class="group-header">
              <h2><span :class="icons[field]" aria-hidden="true" />{{ labels[field] }}</h2>
              <span
                class="badge"
                :class="{
                  'badge-selected': state.groups[field].values.length,
                  empty: state.groups[field].values.length && !groupCount(field),
                }"
                >{{
                  isGroupDisabled(field)
                    ? t('smartBuilder.inactive')
                    : state.groups[field].values.length
                      ? t('smartBuilder.matchCount', { count: groupCount(field) })
                      : t('smartBuilder.unselected')
                }}</span
              >
            </div>
            <p
              v-if="state.groups[field].values.length >= SMART_PLAYLIST_MAX_OPERANDS"
              class="notice neutral"
              role="status"
            >
              {{ t('smartBuilder.selectionLimit', { count: SMART_PLAYLIST_MAX_OPERANDS }) }}
            </p>
            <div class="relation">
              <span class="label">{{ t('smartBuilder.withinGroup') }}</span>
              <div
                class="switch"
                role="group"
                :aria-label="t('smartBuilder.withinGroupAria', { field: labels[field] })"
              >
                <button
                  type="button"
                  :aria-pressed="state.groups[field].relation === 'and'"
                  @click="state.groups[field].relation = 'and'"
                >
                  {{ t('smartBuilder.and') }}
                </button>
                <button
                  type="button"
                  :aria-pressed="state.groups[field].relation === 'or'"
                  @click="state.groups[field].relation = 'or'"
                >
                  {{ t('smartBuilder.or') }}
                </button>
              </div>
            </div>
            <div
              v-if="state.groups[field].values.length"
              class="selected-values"
              role="group"
              :aria-label="t('smartBuilder.selected', { field: labels[field] })"
            >
              <button
                v-for="value in state.groups[field].values"
                :key="value"
                type="button"
                class="chip"
                :title="label(field, value)"
                :aria-label="t('smartBuilder.remove', { value: label(field, value) })"
                @click="remove(field, value)"
              >
                <span>{{ label(field, value) }}</span>
                <span class="i-lucide-x" aria-hidden="true" />
              </button>
              <button type="button" class="clear-group" @click="state.groups[field].values = []">
                {{ t('smartBuilder.clear') }}
              </button>
            </div>
            <div class="search-wrap">
              <span class="i-lucide-search" aria-hidden="true" />
              <input
                v-model="queries[field]"
                class="search"
                :placeholder="t('smartBuilder.search', { field: labels[field] })"
                :aria-label="t('smartBuilder.search', { field: labels[field] })"
              />
              <button
                v-if="queries[field]"
                type="button"
                class="clear-search"
                :aria-label="t('smartBuilder.clearSearch', { field: labels[field] })"
                @click="queries[field] = ''"
              >
                <span class="i-lucide-x" aria-hidden="true" />
              </button>
            </div>
            <div class="choices">
              <label
                v-for="option in filtered[field].slice(0, limits[field])"
                :key="option.value"
                class="choice"
                :title="option.label"
              >
                <input
                  :checked="state.groups[field].values.includes(option.value)"
                  :disabled="
                    state.groups[field].values.length >= SMART_PLAYLIST_MAX_OPERANDS &&
                    !state.groups[field].values.includes(option.value)
                  "
                  type="checkbox"
                  :value="option.value"
                  @change="toggleValue(field, option.value)"
                />
                <span>{{ option.label }}</span>
                <small>{{ option.ids.size }}</small>
              </label>
              <button
                v-if="filtered[field].length > limits[field]"
                type="button"
                class="more"
                @click="limits[field] += 100"
              >
                {{ t('smartBuilder.more', { count: filtered[field].length - limits[field] }) }}
              </button>
            </div>
            <p
              v-if="!loading && !loadError && !filtered[field].length"
              class="empty-values"
            >
              <span class="i-lucide-search-x" aria-hidden="true" />
              {{
                t(queries[field].trim() ? 'smartBuilder.noValues' : 'smartBuilder.emptyValues', {
                  field: labels[field],
                })
              }}
            </p>
            <p
              v-if="isGroupDisabled(field)"
              :id="`builder-${field}-disabled`"
              class="hint disabled-hint"
            >
              {{ t('smartBuilder.groupDisabled') }}
            </p>
          </fieldset>
        </div>
      </fieldset>
    </div>

    <template #footer>
      <div class="actions">
        <div class="result-summary" role="status" aria-live="polite" aria-atomic="true">
          <span class="result-count">{{
            t('smartBuilder.resultCount', { count: result.ids.size })
          }}</span>
          <span
            v-if="notice && !loading && !loadError"
            class="match-notice"
            :class="{ neutral: !result.complete }"
          >
            {{ notice }}
          </span>
        </div>
        <button
          type="button"
          class="primary auralis-dialog-action auralis-dialog-action--primary"
          :disabled="!canCreate"
          @click="create"
        >
          <span :class="saving ? 'i-lucide-loader-circle' : 'i-lucide-plus'" aria-hidden="true" />
          {{ t(saving ? 'smartBuilder.creating' : 'smartBuilder.create') }}
        </button>
      </div>
      <p v-if="saveError" class="status" role="alert">{{ t(saveError) }}</p>
    </template>
  </AppDialog>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

:where(button, input) {
  font: inherit;
}

:where(button:not(.auralis-dialog-action)) {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--auralis-text);
  cursor: pointer;
}

:where(button:not(.auralis-dialog-action), input):disabled {
  color: var(--auralis-text-disabled);
  cursor: default;
}

:where(button, input):focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.builder-description,
.hint {
  margin: 0;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  overflow-wrap: anywhere;
}

.builder-description {
  margin-top: 4px;
}

.stage {
  min-height: 0;
  padding: 20px 24px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-scrollbar-thumb) transparent;
}

.controls {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.name-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.label {
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 500;
}

.name {
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--auralis-border-strong);
  border-radius: 8px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.name::placeholder,
.search::placeholder {
  color: var(--auralis-text-subtle);
}

.name:focus {
  border-color: var(--auralis-focus-ring);
}

.relation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.outer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 20px;
  margin-bottom: 16px;
}

.relation-description {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.outer .label {
  color: var(--auralis-text);
  font-weight: 600;
}

.switch {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 9px;
  background: var(--auralis-main-bg);
}

.switch button {
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 6px;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 500;
  white-space: nowrap;
}

.switch button:hover:not(:disabled):not([aria-pressed='true']) {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.switch button[aria-pressed='true'] {
  background: var(--auralis-theme-accent);
  color: var(--auralis-control-primary-text);
  font-weight: 600;
}

.condition-groups.parallel-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.group {
  min-width: 0;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 45%, var(--auralis-main-bg));
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 14px;
}

.group-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 600;
}

.group-header h2 > span {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--auralis-text-muted);
}

.badge {
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.badge-selected {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--auralis-control-active-bg);
  color: var(--auralis-text);
}

.badge.empty {
  background: color-mix(in srgb, var(--auralis-danger) 10%, transparent);
  color: var(--auralis-danger);
}

.group .relation {
  margin-bottom: 12px;
}

.group .relation .label {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}

.group-disabled :is(.relation, .search-wrap, .choices) {
  opacity: 0.45;
}

.disabled-hint {
  margin-top: 12px;
}

.selected-values {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 108px;
  margin: 0 0 12px;
  padding: 4px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-scrollbar-thumb) transparent;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--auralis-control-active-bg);
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  text-align: left;
}

.chip:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.chip > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip .i-lucide-x {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--auralis-text-muted);
}

.clear-group,
.retry {
  min-height: 28px;
  padding: 4px 6px;
  border-radius: 5px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.clear-group:hover:not(:disabled),
.retry:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 7px;
  background: var(--auralis-main-bg);
}

.search-wrap > span {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--auralis-text-subtle);
}

.search-wrap:focus-within {
  border-color: var(--auralis-focus-ring);
}

.search-wrap:has(.search:focus-visible) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.search {
  width: 100%;
  min-width: 0;
  padding: 7px 0;
  border: 0;
  background: transparent;
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.search:focus-visible {
  outline: none;
}

.clear-search {
  display: grid;
  place-items: center;
  width: 24px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 4px;
  color: var(--auralis-text-muted);
}

.clear-search:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.clear-search > span {
  width: 14px;
  height: 14px;
}

.choices {
  --choice-row-height: 38px;
  --choice-row-gap: 2px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: var(--choice-row-height);
  gap: var(--choice-row-gap) 6px;
  max-height: calc(4 * var(--choice-row-height) + 3 * var(--choice-row-gap) + 4px);
  padding: 2px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-scrollbar-thumb) transparent;
}

.choices:empty {
  display: none;
}

.choice {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: var(--choice-row-height);
  padding: 8px 6px;
  border-radius: 5px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  cursor: pointer;
}

.choice:hover:has(input:enabled),
.choice:focus-within {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.choice:has(:checked) {
  background: var(--auralis-control-active-bg);
  color: var(--auralis-text);
}

.choice:has(input:disabled) {
  cursor: default;
}

.choice > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice small {
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.choice input {
  appearance: none;
  display: grid;
  place-content: center;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin: 0;
  border: 1px solid var(--auralis-border-strong);
  border-radius: 3px;
  background: var(--auralis-main-bg);
  cursor: inherit;
}

.choice input:checked {
  border-color: var(--auralis-control-primary-bg);
  background: var(--auralis-control-primary-bg);
}

.choice input:checked::after {
  content: '';
  width: 7px;
  height: 4px;
  border-left: 1.5px solid var(--auralis-control-primary-text);
  border-bottom: 1.5px solid var(--auralis-control-primary-text);
  transform: translateY(-1px) rotate(-45deg);
}

.more {
  grid-column: 1 / -1;
  border-radius: 5px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.more:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.empty-values {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 18px 8px;
  color: var(--auralis-text-subtle);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  overflow-wrap: anywhere;
}

.empty-values > span {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.notice,
.status {
  color: var(--auralis-danger);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  overflow-wrap: anywhere;
}

.notice {
  margin: 0 0 12px;
}

.notice.neutral {
  color: var(--auralis-text-subtle);
}

.load-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.load-notice > span {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 20px;
}

.result-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  overflow-wrap: anywhere;
}

.result-count {
  color: var(--auralis-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.match-notice {
  color: var(--auralis-danger);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}

.match-notice.neutral {
  color: var(--auralis-text-subtle);
}

.primary {
  justify-self: end;
  gap: 7px;
}

.primary > span {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.status {
  margin: 10px 0 0;
}

@media (max-width: 760px) {
  .stage {
    padding: 16px 20px;
  }

  .outer {
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
  }

  .condition-groups.parallel-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 420px) {
  .stage {
    padding-right: 16px;
    padding-left: 16px;
  }

  .name-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .group {
    padding: 12px;
  }

  .choices,
  .actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
