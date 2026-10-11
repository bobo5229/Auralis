<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AlbumCard from '@renderer/features/albums/components/AlbumCard.vue'
import type { AlbumSummary } from '@renderer/features/albums/types'
import previewArtwork from '@renderer/assets/album-parameter-preview.svg'
import { useAlbumListParameters } from '@renderer/features/appearance/composables/useAlbumListParameters'
import {
  ALBUM_LIST_FONT_FIELDS,
  ALBUM_LIST_SIZE_RANGES,
} from '@renderer/features/appearance/constants/albumListParameters'
import SongFontSizeInput from './SongFontSizeInput.vue'
import SongFontWeightSelect from './SongFontWeightSelect.vue'

const { t } = useI18n()
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
const previewAlbum = computed<AlbumSummary>(() => ({
  key: 'album-parameter-preview',
  title: t('settings.appearance.albumParameters.sampleTitle'),
  albumArtist: t('settings.appearance.albumParameters.sampleArtist'),
  releaseDate: '2026',
  artworkCacheKey: null,
  tracks: [],
}))
const radiusProgress = computed(() => `${((preference.value.radius - 4) / 20) * 100}%`)
</script>

<template>
  <div class="settings-group" data-album-parameters>
    <details class="song-font-weight-details">
      <summary class="song-font-weight-summary">
        <span>{{ t('settings.appearance.albumParameters.title') }}</span>
        <span class="song-font-weight-summary-action" aria-hidden="true">
          <span class="song-font-weight-expand-label">{{
            t('settings.appearance.songFontWeight.expand')
          }}</span>
          <span class="song-font-weight-collapse-label">{{
            t('settings.appearance.songFontWeight.collapse')
          }}</span>
          <span class="song-font-weight-chevron i-lucide-chevron-down h-4 w-4" />
        </span>
      </summary>
      <div class="song-font-weight-content" @input="clearNotice" @change="clearNotice">
        <div class="song-font-weight-preview-block">
          <h3 class="song-font-weight-preview-heading">
            {{ t('settings.appearance.songFontWeight.preview') }}
          </h3>
          <div class="album-parameter-preview" inert>
            <AlbumCard :album="previewAlbum" :artwork-url="previewArtwork" />
          </div>
        </div>
        <div class="song-font-weight-toolbar">
          <div class="song-font-weight-reset-group">
            <Transition name="song-font-weight-reset-notice">
              <span
                v-if="resetAnnounced && !persistFailed"
                class="song-font-weight-reset-notice"
                role="status"
              >
                {{ t('settings.appearance.albumParameters.resetStatus') }}
              </span>
            </Transition>
            <button type="button" class="song-font-weight-reset" @click="onReset">
              {{ t('settings.appearance.albumParameters.reset') }}
            </button>
          </div>
        </div>
        <p v-if="persistFailed" class="song-font-weight-status is-warning" role="status">
          {{ t('settings.appearance.albumParameters.persistFailed') }}
        </p>
        <div class="song-cover-options">
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
        <h3 class="song-parameters-heading">
          {{ t('settings.appearance.songFontWeight.typographySection') }}
        </h3>
        <div class="song-font-column-labels" aria-hidden="true">
          <span>{{ t('settings.appearance.songFontWeight.sizeLabel') }}</span>
          <span>{{ t('settings.appearance.songFontWeight.weightSection') }}</span>
        </div>
        <div class="song-font-weight-rows">
          <div
            v-for="field in ALBUM_LIST_FONT_FIELDS"
            :key="field"
            class="settings-row song-font-weight-row"
          >
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
              <SongFontWeightSelect
                :id="`album-font-${field}-weight`"
                :labelledby="`album-font-${field}-label`"
                :model-value="preference.weights[field] ?? 'default'"
                :default-weight="defaultWeights[field]"
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
    </details>
  </div>
</template>

<style scoped src="../styles/parameterPanel.css"></style>
<style scoped>
.album-parameter-preview {
  width: 170px;
  margin-inline: auto;
  pointer-events: none;
}
</style>
