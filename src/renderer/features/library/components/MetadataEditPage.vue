<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'
import SaveProgressIcon from './SaveProgressIcon.vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { normalizeReleaseDate, releaseDateYear } from '@shared/utils/releaseDate'
import type { MetadataEditStatus } from '../composables/useLibraryMetadataEditor'

const props = withDefaults(
  defineProps<{
    metadata: EditableTrackMetadata | null
    disabled?: boolean
    active?: boolean
    loading?: boolean
    saving: boolean
    errorMessage: string | null
    editStatus?: MetadataEditStatus
  }>(),
  {
    editStatus: 'editable',
    loading: false,
  },
)

const emit = defineEmits<{
  save: [metadata: EditableTrackMetadata]
  retryStatus: []
  retryLoad: []
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLFormElement | null>(null)
const savedForm = ref('')
const composing = ref(false)
const dirty = computed(() => !!props.metadata && JSON.stringify(form) !== savedForm.value)
function markCommitted(): void {
  savedForm.value = JSON.stringify(form)
}
function focus(): void {
  titleInputRef.value?.focus({ preventScroll: true })
}
const titleInputRef = ref<HTMLInputElement | null>(null)
const localError = ref<string | null>(null)
const saveProgress = ref<InstanceType<typeof SaveProgressIcon> | null>(null)
const saveSucceeded = ref(false)
const saveButtonLabel = computed(() =>
  saveSucceeded.value
    ? t('library.metadataEditor.actions.saved')
    : props.saving
      ? t('library.metadataEditor.actions.saving')
      : t('library.metadataEditor.actions.save'),
)

watch(
  () => props.saving,
  (saving) => {
    if (!saving) saveSucceeded.value = false
  },
)

async function showSaveSuccess(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  saveSucceeded.value = true
  await nextTick()
  if (!signal.aborted) await saveProgress.value?.complete(signal)
}

defineExpose({ showSaveSuccess, dirty, composing, markCommitted, focus, save: onSave })

const legacyDifferences = computed(() => {
  const legacy = props.metadata?.legacyMetadata
  if (!legacy || !props.metadata) return []
  const fields = {
    title: 'title',
    artistDisplay: 'artist',
    albumTitle: 'album',
    albumArtistDisplay: 'albumArtist',
    genreDisplay: 'genre',
    releaseDate: 'releaseDate',
    year: 'year',
  } as const
  return (Object.keys(fields) as Array<keyof typeof fields>)
    .filter((key) => legacy[key] !== props.metadata![key])
    .map((key) => ({
      key,
      label:
        key === 'year'
          ? t('library.metadataEditor.legacy.year')
          : t(`library.metadataEditor.fields.${fields[key]}`),
      file: props.metadata![key] ?? '—',
      legacy: legacy[key] ?? '—',
    }))
})
const isEditingDisabled = computed(
  () =>
    props.disabled ||
    !props.metadata ||
    props.loading ||
    props.saving ||
    !['editable', 'playback-editable'].includes(props.editStatus),
)

interface StatusBannerConfig {
  message: string
  classes: string
  icon?: string
}

const statusBanner = computed<StatusBannerConfig | null>(() => {
  // The current save is represented by the submit button. Keep the warning
  // for a write owned by another operation when this editor is not saving.
  if (props.saving && props.editStatus === 'write-in-progress') return null
  switch (props.editStatus) {
    case 'checking':
      return {
        message: t('library.metadataEditor.status.checking'),
        classes: 'metadata-dialog-status-banner--info',
      }
    case 'playback-in-use':
      return null
    case 'write-in-progress':
      return {
        message: t('library.metadataEditor.errors.writeInProgress'),
        classes: 'metadata-dialog-status-banner--warning',
      }
    case 'query-failed':
      return {
        message: t('library.metadataEditor.status.queryFailed'),
        classes: 'metadata-dialog-status-banner--error',
        icon: 'i-lucide-alert-circle text-[var(--auralis-danger)] shrink-0',
      }
    default:
      return null
  }
})

const releaseDateHasError = computed(
  () => localError.value === 'library.metadataEditor.validation.dateInvalid',
)

const form = reactive({
  title: '',
  artistDisplay: '',
  albumTitle: '',
  albumArtistDisplay: '',
  genreDisplay: '',
  releaseDate: '',
})

watch(
  () => props.metadata,
  (metadata, previous) => {
    if (metadata && previous && metadata.trackId === previous.trackId && dirty.value) return
    if (
      metadata &&
      previous &&
      isSameEditableMetadata(metadata, previous) &&
      JSON.stringify(metadata.legacyMetadata) === JSON.stringify(previous.legacyMetadata)
    )
      return
    localError.value = null
    form.title = metadata?.title ?? ''
    form.artistDisplay = metadata?.artistDisplay ?? ''
    form.albumTitle = metadata?.albumTitle ?? ''
    form.albumArtistDisplay = metadata?.albumArtistDisplay ?? ''
    form.genreDisplay = metadata?.genreDisplay ?? ''
    form.releaseDate = metadata?.releaseDate ?? (metadata?.year?.toString().padStart(4, '0') || '')

    markCommitted()
    if (props.active && metadata && !isEditingDisabled.value) {
      nextTick(() => {
        titleInputRef.value?.focus()
      })
    }
  },
  { immediate: true },
)

watch(
  () => isEditingDisabled.value,
  (disabled, wasDisabled) => {
    if (props.active && wasDisabled && !disabled && props.metadata) {
      if (
        !dialogRef.value?.contains(document.activeElement) ||
        document.activeElement === dialogRef.value
      ) {
        nextTick(() => {
          titleInputRef.value?.focus()
        })
      }
    }
  },
)

function normalize(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function validateReleaseDate(value: string): string | null {
  try {
    normalizeReleaseDate(value)
  } catch {
    return 'library.metadataEditor.validation.dateInvalid'
  }
  return null
}

function onSave(): void {
  if (!props.metadata || isEditingDisabled.value || composing.value) {
    return
  }

  const releaseDate = normalize(form.releaseDate)

  if (releaseDate) {
    const releaseDateError = validateReleaseDate(releaseDate)

    if (releaseDateError) {
      localError.value = releaseDateError
      return
    }
  }

  localError.value = null

  emit('save', {
    trackId: props.metadata.trackId,
    title: normalize(form.title),
    artistDisplay: normalize(form.artistDisplay),
    albumTitle: normalize(form.albumTitle),
    albumArtistDisplay: normalize(form.albumArtistDisplay),
    genreDisplay: normalize(form.genreDisplay),
    year: releaseDateYear(releaseDate),
    releaseDate,
  })
}

function resolveLegacy(action: 'adopt-file' | 'write-legacy'): void {
  if (!props.metadata || isEditingDisabled.value || composing.value) return
  emit('save', { ...props.metadata, legacyAction: action })
}
</script>

<template>
  <form
    ref="dialogRef"
    class="metadata-edit-page"
    @submit.prevent="onSave"
    @compositionstart="composing = true"
    @compositionend="composing = false"
  >
    <div class="metadata-edit-body">
      <p
        v-if="metadata && ['playback-in-use', 'preload-in-use'].includes(editStatus)"
        class="metadata-dialog-playback-notice mb-3.5 auralis-type-caption"
        role="status"
        aria-live="polite"
      >
        {{
          t(
            editStatus === 'preload-in-use'
              ? 'library.metadataEditor.status.preloadInUse'
              : 'library.metadataEditor.status.playbackInUse',
          )
        }}
      </p>

      <div
        v-else-if="metadata && statusBanner"
        class="metadata-dialog-status-banner mb-3.5 flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 auralis-type-caption"
        :class="statusBanner.classes"
        role="status"
        aria-live="polite"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span v-if="statusBanner.icon" :class="statusBanner.icon" class="text-sm shrink-0"></span>
          <span>{{ statusBanner.message }}</span>
        </div>
        <button
          v-if="editStatus === 'query-failed'"
          type="button"
          class="metadata-dialog-btn-retry ml-auto shrink-0 rounded px-2.5 py-1 auralis-type-control font-semibold"
          @click="emit('retryStatus')"
        >
          {{ t('library.metadataEditor.status.retry') }}
        </button>
      </div>

      <p v-if="loading" class="auralis-type-control" role="status">
        {{ t('library.metadataEditor.status.loading') }}
      </p>

      <section
        v-if="metadata?.legacyMetadata"
        class="metadata-dialog-legacy metadata-dialog-status-banner metadata-dialog-status-banner--warning mb-3 grid gap-2"
        aria-labelledby="legacy-metadata-title"
      >
        <p id="legacy-metadata-title" class="auralis-type-control font-semibold">
          {{ t('library.metadataEditor.legacy.title') }}
        </p>
        <p class="auralis-type-caption">{{ t('library.metadataEditor.legacy.description') }}</p>
        <div v-if="legacyDifferences.length" class="max-h-56 overflow-auto">
          <table class="w-full table-fixed auralis-type-caption">
            <thead>
              <tr>
                <th scope="col" class="text-left">
                  {{ t('library.metadataEditor.legacy.field') }}
                </th>
                <th scope="col" class="text-left">{{ t('library.metadataEditor.legacy.file') }}</th>
                <th scope="col" class="text-left">
                  {{ t('library.metadataEditor.legacy.saved') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="difference in legacyDifferences" :key="difference.key">
                <th scope="row" class="text-left align-top">{{ difference.label }}</th>
                <td class="align-top break-words">{{ difference.file }}</td>
                <td class="align-top break-words">{{ difference.legacy }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div
        v-if="metadata && !metadata.legacyMetadata"
        class="metadata-edit-fields"
        spellcheck="false"
      >
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.title') }}
          <input
            ref="titleInputRef"
            v-model="form.title"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.title')"
            :disabled="isEditingDisabled"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.artist') }}
          <input
            v-model="form.artistDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.artist')"
            :disabled="isEditingDisabled"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.album') }}
          <input
            v-model="form.albumTitle"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.album')"
            :disabled="isEditingDisabled"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.albumArtist') }}
          <input
            v-model="form.albumArtistDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.albumArtist')"
            :disabled="isEditingDisabled"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.genre') }}
          <input
            v-model="form.genreDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.genre')"
            :disabled="isEditingDisabled"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.releaseDate') }}
          <input
            v-model="form.releaseDate"
            class="metadata-dialog-input metadata-dialog-input--numeric metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.releaseDate')"
            :disabled="isEditingDisabled"
            :aria-invalid="releaseDateHasError ? 'true' : undefined"
            :aria-describedby="releaseDateHasError ? 'metadata-dialog-error' : undefined"
          />
        </label>
      </div>

      <p
        v-if="localError || errorMessage"
        id="metadata-dialog-error"
        class="mt-3 auralis-type-caption text-red-600 font-medium"
        role="alert"
      >
        {{ localError ? t(localError) : errorMessage }}
      </p>
    </div>
    <footer class="metadata-edit-footer">
      <span class="sr-only" role="status" aria-live="polite">
        {{ saving ? saveButtonLabel : '' }}
      </span>
      <div class="flex flex-wrap justify-end gap-2">
        <slot name="footer-leading" />
        <template v-if="metadata?.legacyMetadata">
          <button
            type="button"
            class="metadata-dialog-btn-retry auralis-dialog-action"
            :disabled="isEditingDisabled"
            @click="resolveLegacy('adopt-file')"
          >
            {{ t('library.metadataEditor.legacy.adopt') }}
          </button>
          <button
            type="button"
            class="metadata-dialog-btn-retry auralis-dialog-action"
            :disabled="isEditingDisabled"
            @click="resolveLegacy('write-legacy')"
          >
            {{ t('library.metadataEditor.legacy.write') }}
          </button>
        </template>
        <button
          v-if="!metadata && !loading && errorMessage"
          class="metadata-dialog-btn-retry auralis-dialog-action"
          type="button"
          @click="emit('retryLoad')"
        >
          {{ t('library.metadataEditor.status.retry') }}
        </button>
        <button
          v-if="metadata && !metadata.legacyMetadata"
          class="metadata-dialog-btn-primary metadata-dialog-btn-save auralis-dialog-action auralis-dialog-action--primary"
          :class="{ 'metadata-dialog-btn-save--busy': saving }"
          type="submit"
          :disabled="isEditingDisabled"
          :aria-busy="saving && !saveSucceeded"
          :aria-label="saveButtonLabel"
        >
          <span
            class="metadata-dialog-save-content"
            :class="{ 'metadata-dialog-save-content--hidden': saving }"
            :aria-hidden="saving"
          >
            {{ t('library.metadataEditor.actions.save') }}
          </span>
          <span
            class="metadata-dialog-save-content metadata-dialog-save-feedback"
            :class="{ 'metadata-dialog-save-content--hidden': !saving }"
            aria-hidden="true"
          >
            <SaveProgressIcon v-if="saving" ref="saveProgress" />
          </span>
        </button>
      </div>
    </footer>
  </form>
</template>

<style scoped>
.metadata-edit-page {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}
.metadata-edit-body {
  min-height: 0;
  overflow: auto;
  padding: 22px 24px 28px;
}
.metadata-edit-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}
.metadata-edit-fields > label:nth-child(-n + 4) {
  grid-column: 1 / -1;
}
.metadata-edit-footer {
  margin-inline: 24px;
  padding: 20px 0 16px;
  border-top: 1px solid var(--auralis-border-subtle);
}

.metadata-dialog-legacy {
  padding: 12px;
}
.metadata-dialog-legacy p {
  margin: 0;
}
.metadata-dialog-legacy th,
.metadata-dialog-legacy td {
  padding: 4px;
}
.metadata-dialog-legacy th:first-child {
  width: 22%;
}
.metadata-dialog-playback-notice {
  color: var(--auralis-danger);
}

.metadata-dialog-btn-save {
  display: inline-grid;
}

.metadata-dialog-btn-save--busy:disabled {
  opacity: 1;
}

.metadata-dialog-save-feedback {
  min-width: 20px;
  height: 20px;
}

.metadata-dialog-save-content {
  grid-area: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.metadata-dialog-save-content--hidden {
  visibility: hidden;
}

.metadata-dialog-status-banner {
  box-sizing: border-box;
  background: var(--auralis-surface-raised);
  border: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text);
}

.metadata-dialog-status-banner--info {
  border-color: var(--auralis-border-subtle);
  background: var(--auralis-surface-raised);
  color: var(--auralis-text-muted);
}

.metadata-dialog-status-banner--warning {
  border-color: color-mix(in srgb, #f59e0b 35%, var(--auralis-border-subtle));
  background: color-mix(in srgb, #f59e0b 10%, var(--auralis-surface-raised));
  color: var(--auralis-text);
}

.metadata-dialog-status-banner--error {
  border-color: color-mix(in srgb, var(--auralis-danger) 35%, var(--auralis-border-subtle));
  background: color-mix(in srgb, var(--auralis-danger) 10%, var(--auralis-surface-raised));
  color: var(--auralis-text);
}

.metadata-dialog-btn-retry {
  background: var(--auralis-control-hover-bg);
  border: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.metadata-dialog-btn-retry:hover {
  background: var(--auralis-control-active-bg);
  border-color: var(--auralis-text-muted);
}

.metadata-dialog-label {
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  color: var(--auralis-text-muted);
}

.metadata-dialog-input {
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  box-sizing: border-box;
  width: 100%;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 24%, transparent);
  border-radius: 999px;
  padding: 7px 15px;
  color: var(--auralis-text);
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.metadata-dialog-input:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -1px;
  border-color: var(--auralis-focus-ring);
}

.metadata-dialog-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.metadata-dialog-input[aria-invalid='true'] {
  border-color: var(--auralis-danger);
}
@media (max-width: 600px) {
  .metadata-edit-body {
    padding-inline: 16px;
  }
  .metadata-edit-footer {
    margin-inline: 16px;
  }
  .metadata-edit-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-height: 600px) {
  .metadata-edit-body {
    padding-block: 14px;
  }
  .metadata-edit-footer {
    padding-block: 12px;
  }
}
</style>
