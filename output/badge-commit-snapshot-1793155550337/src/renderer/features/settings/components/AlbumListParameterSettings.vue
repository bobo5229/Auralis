<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAlbumListParameters } from '@renderer/features/appearance/composables/useAlbumListParameters'
import {
  ALBUM_LIST_FONT_FIELDS,
  ALBUM_LIST_SIZE_RANGES,
} from '@renderer/features/appearance/constants/albumListParameters'
import SongFontSizeInput from '@renderer/shared/components/SongFontSizeInput.vue'

const { t } = useI18n()
defineProps<{ inactive: boolean }>()
const {
  preference,
  sizes,
  defaultWeights,
  persistFailed,
  setSize,
  setWeight,
  setRadius,
  setRounded,
  reset,
} = useAlbumListParameters()
const resetAnnounced = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function clearNotice() {
  clearTimeout(timer)
  resetAnnounced.value = false
}
onUnmounted(clearNotice)
function onReset() {
  clearNotice()
  reset()
  resetAnnounced.value = true
  timer = setTimeout(() => {
    resetAnnounced.value = false
  }, 3000)
}
const fontColumns = computed(() => {
  const midpoint = Math.ceil(ALBUM_LIST_FONT_FIELDS.length / 2)
  return [ALBUM_LIST_FONT_FIELDS.slice(0, midpoint), ALBUM_LIST_FONT_FIELDS.slice(midpoint)]
})
const radiusProgress = computed(() => `${((preference.value.radius - 4) / 20) * 100}%`)
defineExpose({ reset: onReset })
</script>

<template>
  <div class="settings-group" data-album-parameters>
    <div class="song-font-weight-content" @input="clearNotice" @change="clearNotice">
      <Transition name="song-font-weight-reset-notice">
        <p
          v-if="resetAnnounced && !persistFailed"
          class="song-font-weight-status song-font-weight-reset-notice"
          role="status"
        >
          {{ t('settings.appearance.albumParameters.resetStatus') }}
        </p>
      </Transition>
      <p v-if="persistFailed" class="song-font-weight-status is-warning" role="status">
        {{ t('settings.appearance.albumParameters.persistFailed') }}
      </p>
      <div class="page-parameter-sections">
        <div class="page-parameter-sidebar">
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
                :aria-checked="preference.rounded"
                :aria-label="t('settings.appearance.coverArtworkRounded')"
                :class="{ 'is-enabled': preference.rounded }"
                @click="
                  () => {
                    clearNotice()
                    setRounded(!preference.rounded)
                  }
                "
              >
                <span class="settings-switch-thumb" aria-hidden="true" />
              </button>
            </div>
            <Transition name="song-cover-radius-reveal">
              <div v-if="preference.rounded" class="song-cover-radius-reveal">
                <div class="settings-row song-font-weight-row">
                  <div>
                    <strong id="album-cover-radius-label">{{
                      t('settings.appearance.songFontWeight.coverRadius')
                    }}</strong>
                  </div>
                  <div class="settings-range-control">
                    <input
                      id="album-cover-radius"
                      type="range"
                      min="4"
                      max="24"
                      step="2"
                      :value="preference.radius"
                      :style="{ '--settings-range-progress': radiusProgress }"
                      aria-labelledby="album-cover-radius-label"
                      @input="setRadius(Number(($event.target as HTMLInputElement).value))"
                    />
                    <output for="album-cover-radius">{{ preference.radius }} px</output>
                  </div>
                </div>
              </div>
            </Transition>
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
                <div v-for="field in fields" :key="field" class="settings-row song-font-weight-row">
                  <div>
                    <strong :id="`album-font-${field}-label`">{{
                      t(`settings.appearance.albumParameters.fields.${field}`)
                    }}</strong>
                  </div>
                  <div class="song-font-controls">
                    <SongFontSizeInput
                      :id="`album-font-${field}-size`"
                      :label="t(`settings.appearance.albumParameters.fields.${field}`)"
                      :model-value="sizes[field]"
                      :min="ALBUM_LIST_SIZE_RANGES[field].min"
                      :max="ALBUM_LIST_SIZE_RANGES[field].max"
                      @update:model-value="
                        (value) => {
                          clearNotice()
                          setSize(field, value)
                        }
                      "
                    />
                    <SongFontSizeInput
                      :id="`album-font-${field}-weight`"
                      :label="t(`settings.appearance.albumParameters.fields.${field}`)"
                      :model-value="preference.weights[field] ?? defaultWeights[field]"
                      :min="400"
                      :max="900"
                      :step="100"
                      kind="weight"
                      :disabled="inactive"
                      @update:model-value="
                        (value) => {
                          clearNotice()
                          setWeight(field, value)
                        }
                      "
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
