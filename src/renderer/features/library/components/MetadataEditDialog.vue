<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'

const props = defineProps<{
  metadata: EditableTrackMetadata | null
  saving: boolean
  errorMessage: string | null
}>()

const emit = defineEmits<{
  close: []
  save: [metadata: EditableTrackMetadata]
}>()

const localError = ref<string | null>(null)

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
    return 'Release Date must use YYYY, YYYY-MM, or YYYY-MM-DD.'
  }

  const month = match[2] ? Number.parseInt(match[2], 10) : null
  const day = match[3] ? Number.parseInt(match[3], 10) : null

  if (month !== null && (month < 1 || month > 12)) {
    return 'Release Date month must be between 01 and 12.'
  }

  if (day !== null && (day < 1 || day > 31)) {
    return 'Release Date day must be between 01 and 31.'
  }

  return null
}

function onSave(): void {
  if (!props.metadata) {
    return
  }

  const yearText = form.year.trim()
  const releaseDate = normalize(form.releaseDate)

  if (yearText && !/^\d{1,4}$/.test(yearText)) {
    localError.value = 'Year must be a number from 0 to 9999.'
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
</script>

<template>
  <Teleport to="body">
    <div
      v-if="metadata"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4"
      @click.self="$emit('close')"
    >
      <section
        class="w-full max-w-xl rounded-lg border border-[var(--auralis-border-subtle)] bg-[var(--auralis-dialog-bg)] p-5 shadow-xl"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold">编辑元数据</h2>
          <button
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]"
            type="button"
            aria-label="Close"
            @click="$emit('close')"
          >
            <span class="i-lucide-x text-sm"></span>
          </button>
        </div>

        <div class="grid gap-3">
          <label class="grid gap-1 text-xs text-[var(--auralis-text-muted)]">
            Title
            <input v-model="form.title" class="metadata-input" />
          </label>
          <label class="grid gap-1 text-xs text-[var(--auralis-text-muted)]">
            Artist
            <input v-model="form.artistDisplay" class="metadata-input" />
          </label>
          <label class="grid gap-1 text-xs text-[var(--auralis-text-muted)]">
            Album
            <input v-model="form.albumTitle" class="metadata-input" />
          </label>
          <label class="grid gap-1 text-xs text-[var(--auralis-text-muted)]">
            Album Artist
            <input v-model="form.albumArtistDisplay" class="metadata-input" />
          </label>
          <div class="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_112px]">
            <label class="grid min-w-0 gap-1 text-xs text-[var(--auralis-text-muted)]">
              Genre
              <input v-model="form.genreDisplay" class="metadata-input" />
            </label>
            <label class="grid min-w-0 gap-1 text-xs text-[var(--auralis-text-muted)]">
              Year
              <input v-model="form.year" class="metadata-input" inputmode="numeric" />
            </label>
          </div>
          <label class="grid gap-1 text-xs text-[var(--auralis-text-muted)]">
            Release Date
            <input v-model="form.releaseDate" class="metadata-input" placeholder="YYYY-MM-DD" />
          </label>
        </div>

        <p v-if="localError || errorMessage" class="mt-3 text-xs text-[var(--auralis-text-muted)]">
          {{ localError || errorMessage }}
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button class="player-control" type="button" @click="$emit('close')">取消</button>
          <button
            class="player-control-primary hover:bg-transparent"
            type="button"
            :disabled="saving"
            @click="onSave"
          >
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
