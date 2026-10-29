<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'
import {
  EDITABLE_TAG_FIELDS,
  NUMBER_TAG_FIELDS,
  normalizeMetadataField,
} from '@shared/utils/metadataEditRequest'
import { mergeMetadataDraft } from '@shared/utils/metadataDraftMerge'
import type { EditableTagField } from '@shared/types/trackMetadata'
import MetadataArtworkEditor from './MetadataArtworkEditor.vue'
import type { MetadataArtworkChange } from '@shared/types/metadataArtworkEdit'
import { validateMetadataChanges } from '@shared/utils/metadataNumbers'
import { createMetadataEditRequest } from '@shared/utils/metadataEditRequest'
import SaveProgressIcon from './SaveProgressIcon.vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { normalizeReleaseDate, releaseDateYear } from '@shared/utils/releaseDate'
import type { MetadataEditStatus } from '../composables/useLibraryMetadataEditor'

const props = withDefaults(
  defineProps<{
    metadata: EditableTrackMetadata | null
    disabled?: boolean
    readOnly?: boolean
    active?: boolean
    loading?: boolean
    conflict?: boolean
    refreshPending?: boolean
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
  reconcile: []
  retryRefresh: []
  busyChange: [boolean]
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLFormElement | null>(null)
const savedForm = ref('')
const artworkEditor = ref<InstanceType<typeof MetadataArtworkEditor> | null>(null)
const artworkChanges = ref<MetadataArtworkChange[]>([])
const composing = ref(false)
const dirty = computed(
  () =>
    !!props.metadata &&
    (JSON.stringify(form) !== savedForm.value ||
      mergingLegacy.value ||
      artworkChanges.value.length > 0),
)
function markCommitted(): void {
  mergingLegacy.value = false
  artworkEditor.value?.clearCommitted()
  artworkChanges.value = []
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

const previousDraft = ref<EditableTrackMetadata | null>(null)
const resetConfirm = ref(false)
const fieldConflicts = ref<
  Array<{ field: EditableTagField; file: string | number | null; mine: string | number | null }>
>([])
const legacyChoices = reactive<Record<string, 'file' | 'legacy'>>({})
const mergingLegacy = ref(false)
function draftMetadata(): EditableTrackMetadata {
  const value = { ...props.metadata!, artworkChanges: artworkChanges.value }
  for (const field of EDITABLE_TAG_FIELDS)
    Object.assign(value, { [field]: normalizeMetadataField(field, form[field]) })
  value.year = releaseDateYear(value.releaseDate)
  return value
}
function setForm(value: EditableTrackMetadata): void {
  for (const field of EDITABLE_TAG_FIELDS) form[field] = String(value[field] ?? '')
}
function reconcile(baseline: EditableTrackMetadata, latest: EditableTrackMetadata): void {
  const draft = draftMetadata()
  if (latest.legacyMetadata) previousDraft.value = draft
  const result = mergeMetadataDraft(baseline, latest, draft)
  setForm(latest)
  savedForm.value = JSON.stringify(form)
  setForm(result.value)
  fieldConflicts.value = result.conflicts.map((field) => ({
    field,
    file: normalizeMetadataField(field, latest[field]),
    mine: normalizeMetadataField(field, result.value[field]),
  }))
  mergingLegacy.value = false
  resetConfirm.value = false
}
function chooseConflict(field: EditableTagField, source: 'file' | 'mine'): void {
  const conflict = fieldConflicts.value.find((value) => value.field === field)
  if (!conflict) return
  form[field] = String(conflict[source] ?? '')
  fieldConflicts.value = fieldConflicts.value.filter((value) => value.field !== field)
}
function resetForm(): void {
  if (artworkChanges.value.length) artworkEditor.value?.discardQueued()
  Object.assign(form, JSON.parse(savedForm.value))
  fieldConflicts.value = []
  resetConfirm.value = false
  localError.value = null
}
function fieldDisabled(field: EditableTagField): boolean {
  return (
    !!areFieldsDisabled.value ||
    (props.metadata?.capabilities ? !props.metadata.capabilities.fields[field] : false)
  )
}
function startMergedLegacy(): void {
  if (!props.metadata?.legacyMetadata) return
  const value = { ...props.metadata }
  for (const difference of legacyDifferences.value) {
    if (legacyChoices[difference.key] === 'legacy')
      Object.assign(value, {
        [difference.key]:
          difference.key === 'releaseDate'
            ? (props.metadata.legacyMetadata.releaseDate ??
              (props.metadata.legacyMetadata.year === null
                ? null
                : String(props.metadata.legacyMetadata.year).padStart(4, '0')))
            : props.metadata.legacyMetadata[difference.key],
      })
  }
  setForm(value)
  mergingLegacy.value = true
}
defineExpose({ showSaveSuccess, dirty, composing, markCommitted, focus, reconcile, save: onSave })

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
  } as const
  return (Object.keys(fields) as Array<keyof typeof fields>)
    .filter((key) =>
      key === 'releaseDate'
        ? (legacy.releaseDate ?? legacy.year) !==
          (props.metadata!.releaseDate ?? props.metadata!.year)
        : legacy[key] !== props.metadata![key],
    )
    .map((key) => ({
      key,
      label: t(`library.metadataEditor.fields.${fields[key]}`),
      file:
        (key === 'releaseDate'
          ? (props.metadata!.releaseDate ?? props.metadata!.year)
          : props.metadata![key]) ?? '—',
      legacy: (key === 'releaseDate' ? (legacy.releaseDate ?? legacy.year) : legacy[key]) ?? '—',
    }))
})
const areFieldsDisabled = computed(
  () =>
    props.disabled ||
    !props.metadata ||
    props.loading ||
    props.saving ||
    (!props.readOnly && !['editable', 'playback-editable'].includes(props.editStatus)),
)
const isEditingDisabled = computed(() => areFieldsDisabled.value || props.readOnly)

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

const form = reactive<Record<EditableTagField, string>>({
  title: '',
  artistDisplay: '',
  albumTitle: '',
  albumArtistDisplay: '',
  genreDisplay: '',
  releaseDate: '',
  trackNo: '',
  trackTotal: '',
  discNo: '',
  discTotal: '',
  composer: '',
  copyright: '',
  isrc: '',
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
    for (const key of Object.keys(legacyChoices)) delete legacyChoices[key]
    fieldConflicts.value = []
    mergingLegacy.value = false
    resetConfirm.value = false
    if (metadata) setForm(metadata)
    else for (const field of EDITABLE_TAG_FIELDS) form[field] = ''
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
  if (
    !props.metadata ||
    isEditingDisabled.value ||
    composing.value ||
    fieldConflicts.value.length ||
    artworkEditor.value?.hasConflict
  ) {
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

  if (
    releaseDate?.length === 7 &&
    releaseDate !== props.metadata.releaseDate &&
    props.metadata.capabilities &&
    !props.metadata.capabilities.datePrecisions.includes('month')
  ) {
    localError.value = 'metadataEditorExtra.monthUnsupported'
    return
  }
  for (const field of NUMBER_TAG_FIELDS)
    if (
      normalizeMetadataField(field, form[field]) !==
        normalizeMetadataField(field, props.metadata[field]) &&
      form[field] &&
      (!/^\d+$/.test(form[field]) || Number(form[field]) < 1 || Number(form[field]) > 65535)
    ) {
      localError.value = 'metadataEditorExtra.numberInvalid'
      return
    }
  const value = draftMetadata()
  try {
    validateMetadataChanges(
      props.metadata,
      createMetadataEditRequest(value, props.metadata).changes,
    )
  } catch {
    localError.value = 'metadataEditorExtra.numberInvalid'
    return
  }
  localError.value = null
  emit('save', {
    ...value,
    ...(mergingLegacy.value ? { legacyAction: 'apply-merged' as const } : {}),
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

      <details v-if="metadata?.fileSummary" class="metadata-file-summary auralis-type-caption mb-3">
        <summary>
          {{ metadata.fileSummary.fileName }} · {{ metadata.fileSummary.format }} ·
          {{ t('metadataEditorExtra.targets', { count: metadata.fileSummary.targetCount }) }}
        </summary>
        <p class="break-all">{{ metadata.fileSummary.filePath }}</p>
      </details>
      <div v-if="conflict" role="alert" class="mb-3 grid gap-2 auralis-type-caption">
        <p>{{ t('metadataEditorExtra.conflict') }}</p>
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="disabled || loading || saving"
          @click="emit('reconcile')"
        >
          {{ t('metadataEditorExtra.reload') }}
        </button>
      </div>
      <div v-if="refreshPending" role="status" class="mb-3 grid gap-2 auralis-type-caption">
        <p>{{ t('metadataEditorExtra.savedRefreshPending') }}</p>
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="saving"
          @click="emit('retryRefresh')"
        >
          {{ t('metadataEditorExtra.retryRefresh') }}
        </button>
      </div>
      <details v-if="previousDraft" class="mb-3 auralis-type-caption">
        <summary>{{ t('metadataEditorExtra.previousDraft') }}</summary>
        <p v-for="field in EDITABLE_TAG_FIELDS" :key="field" class="break-all">
          {{ t(`metadataEditorExtra.fields.${field}`) }}: {{ previousDraft[field] ?? '—' }}
        </p>
      </details>
      <section
        v-if="metadata?.legacyMetadata && !mergingLegacy"
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
                <td class="align-top break-words">
                  {{ difference.legacy }}
                  <select
                    :value="legacyChoices[difference.key]"
                    :disabled="isEditingDisabled"
                    :aria-label="difference.label"
                    class="metadata-dialog-input"
                    @change="
                      legacyChoices[difference.key] = ($event.target as HTMLSelectElement).value as
                        | 'file'
                        | 'legacy'
                    "
                  >
                    <option disabled :value="undefined">
                      {{ t('metadataEditorExtra.choose') }}
                    </option>
                    <option value="file">{{ t('metadataEditorExtra.fileValue') }}</option>
                    <option value="legacy">{{ t('metadataEditorExtra.legacyValue') }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="
            isEditingDisabled || legacyDifferences.some((item) => !legacyChoices[item.key])
          "
          @click="startMergedLegacy"
        >
          {{ t('metadataEditorExtra.mergeLegacy') }}
        </button>
      </section>

      <section
        v-if="fieldConflicts.length"
        class="mb-3 grid gap-2 auralis-type-caption"
        role="alert"
      >
        <p>{{ t('metadataEditorExtra.chooseConflicts') }}</p>
        <div v-for="item in fieldConflicts" :key="item.field" class="grid gap-2">
          <strong>{{ t(`metadataEditorExtra.fields.${item.field}`) }}</strong>
          <button
            type="button"
            class="auralis-dialog-action"
            :disabled="disabled || saving"
            @click="chooseConflict(item.field, 'file')"
          >
            {{ t('metadataEditorExtra.fileValue') }}: {{ item.file ?? '—' }}
          </button>
          <button
            type="button"
            class="auralis-dialog-action"
            :disabled="disabled || saving"
            @click="chooseConflict(item.field, 'mine')"
          >
            {{ t('metadataEditorExtra.myValue') }}: {{ item.mine ?? '—' }}
          </button>
        </div>
      </section>
      <div
        v-if="metadata && (!metadata.legacyMetadata || mergingLegacy)"
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
            :disabled="fieldDisabled('title')"
            :readonly="readOnly"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.artist') }}
          <input
            v-model="form.artistDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.artist')"
            :disabled="fieldDisabled('artistDisplay')"
            :readonly="readOnly"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.album') }}
          <input
            v-model="form.albumTitle"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.album')"
            :disabled="fieldDisabled('albumTitle')"
            :readonly="readOnly"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.albumArtist') }}
          <input
            v-model="form.albumArtistDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.albumArtist')"
            :disabled="fieldDisabled('albumArtistDisplay')"
            :readonly="readOnly"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.genre') }}
          <input
            v-model="form.genreDisplay"
            class="metadata-dialog-input metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.genre')"
            :disabled="fieldDisabled('genreDisplay')"
            :readonly="readOnly"
          />
        </label>
        <label class="metadata-dialog-label">
          {{ t('library.metadataEditor.fields.releaseDate') }}
          <input
            v-model="form.releaseDate"
            class="metadata-dialog-input metadata-dialog-input--numeric metadata-input"
            :placeholder="t('library.metadataEditor.placeholders.releaseDate')"
            :disabled="fieldDisabled('releaseDate')"
            :readonly="readOnly"
            :aria-invalid="releaseDateHasError ? 'true' : undefined"
            :aria-describedby="releaseDateHasError ? 'metadata-dialog-error' : undefined"
          />
        </label>
      </div>

      <div v-if="metadata && (!metadata.legacyMetadata || mergingLegacy)" class="grid gap-3 mt-3">
        <p class="auralis-type-caption text-[var(--auralis-text-muted)]">
          {{ t('metadataEditorExtra.multiHint') }}
        </p>
        <p class="auralis-type-caption text-[var(--auralis-text-muted)]">
          {{ t('metadataEditorExtra.dateHint')
          }}<span
            v-if="metadata.capabilities && !metadata.capabilities.datePrecisions.includes('month')"
          >
            {{ t('metadataEditorExtra.monthUnsupported') }}</span
          >
        </p>
        <details open class="metadata-extra-section">
          <summary class="auralis-type-control">{{ t('metadataEditorExtra.numbering') }}</summary>
          <div class="metadata-number-fields">
            <label v-for="field in NUMBER_TAG_FIELDS" :key="field" class="metadata-dialog-label">
              {{ t(`metadataEditorExtra.fields.${field}`) }}
              <input
                v-model="form[field]"
                inputmode="numeric"
                class="metadata-dialog-input metadata-input"
                :disabled="fieldDisabled(field)"
                :readonly="readOnly"
                :aria-label="t(`metadataEditorExtra.fields.${field}`)"
              />
            </label>
          </div>
        </details>
        <details class="metadata-extra-section">
          <summary class="auralis-type-control">{{ t('metadataEditorExtra.moreTags') }}</summary>
          <label
            v-for="field in ['composer', 'copyright', 'isrc'] as const"
            :key="field"
            class="metadata-dialog-label mt-2"
          >
            {{ t(`metadataEditorExtra.fields.${field}`) }}
            <input
              v-model="form[field]"
              class="metadata-dialog-input metadata-input"
              :disabled="fieldDisabled(field)"
              :readonly="readOnly"
            />
          </label>
        </details>
      </div>
      <MetadataArtworkEditor
        v-if="metadata && (!metadata.legacyMetadata || mergingLegacy)"
        ref="artworkEditor"
        :metadata="metadata"
        :disabled="!!isEditingDisabled"
        @change="artworkChanges = $event"
        @busy-change="emit('busyChange', $event)"
      />
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
      <div v-if="resetConfirm" class="mb-2 auralis-type-caption" role="alert">
        <p>{{ t('metadataEditorExtra.resetConfirm') }}</p>
        <button type="button" class="auralis-dialog-action" @click="resetConfirm = false">
          {{ t('lyricsEditor.continue') }}
        </button>
        <button type="button" class="auralis-dialog-action" @click="resetForm">
          {{ t('metadataEditorExtra.reset') }}
        </button>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          v-if="metadata && (!metadata.legacyMetadata || mergingLegacy)"
          type="button"
          class="auralis-dialog-action"
          :disabled="isEditingDisabled || !dirty"
          @click="resetConfirm = true"
        >
          {{ t('metadataEditorExtra.reset') }}
        </button>
        <slot name="footer-leading" />
        <template v-if="metadata?.legacyMetadata && !mergingLegacy">
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
          v-if="metadata && (!metadata.legacyMetadata || mergingLegacy)"
          class="metadata-dialog-btn-primary metadata-dialog-btn-save auralis-dialog-action auralis-dialog-action--primary"
          :class="{ 'metadata-dialog-btn-save--busy': saving }"
          type="submit"
          :disabled="isEditingDisabled || fieldConflicts.length > 0"
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
.metadata-extra-section {
  border-top: 1px solid var(--auralis-border-subtle);
  padding-top: 12px;
}
.metadata-extra-section summary {
  cursor: pointer;
  padding-bottom: 8px;
}
.metadata-number-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.metadata-file-summary {
  color: var(--auralis-text-muted);
}

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
