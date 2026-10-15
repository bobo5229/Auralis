<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LibraryViewMode } from '../types/libraryInteraction'
import {
  RECENT_ADDED_LIBRARY_RANGES,
  type RecentAddedLibraryRange,
} from '../utils/recentAddedLibrary'

const props = defineProps<{
  viewMode: LibraryViewMode
  range: RecentAddedLibraryRange
  persistFailed: boolean
}>()

const emit = defineEmits<{
  changeView: [mode: LibraryViewMode]
  changeRange: [range: RecentAddedLibraryRange]
}>()

const { t } = useI18n()
const viewGroup = ref<HTMLDivElement | null>(null)
const rangeGroup = ref<HTMLDivElement | null>(null)

const viewOptions = [
  { value: 'flat', label: 'library.recentAdded.tracks' },
  { value: 'cover', label: 'library.recentAdded.albums' },
] as const satisfies ReadonlyArray<{ value: LibraryViewMode; label: string }>

const rangeOptions = RECENT_ADDED_LIBRARY_RANGES.map((value) => ({
  value,
  label: value === 'all' ? 'library.recentAdded.all' : `library.recentAdded.days${value}`,
}))

function nextRadioValue<T>(
  event: KeyboardEvent,
  options: readonly { value: T }[],
  current: T,
): T | null {
  const currentIndex = options.findIndex((option) => option.value === current)
  if (currentIndex < 0) return null
  if (event.key === 'Home') return options[0].value
  if (event.key === 'End') return options[options.length - 1].value

  let offset = 0
  if (event.key === 'ArrowRight') offset = 1
  else if (event.key === 'ArrowLeft') offset = -1
  else return null

  return options[(currentIndex + offset + options.length) % options.length].value
}

function focusRadioValue(group: typeof viewGroup, value: string | number): void {
  void nextTick(() => {
    group.value
      ?.querySelector<HTMLButtonElement>(`[data-radio-value="${String(value)}"]`)
      ?.focus()
  })
}

function onViewKeydown(event: KeyboardEvent): void {
  const value = nextRadioValue(event, viewOptions, props.viewMode)
  if (value === null) return
  event.preventDefault()
  emit('changeView', value)
  focusRadioValue(viewGroup, value)
}

function onRangeKeydown(event: KeyboardEvent): void {
  const value = nextRadioValue(event, rangeOptions, props.range)
  if (value === null) return
  event.preventDefault()
  emit('changeRange', value)
  focusRadioValue(rangeGroup, value)
}
</script>

<template>
  <header class="recent-added-toolbar settings-controls" aria-labelledby="recent-added-title">
    <h1 id="recent-added-title" class="recent-added-toolbar-title auralis-type-page">
      {{ t('sidebar.recentAdded') }}
    </h1>
    <div class="recent-added-toolbar-controls">
      <div class="recent-added-toolbar-group">
        <div
          ref="viewGroup"
          class="settings-segmented-control"
          role="radiogroup"
          :aria-label="t('library.recentAdded.viewLabel')"
          @keydown="onViewKeydown"
        >
          <button
            v-for="option in viewOptions"
            :key="option.value"
            type="button"
            class="settings-segmented-option"
            :class="{ 'is-selected': viewMode === option.value }"
            :data-radio-value="option.value"
            role="radio"
            :aria-checked="viewMode === option.value"
            :tabindex="viewMode === option.value ? 0 : -1"
            @click="emit('changeView', option.value)"
          >
            {{ t(option.label) }}
          </button>
        </div>
      </div>
      <div class="recent-added-toolbar-group recent-added-toolbar-range">
        <span class="recent-added-toolbar-label auralis-type-caption">
          {{ t('library.recentAdded.rangeLabel') }}
        </span>
        <div
          ref="rangeGroup"
          class="settings-segmented-control"
          role="radiogroup"
          :aria-label="t('library.recentAdded.rangeLabel')"
          @keydown="onRangeKeydown"
        >
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            class="settings-segmented-option"
            :class="{ 'is-selected': range === option.value }"
            :data-radio-value="option.value"
            role="radio"
            :aria-checked="range === option.value"
            :tabindex="range === option.value ? 0 : -1"
            @click="emit('changeRange', option.value)"
          >
            {{ t(option.label) }}
          </button>
        </div>
      </div>
    </div>
    <p v-if="persistFailed" class="recent-added-toolbar-error auralis-type-caption" role="status">
      {{ t('library.recentAdded.persistFailed') }}
    </p>
  </header>
</template>

<style scoped>
.recent-added-toolbar {
  flex: 0 0 auto;
  padding: 16px 20px;
}

.recent-added-toolbar-title {
  margin: 0 0 12px;
  color: var(--auralis-text);
}

.recent-added-toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.recent-added-toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.recent-added-toolbar-range {
  margin-left: auto;
}

.recent-added-toolbar-label {
  color: var(--auralis-text-muted);
  white-space: nowrap;
}

.recent-added-toolbar .settings-segmented-control {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
}

.recent-added-toolbar-error {
  margin: 8px 0 0;
  color: var(--auralis-text-muted);
}
</style>
