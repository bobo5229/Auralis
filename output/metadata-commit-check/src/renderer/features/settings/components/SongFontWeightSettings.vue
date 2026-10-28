<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SONG_COVER_FONT_FIELDS,
  SONG_LIST_FONT_FIELDS,
  defaultSongFontWeight,
  isSongFontWeightValue,
  type SongFontWeightView,
} from '@renderer/features/appearance/constants/songFontWeights'
import { useSongFontWeights } from '@renderer/features/appearance/composables/useSongFontWeights'
import {
  DEFAULT_COVER_ARTWORK_RADIUS,
  useCoverArtworkCorners,
} from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import SongFontSizeInput from '@renderer/shared/components/SongFontSizeInput.vue'
import { useSongFontSizes } from '@renderer/features/appearance/composables/useSongFontSizes'
import { songFontSizeRange } from '@renderer/features/appearance/constants/songFontSizes'
import { useSongCoverInfoLayout } from '@renderer/features/appearance/composables/useSongCoverInfoLayout'
import {
  COVER_INFO_ALIGNMENTS,
  COVER_INFO_SPACING_RANGES,
} from '@renderer/features/appearance/constants/songCoverInfoLayout'
import SettingsSelect from '@renderer/shared/components/SettingsSelect.vue'

const { t } = useI18n()
const { persistFailed, songFontWeightChoice, setSongFontWeight, resetSongFontWeightView } =
  useSongFontWeights()
const {
  persistFailed: sizePersistFailed,
  songFontSize,
  setSongFontSize,
  resetSongFontSizeView,
} = useSongFontSizes()
const {
  coverArtworkRounded,
  setCoverArtworkRounded,
  coverArtworkRadius,
  setCoverArtworkRadius,
  roundedPersistFailed,
  radiusPersistFailed,
} = useCoverArtworkCorners()

const props = defineProps<{ view: SongFontWeightView; inactive: boolean }>()
const activeView = computed(() => props.view)
const coverInfo = useSongCoverInfoLayout()
const coverInfoPersistFailed = computed(
  () => activeView.value === 'cover' && coverInfo.persistFailed.value,
)
const saveFailed = computed(
  () =>
    persistFailed.value ||
    sizePersistFailed.value ||
    coverInfoPersistFailed.value ||
    (activeView.value === 'cover' && (roundedPersistFailed.value || radiusPersistFailed.value)),
)
const alignmentOptions = computed(() =>
  COVER_INFO_ALIGNMENTS.map((value) => ({
    value,
    label: t(`pageParameters.coverInfo.${value}`),
  })),
)
const resetAnnounced = ref(false)
let resetStatusTimer: ReturnType<typeof setTimeout> | undefined

function clearResetStatus(): void {
  if (resetStatusTimer !== undefined) clearTimeout(resetStatusTimer)
  resetStatusTimer = undefined
  resetAnnounced.value = false
}

const activeFields = computed(() =>
  activeView.value === 'list' ? SONG_LIST_FONT_FIELDS : SONG_COVER_FONT_FIELDS,
)
const fontColumns = computed(() => {
  const midpoint = Math.ceil(activeFields.value.length / 2)
  return [activeFields.value.slice(0, midpoint), activeFields.value.slice(midpoint)]
})
const radiusFillPercent = computed(() => ((coverArtworkRadius.value - 4) / 20) * 100)

const statusText = computed(() => {
  if (saveFailed.value) return t('settings.appearance.songFontWeight.persistFailed')
  return ''
})

watch(activeView, clearResetStatus)
onUnmounted(clearResetStatus)

function fieldId(field: string): string {
  return `song-font-weight-${activeView.value}-${field}`
}

function defaultWeight(field: string): number {
  return defaultSongFontWeight(activeView.value, field) ?? 400
}

function onWeightChange(field: string, value: number): void {
  if (!isSongFontWeightValue(value)) return
  clearResetStatus()
  setSongFontWeight(activeView.value, field, value === defaultWeight(field) ? 'default' : value)
}

function onSizeChange(field: string, size: number): void {
  clearResetStatus()
  setSongFontSize(activeView.value, field, size)
}

function onReset(): void {
  resetSongFontWeightView(activeView.value)
  resetSongFontSizeView(activeView.value)
  if (activeView.value === 'cover') {
    setCoverArtworkRounded(true)
    setCoverArtworkRadius(DEFAULT_COVER_ARTWORK_RADIUS)
    coverInfo.reset()
  }
  clearResetStatus()
  resetAnnounced.value = true
  resetStatusTimer = setTimeout(() => {
    resetAnnounced.value = false
    resetStatusTimer = undefined
  }, 3000)
}

function onRadiusInput(event: Event): void {
  clearResetStatus()
  setCoverArtworkRadius(Number((event.target as HTMLInputElement).value))
}
defineExpose({ reset: onReset })
</script>

<template>
  <div class="settings-group">
    <div class="song-font-weight-content">
      <Transition name="song-font-weight-reset-notice">
        <p
          v-if="resetAnnounced && !saveFailed"
          class="song-font-weight-status song-font-weight-reset-notice"
          role="status"
        >
          {{ t('settings.appearance.songFontWeight.resetStatus') }}
        </p>
      </Transition>

      <p
        v-if="statusText"
        class="song-font-weight-status"
        :class="{ 'is-warning': saveFailed }"
        role="status"
      >
        {{ statusText }}
      </p>

      <div
        class="page-parameter-sections"
        :class="{ 'page-parameter-sections--typography-only': activeView === 'list' }"
      >
        <div v-if="activeView === 'cover'" class="page-parameter-sidebar">
          <div class="page-parameter-module song-cover-options">
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
                @click="
                  () => {
                    clearResetStatus()
                    setCoverArtworkRounded(!coverArtworkRounded)
                  }
                "
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

          <div
            class="page-parameter-module song-cover-info-options"
            @input="clearResetStatus"
            @change="clearResetStatus"
          >
            <h3 class="song-parameters-heading">{{ t('pageParameters.coverInfo.title') }}</h3>
            <div
              v-for="(range, field) in COVER_INFO_SPACING_RANGES"
              :key="field"
              class="settings-row song-font-weight-row"
            >
              <div>
                <strong :id="`song-cover-info-${field}-label`">{{
                  t(`pageParameters.coverInfo.${field}`)
                }}</strong>
              </div>
              <div class="song-cover-info-spacing">
                <SongFontSizeInput
                  :id="`song-cover-info-${field}`"
                  :label="t(`pageParameters.coverInfo.${field}`)"
                  :model-value="coverInfo.preference.value[field]"
                  :min="range.min"
                  :max="range.max"
                  kind="spacing"
                  :disabled="inactive"
                  @update:model-value="
                    (value) => {
                      clearResetStatus()
                      coverInfo.setSpacing(field, value)
                    }
                  "
                />
              </div>
            </div>
            <div class="settings-row song-font-weight-row">
              <div>
                <strong id="song-cover-info-alignment-label">{{
                  t('pageParameters.coverInfo.alignment')
                }}</strong>
              </div>
              <div class="song-cover-info-alignment">
                <SettingsSelect
                  id="song-cover-info-alignment"
                  labelledby="song-cover-info-alignment-label"
                  :model-value="coverInfo.preference.value.alignment"
                  :options="alignmentOptions"
                  :disabled="inactive"
                  :show-value-title="false"
                  @update:model-value="
                    (value) => {
                      clearResetStatus()
                      coverInfo.setAlignment(value)
                    }
                  "
                />
              </div>
            </div>
          </div>
        </div>
        <section class="page-parameter-module song-font-options">
          <h3 class="song-parameters-heading">
            {{ t('settings.appearance.songFontWeight.typographySection') }}
          </h3>
          <div class="song-font-columns">
            <div
              v-for="(fields, columnIndex) in fontColumns"
              :key="columnIndex"
              class="song-font-column"
            >
              <div class="song-font-column-labels" aria-hidden="true">
                <span>{{ t('settings.appearance.songFontWeight.sizeLabel') }}</span>
                <span>{{ t('settings.appearance.songFontWeight.weightSection') }}</span>
              </div>
              <div class="song-font-weight-rows">
                <div
                  v-for="field in fields"
                  :key="`${activeView}-${field}`"
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
                      :model-value="songFontSize(activeView, field)"
                      :min="songFontSizeRange(activeView, field).min"
                      :max="songFontSizeRange(activeView, field).max"
                      @update:model-value="onSizeChange(field, $event)"
                    />
                    <SongFontSizeInput
                      :id="fieldId(field)"
                      :label="t(`settings.appearance.songFontWeight.fields.${field}`)"
                      :model-value="
                        songFontWeightChoice(activeView, field) === 'default'
                          ? defaultWeight(field)
                          : Number(songFontWeightChoice(activeView, field))
                      "
                      :min="400"
                      :max="900"
                      :step="100"
                      kind="weight"
                      :disabled="inactive"
                      @update:model-value="onWeightChange(field, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/parameterPanel.css"></style>
