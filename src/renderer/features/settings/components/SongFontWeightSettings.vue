<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SONG_COVER_FONT_FIELDS,
  SONG_LIST_FONT_FIELDS,
  defaultSongFontWeight,
  type SongFontWeightChoice,
  type SongFontWeightView,
} from '@renderer/features/appearance/constants/songFontWeights'
import { useSongFontWeights } from '@renderer/features/appearance/composables/useSongFontWeights'
import SongFontWeightPreview from './SongFontWeightPreview.vue'
import SongFontWeightSelect from './SongFontWeightSelect.vue'

const { t } = useI18n()
const { persistFailed, songFontWeightChoice, setSongFontWeight, resetSongFontWeightView } =
  useSongFontWeights()

const previewView = ref<SongFontWeightView>('cover')
const resetAnnounced = ref(false)

const activeFields = computed(() =>
  previewView.value === 'list' ? SONG_LIST_FONT_FIELDS : SONG_COVER_FONT_FIELDS,
)

const statusText = computed(() => {
  if (persistFailed.value) return t('settings.appearance.songFontWeight.persistFailed')
  if (resetAnnounced.value) return t('settings.appearance.songFontWeight.resetStatus')
  return ''
})

watch(previewView, () => {
  resetAnnounced.value = false
})

function fieldId(field: string): string {
  return `song-font-weight-${previewView.value}-${field}`
}

function defaultWeight(field: string): number {
  return defaultSongFontWeight(previewView.value, field) ?? 400
}

function onWeightChange(field: string, choice: SongFontWeightChoice): void {
  resetAnnounced.value = false
  setSongFontWeight(previewView.value, field, choice)
}

function onReset(): void {
  resetSongFontWeightView(previewView.value)
  resetAnnounced.value = true
}
</script>

<template>
  <div class="settings-group">
    <details class="song-font-weight-details">
      <summary class="song-font-weight-summary">
        <span>{{ t('settings.appearance.songFontWeight.title') }}</span>
        <span
          class="song-font-weight-chevron i-lucide-chevron-down h-4 w-4"
          aria-hidden="true"
        ></span>
      </summary>

      <div class="song-font-weight-toolbar">
        <div
          class="settings-segmented-control"
          role="group"
          :aria-label="t('settings.appearance.songFontWeight.viewGroup')"
        >
          <button
            type="button"
            class="settings-segmented-option"
            :class="{ 'is-selected': previewView === 'list' }"
            :aria-pressed="previewView === 'list'"
            @click="previewView = 'list'"
          >
            {{ t('settings.appearance.songFontWeight.listView') }}
          </button>
          <button
            type="button"
            class="settings-segmented-option"
            :class="{ 'is-selected': previewView === 'cover' }"
            :aria-pressed="previewView === 'cover'"
            @click="previewView = 'cover'"
          >
            {{ t('settings.appearance.songFontWeight.coverView') }}
          </button>
        </div>
        <button type="button" class="song-font-weight-reset" @click="onReset">
          {{ t('settings.appearance.songFontWeight.resetView') }}
        </button>
      </div>

      <p
        v-if="statusText"
        class="song-font-weight-status"
        :class="{ 'is-warning': persistFailed }"
        role="status"
      >
        {{ statusText }}
      </p>

      <div class="song-font-weight-rows">
        <div
          v-for="field in activeFields"
          :key="`${previewView}-${field}`"
          class="settings-row song-font-weight-row"
        >
          <div>
            <strong :id="`${fieldId(field)}-label`">{{
              t(`settings.appearance.songFontWeight.fields.${field}`)
            }}</strong>
          </div>
          <SongFontWeightSelect
            :id="fieldId(field)"
            :labelledby="`${fieldId(field)}-label`"
            :model-value="songFontWeightChoice(previewView, field)"
            :default-weight="defaultWeight(field)"
            @update:model-value="onWeightChange(field, $event)"
          />
        </div>
      </div>

      <div class="song-font-weight-preview-block">
        <h3 class="song-font-weight-preview-heading">
          {{ t('settings.appearance.songFontWeight.preview') }}
        </h3>
        <SongFontWeightPreview :view="previewView" />
      </div>
    </details>
  </div>
</template>

<style scoped>
.song-font-weight-details {
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 80%, transparent);
  border-radius: 13px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 50%, transparent);
}

.song-font-weight-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 9px 16px;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  list-style: none;
  cursor: pointer;
  user-select: none;
}

.song-font-weight-summary::-webkit-details-marker {
  display: none;
}

.song-font-weight-summary::marker {
  content: '';
}

.song-font-weight-summary:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: -2px;
}

.song-font-weight-details[open] > .song-font-weight-summary {
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.song-font-weight-chevron {
  flex: 0 0 auto;
  color: var(--auralis-text-muted);
}

.song-font-weight-details[open] > .song-font-weight-summary .song-font-weight-chevron {
  transform: rotate(180deg);
}

.song-font-weight-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 10px 16px 2px;
}

.song-font-weight-reset {
  min-height: 30px;
  margin-left: auto;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  color: var(--auralis-text-subtle);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.song-font-weight-reset:hover {
  color: var(--auralis-text);
}

.song-font-weight-reset:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

.song-font-weight-status {
  margin: 0;
  padding: 4px 16px 0;
  color: var(--auralis-text-subtle);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
}

.song-font-weight-status.is-warning {
  color: var(--auralis-text);
}

.song-font-weight-rows {
  margin-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.song-font-weight-row {
  flex-wrap: wrap;
  row-gap: 8px;
  cursor: default;
}

.song-font-weight-preview-block {
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
  padding: 12px 16px 16px;
}

.song-font-weight-preview-heading {
  margin: 0 0 8px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}
</style>
