<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { LibraryPresentation } from '../types/libraryPresentation'

const props = withDefaults(
  defineProps<{
    presentation?: LibraryPresentation
    metadata: EditableTrackMetadata | null
    saving: boolean
    errorMessage: string | null
  }>(),
  {
    presentation: 'modern',
  },
)

const emit = defineEmits<{
  close: []
  save: [metadata: EditableTrackMetadata]
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLFormElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)
const localError = ref<string | null>(null)

const yearHasError = computed(
  () => localError.value === t('library.metadataEditor.validation.yearInvalid'),
)
const releaseDateHasError = computed(
  () => localError.value === t('library.metadataEditor.validation.dateInvalid'),
)

const form = reactive({
  title: '',
  artistDisplay: '',
  albumTitle: '',
  albumArtistDisplay: '',
  genreDisplay: '',
  year: '',
  releaseDate: '',
})

watch(
  () => props.metadata,
  (metadata) => {
    localError.value = null
    form.title = metadata?.title ?? ''
    form.artistDisplay = metadata?.artistDisplay ?? ''
    form.albumTitle = metadata?.albumTitle ?? ''
    form.albumArtistDisplay = metadata?.albumArtistDisplay ?? ''
    form.genreDisplay = metadata?.genreDisplay ?? ''
    form.year = metadata?.year === null || metadata?.year === undefined ? '' : String(metadata.year)
    form.releaseDate = metadata?.releaseDate ?? ''

    if (metadata) {
      nextTick(() => {
        titleInputRef.value?.focus()
      })
    }
  },
  { immediate: true },
)

function normalize(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function validateReleaseDate(value: string): string | null {
  const match = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/)

  if (!match) {
    return t('library.metadataEditor.validation.dateInvalid')
  }

  const month = match[2] ? Number.parseInt(match[2], 10) : null
  const day = match[3] ? Number.parseInt(match[3], 10) : null

  if (month !== null && (month < 1 || month > 12)) {
    return t('library.metadataEditor.validation.dateInvalid')
  }

  if (day !== null && (day < 1 || day > 31)) {
    return t('library.metadataEditor.validation.dateInvalid')
  }

  return null
}

function onSave(): void {
  if (!props.metadata || props.saving) {
    return
  }

  const yearText = form.year.trim()
  const releaseDate = normalize(form.releaseDate)

  if (yearText && !/^\d{1,4}$/.test(yearText)) {
    localError.value = t('library.metadataEditor.validation.yearInvalid')
    return
  }

  if (releaseDate) {
    const releaseDateError = validateReleaseDate(releaseDate)

    if (releaseDateError) {
      localError.value = releaseDateError
      return
    }
  }

  localError.value = null
  const parsedYear = yearText ? Number.parseInt(yearText, 10) : null

  emit('save', {
    trackId: props.metadata.trackId,
    title: normalize(form.title),
    artistDisplay: normalize(form.artistDisplay),
    albumTitle: normalize(form.albumTitle),
    albumArtistDisplay: normalize(form.albumArtistDisplay),
    genreDisplay: normalize(form.genreDisplay),
    year: Number.isInteger(parsedYear) ? parsedYear : null,
    releaseDate,
  })
}

function onClose(): void {
  if (props.saving) return
  emit('close')
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
    return
  }

  if (e.key === 'Tab' && dialogRef.value) {
    const focusables = dialogRef.value.querySelectorAll<HTMLElement>(
      'input:not(:disabled), button:not(:disabled)',
    )
    if (focusables.length === 0) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="metadata"
      class="library-overlay"
      :data-visual-style="presentation"
      data-library-overlay="metadata-dialog"
    >
      <div
        class="fixed inset-0 z-[70] flex items-center justify-center p-4 library-dialog-scrim"
        @keydown="onKeyDown"
      >
        <form
          ref="dialogRef"
          class="metadata-dialog-panel w-full max-w-xl rounded-lg p-5 shadow-xl select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="metadata-dialog-title"
          :aria-describedby="localError || errorMessage ? 'metadata-dialog-error' : undefined"
          @submit.prevent="onSave"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 id="metadata-dialog-title" class="metadata-dialog-header text-base font-semibold">
              {{ t('library.metadataEditor.title') }}
            </h2>
            <button
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)] disabled:opacity-40"
              type="button"
              :aria-label="t('facets.close')"
              :disabled="saving"
              @click="onClose"
            >
              <span class="i-lucide-x text-sm"></span>
            </button>
          </div>

          <div class="grid gap-3">
            <label class="metadata-dialog-label grid gap-1 text-xs">
              {{ t('library.metadataEditor.fields.title') }}
              <input
                ref="titleInputRef"
                v-model="form.title"
                class="metadata-dialog-input metadata-input"
                :placeholder="t('library.metadataEditor.placeholders.title')"
                :disabled="saving"
              />
            </label>
            <label class="metadata-dialog-label grid gap-1 text-xs">
              {{ t('library.metadataEditor.fields.artist') }}
              <input
                v-model="form.artistDisplay"
                class="metadata-dialog-input metadata-input"
                :placeholder="t('library.metadataEditor.placeholders.artist')"
                :disabled="saving"
              />
            </label>
            <label class="metadata-dialog-label grid gap-1 text-xs">
              {{ t('library.metadataEditor.fields.album') }}
              <input
                v-model="form.albumTitle"
                class="metadata-dialog-input metadata-input"
                :placeholder="t('library.metadataEditor.placeholders.album')"
                :disabled="saving"
              />
            </label>
            <label class="metadata-dialog-label grid gap-1 text-xs">
              {{ t('library.metadataEditor.fields.albumArtist') }}
              <input
                v-model="form.albumArtistDisplay"
                class="metadata-dialog-input metadata-input"
                :placeholder="t('library.metadataEditor.placeholders.albumArtist')"
                :disabled="saving"
              />
            </label>
            <div class="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_112px]">
              <label class="metadata-dialog-label grid min-w-0 gap-1 text-xs">
                {{ t('library.metadataEditor.fields.genre') }}
                <input
                  v-model="form.genreDisplay"
                  class="metadata-dialog-input metadata-input"
                  :placeholder="t('library.metadataEditor.placeholders.genre')"
                  :disabled="saving"
                />
              </label>
              <label class="metadata-dialog-label grid min-w-0 gap-1 text-xs">
                {{ t('library.metadataEditor.fields.year') }}
                <input
                  v-model="form.year"
                  class="metadata-dialog-input metadata-dialog-input--numeric metadata-input"
                  inputmode="numeric"
                  :placeholder="t('library.metadataEditor.placeholders.year')"
                  :disabled="saving"
                  :aria-invalid="yearHasError ? 'true' : undefined"
                  :aria-describedby="yearHasError ? 'metadata-dialog-error' : undefined"
                />
              </label>
            </div>
            <label class="metadata-dialog-label grid gap-1 text-xs">
              {{ t('library.metadataEditor.fields.releaseDate') }}
              <input
                v-model="form.releaseDate"
                class="metadata-dialog-input metadata-dialog-input--numeric metadata-input"
                :placeholder="t('library.metadataEditor.placeholders.releaseDate')"
                :disabled="saving"
                :aria-invalid="releaseDateHasError ? 'true' : undefined"
                :aria-describedby="releaseDateHasError ? 'metadata-dialog-error' : undefined"
              />
            </label>
          </div>

          <p
            v-if="localError || errorMessage"
            id="metadata-dialog-error"
            class="mt-3 text-xs text-red-600 font-medium"
            role="alert"
          >
            {{ localError || errorMessage }}
          </p>

          <div class="mt-5 flex justify-end gap-2">
            <button
              class="metadata-dialog-btn-secondary player-control px-4 py-1.5 text-xs font-semibold"
              type="button"
              :disabled="saving"
              @click="onClose"
            >
              {{ t('library.metadataEditor.actions.cancel') }}
            </button>
            <button
              class="metadata-dialog-btn-primary player-control-primary px-4 py-1.5 text-xs font-semibold"
              type="submit"
              :disabled="saving"
            >
              {{
                saving
                  ? t('library.metadataEditor.actions.saving')
                  : t('library.metadataEditor.actions.save')
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
