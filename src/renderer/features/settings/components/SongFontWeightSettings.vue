<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SONG_COVER_FONT_FIELDS,
  SONG_LIST_FONT_FIELDS,
  defaultSongFontWeight,
  type SongFontWeightChoice,
  type SongFontWeightView,
} from '@renderer/features/appearance/constants/songFontWeights'
import { useSongFontWeights } from '@renderer/features/appearance/composables/useSongFontWeights'
import {
  DEFAULT_COVER_ARTWORK_RADIUS,
  useCoverArtworkCorners,
} from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import SongFontWeightPreview from './SongFontWeightPreview.vue'
import SongFontWeightSelect from './SongFontWeightSelect.vue'
import SongFontSizeInput from './SongFontSizeInput.vue'
import { useSongFontSizes } from '@renderer/features/appearance/composables/useSongFontSizes'
import { songFontSizeRange } from '@renderer/features/appearance/constants/songFontSizes'

const { t } = useI18n()
const { persistFailed, songFontWeightChoice, setSongFontWeight, resetSongFontWeightView } =
  useSongFontWeights()
const {
  persistFailed: sizePersistFailed,
  songFontSize,
  setSongFontSize,
  resetSongFontSizeView,
} = useSongFontSizes()
const { coverArtworkRounded, setCoverArtworkRounded, coverArtworkRadius, setCoverArtworkRadius } =
  useCoverArtworkCorners()

const previewView = ref<SongFontWeightView>('list')
const resetAnnounced = ref(false)
let resetStatusTimer: ReturnType<typeof setTimeout> | undefined

function clearResetStatus(): void {
  if (resetStatusTimer !== undefined) clearTimeout(resetStatusTimer)
  resetStatusTimer = undefined
  resetAnnounced.value = false
}

const activeFields = computed(() =>
  previewView.value === 'list' ? SONG_LIST_FONT_FIELDS : SONG_COVER_FONT_FIELDS,
)
const radiusFillPercent = computed(() => ((coverArtworkRadius.value - 4) / 20) * 100)

const statusText = computed(() => {
  if (persistFailed.value || sizePersistFailed.value)
    return t('settings.appearance.songFontWeight.persistFailed')
  return ''
})

watch(previewView, clearResetStatus)
onUnmounted(clearResetStatus)

function fieldId(field: string): string {
  return `song-font-weight-${previewView.value}-${field}`
}

function defaultWeight(field: string): number {
  return defaultSongFontWeight(previewView.value, field) ?? 400
}

function onWeightChange(field: string, choice: SongFontWeightChoice): void {
  clearResetStatus()
  setSongFontWeight(previewView.value, field, choice)
}

function onSizeChange(field: string, size: number): void {
  clearResetStatus()
  setSongFontSize(previewView.value, field, size)
}

function onReset(): void {
  resetSongFontWeightView(previewView.value)
  resetSongFontSizeView(previewView.value)
  if (previewView.value === 'cover') {
    setCoverArtworkRounded(true)
    setCoverArtworkRadius(DEFAULT_COVER_ARTWORK_RADIUS)
  }
  clearResetStatus()
  resetAnnounced.value = true
  resetStatusTimer = setTimeout(() => {
    resetAnnounced.value = false
    resetStatusTimer = undefined
  }, 3000)
}

function onRadiusInput(event: Event): void {
  setCoverArtworkRadius(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="settings-group">
    <details class="song-font-weight-details">
      <summary class="song-font-weight-summary">
        <span>{{ t('settings.appearance.songFontWeight.title') }}</span>
        <span class="song-font-weight-summary-action" aria-hidden="true">
          <span class="song-font-weight-expand-label">{{
            t('settings.appearance.songFontWeight.expand')
          }}</span>
          <span class="song-font-weight-collapse-label">{{
            t('settings.appearance.songFontWeight.collapse')
          }}</span>
          <span class="song-font-weight-chevron i-lucide-chevron-down h-4 w-4"></span>
        </span>
      </summary>

      <div class="song-font-weight-content">
        <div class="song-font-weight-preview-block">
          <h3 class="song-font-weight-preview-heading">
            {{ t('settings.appearance.songFontWeight.preview') }}
          </h3>
          <SongFontWeightPreview :view="previewView" />
        </div>

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
          <div class="song-font-weight-reset-group">
            <Transition name="song-font-weight-reset-notice">
              <span
                v-if="resetAnnounced && !persistFailed && !sizePersistFailed"
                class="song-font-weight-reset-notice"
                role="status"
              >
                {{ t('settings.appearance.songFontWeight.resetStatus') }}
              </span>
            </Transition>
            <button type="button" class="song-font-weight-reset" @click="onReset">
              {{ t('settings.appearance.songFontWeight.resetView') }}
            </button>
          </div>
        </div>

        <p
          v-if="statusText"
          class="song-font-weight-status"
          :class="{ 'is-warning': persistFailed || sizePersistFailed }"
          role="status"
        >
          {{ statusText }}
        </p>

        <div v-if="previewView === 'cover'" class="song-cover-options">
          <h3 class="song-parameters-heading">
            {{ t('settings.appearance.songFontWeight.coverSection') }}
          </h3>
          <div class="settings-row song-font-weight-row">
            <div>
              <strong>{{ t('settings.appearance.coverArtworkRounded') }}</strong>
            </div>
            <button
              type="button"
              class="settings-switch"
              role="switch"
              :aria-checked="coverArtworkRounded"
              :aria-label="t('settings.appearance.coverArtworkRounded')"
              :class="{ 'is-enabled': coverArtworkRounded }"
              @click="setCoverArtworkRounded(!coverArtworkRounded)"
            >
              <span class="settings-switch-thumb" aria-hidden="true"></span>
            </button>
          </div>
          <Transition name="song-cover-radius-reveal">
            <div v-if="coverArtworkRounded" class="song-cover-radius-reveal">
              <div class="settings-row song-font-weight-row">
                <div>
                  <strong id="song-cover-radius-label">{{
                    t('settings.appearance.songFontWeight.coverRadius')
                  }}</strong>
                </div>
                <div class="settings-range-control">
                  <input
                    id="song-cover-radius-input"
                    type="range"
                    min="4"
                    max="24"
                    step="2"
                    :value="coverArtworkRadius"
                    :style="{ '--settings-range-progress': `${radiusFillPercent}%` }"
                    aria-labelledby="song-cover-radius-label"
                    @input="onRadiusInput"
                  />
                  <output for="song-cover-radius-input">{{ coverArtworkRadius }} px</output>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <h3 class="song-parameters-heading">
          {{ t('settings.appearance.songFontWeight.typographySection') }}
        </h3>
        <div class="song-font-column-labels" aria-hidden="true">
          <span>{{ t('settings.appearance.songFontWeight.sizeLabel') }}</span>
          <span>{{ t('settings.appearance.songFontWeight.weightSection') }}</span>
        </div>
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
            <div class="song-font-controls">
              <SongFontSizeInput
                :id="`${fieldId(field)}-size`"
                :label="t(`settings.appearance.songFontWeight.fields.${field}`)"
                :model-value="songFontSize(previewView, field)"
                :min="songFontSizeRange(previewView, field).min"
                :max="songFontSizeRange(previewView, field).max"
                @update:model-value="onSizeChange(field, $event)"
              />
              <SongFontWeightSelect
                :id="fieldId(field)"
                :labelledby="`${fieldId(field)}-label`"
                :model-value="songFontWeightChoice(previewView, field)"
                :default-weight="defaultWeight(field)"
                @update:model-value="onWeightChange(field, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped src="../styles/parameterPanel.css"></style>
