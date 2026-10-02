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

const { t } = useI18n()
const { persistFailed, songFontWeightChoice, setSongFontWeight, resetSongFontWeightView } =
  useSongFontWeights()
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
  if (persistFailed.value) return t('settings.appearance.songFontWeight.persistFailed')
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

function onReset(): void {
  resetSongFontWeightView(previewView.value)
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
          <span class="song-font-weight-expand-label">展开</span>
          <span class="song-font-weight-collapse-label">收起</span>
          <span class="song-font-weight-chevron i-lucide-chevron-down h-4 w-4"></span>
        </span>
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
        <div class="song-font-weight-reset-group">
          <Transition name="song-font-weight-reset-notice">
            <span
              v-if="resetAnnounced && !persistFailed"
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
        :class="{ 'is-warning': persistFailed }"
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
              <div class="song-cover-radius-control">
                <input
                  id="song-cover-radius-input"
                  type="range"
                  min="4"
                  max="24"
                  step="2"
                  :value="coverArtworkRadius"
                  :style="{ '--song-cover-radius-progress': `${radiusFillPercent}%` }"
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
        {{ t('settings.appearance.songFontWeight.weightSection') }}
      </h3>
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
  interpolate-size: allow-keywords;
}

.song-font-weight-details::details-content {
  block-size: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    block-size 280ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease,
    content-visibility 280ms;
  transition-behavior: allow-discrete;
}

.song-font-weight-details[open]::details-content {
  block-size: auto;
  opacity: 1;
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
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.song-font-weight-summary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  line-height: 1;
}

.song-font-weight-collapse-label,
.song-font-weight-details[open] > .song-font-weight-summary .song-font-weight-expand-label {
  display: none;
}

.song-font-weight-details[open] > .song-font-weight-summary .song-font-weight-collapse-label {
  display: inline;
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
  padding: 0 0 0 10px;
  border: 0;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.song-font-weight-reset-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
  margin-left: auto;
}

.song-font-weight-reset-notice {
  color: var(--auralis-danger);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  text-align: right;
}

.song-font-weight-reset-notice-enter-active {
  transition:
    opacity 220ms ease-out,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.song-font-weight-reset-notice-leave-active {
  transition: opacity 140ms ease-in;
}

.song-font-weight-reset-notice-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.song-font-weight-reset-notice-leave-to {
  opacity: 0;
}

:where([data-reduced-motion='true']) .song-font-weight-details::details-content {
  transition:
    opacity 120ms ease,
    content-visibility 120ms;
}

:where([data-reduced-motion='true']) .song-font-weight-chevron {
  transition: none;
}

:where([data-reduced-motion='true']) .song-font-weight-reset-notice-enter-active,
:where([data-reduced-motion='true']) .song-font-weight-reset-notice-leave-active {
  transition: opacity 120ms ease;
}

:where([data-reduced-motion='true']) .song-font-weight-reset-notice-enter-from {
  transform: none;
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

.song-parameters-heading {
  margin: 8px 0 0;
  padding: 12px 16px 4px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}

.song-cover-options + .song-parameters-heading {
  margin-top: 0;
}

.song-cover-radius-reveal {
  overflow: hidden;
  max-height: 80px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.song-cover-radius-reveal-enter-active,
.song-cover-radius-reveal-leave-active {
  transition:
    max-height 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease;
}

.song-cover-radius-reveal-enter-from,
.song-cover-radius-reveal-leave-to {
  max-height: 0;
  opacity: 0;
}

.song-cover-radius-reveal .settings-row > .song-cover-radius-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.song-cover-radius-control {
  --song-cover-radius-fill: var(--auralis-text-muted);
}

:global([data-theme='dark'] .song-cover-radius-control) {
  --song-cover-radius-fill: var(--auralis-theme-accent);
}

.song-cover-radius-control input {
  width: 120px;
  height: 18px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.song-cover-radius-control input::-webkit-slider-runnable-track {
  appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--song-cover-radius-fill) var(--song-cover-radius-progress),
    color-mix(in srgb, var(--auralis-text) 12%, transparent) var(--song-cover-radius-progress)
  );
}

.song-cover-radius-control input::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  margin-top: -3px;
  appearance: none;
  border-radius: 50%;
  background: var(--song-cover-radius-fill);
}

.song-cover-radius-control input::-moz-range-track {
  appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--song-cover-radius-fill) var(--song-cover-radius-progress),
    color-mix(in srgb, var(--auralis-text) 12%, transparent) var(--song-cover-radius-progress)
  );
}

.song-cover-radius-control input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--song-cover-radius-fill);
}

.song-cover-radius-control input:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 4px;
}

.song-cover-radius-control output {
  min-width: 32px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

:where([data-reduced-motion='true']) .song-cover-radius-reveal-enter-active,
:where([data-reduced-motion='true']) .song-cover-radius-reveal-leave-active {
  transition: opacity 120ms ease;
}

.song-font-weight-rows {
  margin-top: 0;
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
