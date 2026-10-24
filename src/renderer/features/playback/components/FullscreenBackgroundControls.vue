<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FULLSCREEN_LYRIC_FONT_WEIGHTS,
  FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES,
  isFullscreenLyricFontWeight,
  type FullscreenLyricsTypography,
} from '@renderer/features/lyrics/constants/fullscreenLyricsTypography'
import { useFullscreenLyricsTypography } from '@renderer/features/lyrics/composables/useFullscreenLyricsTypography'
import {
  FULLSCREEN_INFO_FONT_WEIGHTS,
  FULLSCREEN_INFO_TYPOGRAPHY_RANGES,
  isFullscreenInfoFontWeight,
  type FullscreenInfoTypography,
} from '../constants/fullscreenInfoTypography'
import { useFullscreenBackground } from '../composables/useFullscreenBackground'
import { useFullscreenInfoTypography } from '../composables/useFullscreenInfoTypography'
import SettingsSelect from '@renderer/shared/components/SettingsSelect.vue'
import SongFontSizeInput from '@renderer/shared/components/SongFontSizeInput.vue'
import '@renderer/shared/styles/parameterControls.css'
import '@renderer/shared/styles/parameterSurface.css'

const { t } = useI18n()
const {
  preference: lyricsTypography,
  persistFailed: lyricsTypographyPersistFailed,
  setPreference: setLyricsTypographyPreference,
  resetPreference: resetLyricsTypographyPreference,
} = useFullscreenLyricsTypography()
const {
  preference: infoTypography,
  persistFailed: infoTypographyPersistFailed,
  setPreference: setInfoTypographyPreference,
  resetPreference: resetInfoTypographyPreference,
} = useFullscreenInfoTypography()
const { backgroundMotionPaused, setBackgroundMotionPaused } = useFullscreenBackground()
const rootRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)

function createResetAnnouncement() {
  const announced = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear(): void {
    announced.value = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function announce(): void {
    clear()
    announced.value = true
    timer = setTimeout(() => {
      announced.value = false
      timer = null
    }, 3000)
  }

  return { announced, clear, announce }
}

const lyricsResetStatus = createResetAnnouncement()
const infoResetStatus = createResetAnnouncement()
const lyricsTypographyStatus = computed(() => {
  if (lyricsTypographyPersistFailed.value) return t('fullscreen.lyrics.persistFailed')
  if (lyricsResetStatus.announced.value) return t('fullscreen.lyrics.resetStatus')
  return ''
})
const infoTypographyStatus = computed(() => {
  if (infoTypographyPersistFailed.value) return t('fullscreen.info.persistFailed')
  if (infoResetStatus.announced.value) return t('fullscreen.info.resetStatus')
  return ''
})
const lyricsFontWeightOptions = computed(() =>
  FULLSCREEN_LYRIC_FONT_WEIGHTS.map((weight) => ({
    value: String(weight),
    label: t(`fullscreen.lyrics.weights.${weight}`),
  })),
)
const infoFontWeightOptions = computed(() =>
  FULLSCREEN_INFO_FONT_WEIGHTS.map((weight) => ({
    value: String(weight),
    label: t(`fullscreen.info.weights.${weight}`),
  })),
)
const infoTitleSizeRange = FULLSCREEN_INFO_TYPOGRAPHY_RANGES.titleFontSizePx
const infoSubtitleSizeRange = FULLSCREEN_INFO_TYPOGRAPHY_RANGES.subtitleFontSizePx

function close(restoreFocus = true): boolean {
  if (!open.value) return false
  open.value = false
  if (restoreFocus) void nextTick(() => buttonRef.value?.focus({ preventScroll: true }))
  return true
}

async function toggle(): Promise<void> {
  if (close()) return
  open.value = true
  await nextTick()
  closeButtonRef.value?.focus({ preventScroll: true })
}

function dismissOutside(event: PointerEvent): void {
  if (event.target instanceof Node && !rootRef.value?.contains(event.target)) open.value = false
}

function lyricsParameterFill(field: 'fontSizePercent' | 'lineGapPercent'): string {
  const { min, max } = FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES[field]
  return `${((lyricsTypography.value[field] - min) / (max - min)) * 100}%`
}

function updateLyricsPercent(field: 'fontSizePercent' | 'lineGapPercent', event: Event): void {
  lyricsResetStatus.clear()
  setLyricsTypographyPreference({ [field]: Number((event.target as HTMLInputElement).value) })
}

function updateLyricsFontWeight(selected: string): void {
  lyricsResetStatus.clear()
  const value = Number(selected)
  if (isFullscreenLyricFontWeight(value))
    setLyricsTypographyPreference({
      fontWeight: value,
    } satisfies Partial<FullscreenLyricsTypography>)
}

function resetLyricsTypography(): void {
  lyricsResetStatus.clear()
  resetLyricsTypographyPreference()
  if (lyricsTypographyPersistFailed.value) return
  lyricsResetStatus.announce()
}

function updateInfoFontSize(field: 'titleFontSizePx' | 'subtitleFontSizePx', value: number): void {
  infoResetStatus.clear()
  setInfoTypographyPreference({ [field]: value })
}

function updateInfoFontWeight(
  field: 'titleFontWeight' | 'subtitleFontWeight',
  selected: string,
): void {
  infoResetStatus.clear()
  const value = Number(selected)
  if (isFullscreenInfoFontWeight(value))
    setInfoTypographyPreference({ [field]: value } satisfies Partial<FullscreenInfoTypography>)
}

function resetInfoTypography(): void {
  infoResetStatus.clear()
  resetInfoTypographyPreference()
  if (infoTypographyPersistFailed.value) return
  infoResetStatus.announce()
}

onMounted(() => document.addEventListener('pointerdown', dismissOutside, true))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside, true)
  lyricsResetStatus.clear()
  infoResetStatus.clear()
})
defineExpose({ close })
</script>

<template>
  <div ref="rootRef" class="fullscreen-background-controls">
    <button
      ref="buttonRef"
      v-tooltip.fast="t('fullscreen.settings')"
      class="background-controls-toggle"
      type="button"
      :aria-label="t('fullscreen.settings')"
      :aria-expanded="open"
      aria-controls="fullscreen-background-panel"
      @click="toggle"
    >
      <span class="i-lucide-sliders-horizontal h-5 w-5" aria-hidden="true" />
    </button>
    <Transition name="background-sidebar">
      <section
        v-if="open"
        id="fullscreen-background-panel"
        class="background-controls-panel parameter-panel-surface settings-controls"
        :aria-label="t('fullscreen.settings')"
        @keydown.esc.stop.prevent="close()"
      >
        <header class="background-controls-header parameter-panel-header">
          <h2>{{ t('fullscreen.settings') }}</h2>
          <button
            ref="closeButtonRef"
            class="background-controls-close parameter-panel-close"
            type="button"
            :aria-label="t('fullscreen.closeSettings')"
            :title="t('fullscreen.closeSettings')"
            @click="close()"
          >
            <span class="i-lucide-chevron-right h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div class="background-controls-content parameter-panel-content">
          <div class="settings-group-header">
            <h3 class="settings-group-title">{{ t('fullscreen.background.section') }}</h3>
          </div>
          <div class="settings-group-card">
            <div class="settings-row">
              <div>
                <strong>{{ t('fullscreen.background.pause') }}</strong>
              </div>
              <button
                type="button"
                class="settings-switch"
                :class="{ 'is-enabled': backgroundMotionPaused }"
                data-background-pause
                role="switch"
                :aria-label="t('fullscreen.background.pause')"
                :aria-checked="backgroundMotionPaused"
                @click="setBackgroundMotionPaused(!backgroundMotionPaused)"
              >
                <span class="settings-switch-thumb" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <div class="settings-group fullscreen-info-typography-group">
            <div class="settings-group-header">
              <h3 class="settings-group-title">{{ t('fullscreen.info.section') }}</h3>
              <button
                type="button"
                class="settings-text-button background-controls-reset"
                data-info-typography-reset
                @click="resetInfoTypography"
              >
                {{ t('fullscreen.info.reset') }}
              </button>
            </div>
            <div class="settings-group-card">
              <div class="settings-row fullscreen-info-typography-row">
                <div>
                  <strong>{{ t('fullscreen.info.titleFontSize') }}</strong>
                </div>
                <div class="fullscreen-info-size-control">
                  <SongFontSizeInput
                    id="fullscreen-info-title-font-size"
                    :label="t('fullscreen.info.title')"
                    :model-value="infoTypography.titleFontSizePx"
                    :min="infoTitleSizeRange.min"
                    :max="infoTitleSizeRange.max"
                    @update:model-value="updateInfoFontSize('titleFontSizePx', $event)"
                  />
                </div>
              </div>
              <div class="settings-row fullscreen-info-typography-row">
                <div>
                  <strong id="fullscreen-info-title-font-weight-label">{{
                    t('fullscreen.info.titleFontWeight')
                  }}</strong>
                </div>
                <SettingsSelect
                  id="fullscreen-info-title-font-weight"
                  labelledby="fullscreen-info-title-font-weight-label"
                  :model-value="String(infoTypography.titleFontWeight)"
                  :options="infoFontWeightOptions"
                  :teleport-to="rootRef ?? undefined"
                  @update:model-value="updateInfoFontWeight('titleFontWeight', $event)"
                />
              </div>
              <div class="settings-row fullscreen-info-typography-row">
                <div>
                  <strong>{{ t('fullscreen.info.subtitleFontSize') }}</strong>
                </div>
                <div class="fullscreen-info-size-control">
                  <SongFontSizeInput
                    id="fullscreen-info-subtitle-font-size"
                    :label="t('fullscreen.info.subtitle')"
                    :model-value="infoTypography.subtitleFontSizePx"
                    :min="infoSubtitleSizeRange.min"
                    :max="infoSubtitleSizeRange.max"
                    @update:model-value="updateInfoFontSize('subtitleFontSizePx', $event)"
                  />
                </div>
              </div>
              <div class="settings-row fullscreen-info-typography-row">
                <div>
                  <strong id="fullscreen-info-subtitle-font-weight-label">{{
                    t('fullscreen.info.subtitleFontWeight')
                  }}</strong>
                </div>
                <SettingsSelect
                  id="fullscreen-info-subtitle-font-weight"
                  labelledby="fullscreen-info-subtitle-font-weight-label"
                  :model-value="String(infoTypography.subtitleFontWeight)"
                  :options="infoFontWeightOptions"
                  :teleport-to="rootRef ?? undefined"
                  @update:model-value="updateInfoFontWeight('subtitleFontWeight', $event)"
                />
              </div>
              <div
                v-if="infoTypographyStatus"
                class="fullscreen-info-typography-status"
                :class="{ 'is-warning': infoTypographyPersistFailed }"
                role="status"
                data-info-typography-status
              >
                {{ infoTypographyStatus }}
              </div>
            </div>
          </div>
          <div class="settings-group fullscreen-lyrics-typography-group">
            <div class="settings-group-header">
              <h3 class="settings-group-title">{{ t('fullscreen.lyrics.section') }}</h3>
              <button
                type="button"
                class="settings-text-button background-controls-reset"
                data-lyrics-typography-reset
                @click="resetLyricsTypography"
              >
                {{ t('fullscreen.lyrics.reset') }}
              </button>
            </div>
            <div class="settings-group-card">
              <div class="settings-row fullscreen-lyrics-typography-row">
                <div>
                  <strong id="fullscreen-lyrics-font-size-label">{{
                    t('fullscreen.lyrics.fontSize')
                  }}</strong>
                </div>
                <div class="settings-range-control">
                  <input
                    id="fullscreen-lyrics-font-size"
                    type="range"
                    min="75"
                    max="150"
                    step="5"
                    :value="lyricsTypography.fontSizePercent"
                    :aria-labelledby="'fullscreen-lyrics-font-size-label'"
                    :aria-valuetext="`${lyricsTypography.fontSizePercent}%`"
                    :style="{
                      '--settings-range-progress': lyricsParameterFill('fontSizePercent'),
                    }"
                    data-lyrics-typography="font-size"
                    @input="updateLyricsPercent('fontSizePercent', $event)"
                  />
                  <output for="fullscreen-lyrics-font-size"
                    >{{ lyricsTypography.fontSizePercent }}%</output
                  >
                </div>
              </div>
              <div class="settings-row fullscreen-lyrics-typography-row">
                <div>
                  <strong id="fullscreen-lyrics-font-weight-label">{{
                    t('fullscreen.lyrics.fontWeight')
                  }}</strong>
                </div>
                <SettingsSelect
                  id="fullscreen-lyrics-font-weight"
                  labelledby="fullscreen-lyrics-font-weight-label"
                  :model-value="String(lyricsTypography.fontWeight)"
                  :options="lyricsFontWeightOptions"
                  :teleport-to="rootRef ?? undefined"
                  @update:model-value="updateLyricsFontWeight"
                />
              </div>
              <div class="settings-row fullscreen-lyrics-typography-row">
                <div>
                  <strong id="fullscreen-lyrics-line-gap-label">{{
                    t('fullscreen.lyrics.lineGap')
                  }}</strong>
                </div>
                <div class="settings-range-control">
                  <input
                    id="fullscreen-lyrics-line-gap"
                    type="range"
                    min="50"
                    max="150"
                    step="5"
                    :value="lyricsTypography.lineGapPercent"
                    :aria-labelledby="'fullscreen-lyrics-line-gap-label'"
                    :aria-valuetext="`${lyricsTypography.lineGapPercent}%`"
                    :style="{
                      '--settings-range-progress': lyricsParameterFill('lineGapPercent'),
                    }"
                    data-lyrics-typography="line-gap"
                    @input="updateLyricsPercent('lineGapPercent', $event)"
                  />
                  <output for="fullscreen-lyrics-line-gap"
                    >{{ lyricsTypography.lineGapPercent }}%</output
                  >
                </div>
              </div>
              <div class="settings-row fullscreen-lyrics-typography-description">
                <span>{{ t('fullscreen.lyrics.scaleDescription') }}</span>
              </div>
              <div
                v-if="lyricsTypographyStatus"
                class="fullscreen-lyrics-typography-status"
                :class="{ 'is-warning': lyricsTypographyPersistFailed }"
                role="status"
                data-lyrics-typography-status
              >
                {{ lyricsTypographyStatus }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.fullscreen-background-controls {
  position: fixed;
  top: 12px;
  right: 76px;
  z-index: 103;
  -webkit-app-region: no-drag;
}
.background-controls-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border-radius: 8px;
  color: var(--auralis-text-muted);
}
.background-controls-toggle:hover {
  color: var(--auralis-text);
}
.background-controls-panel .settings-row {
  box-sizing: border-box;
  min-height: 48px;
  padding: 8px 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.background-controls-panel .settings-range-control input {
  height: 30px;
}
.background-controls-panel .settings-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 30px;
  margin-bottom: 12px;
}
.background-controls-panel .settings-group-card {
  border-color: var(--auralis-fullscreen-controls-border);
  background: color-mix(in srgb, var(--auralis-fullscreen-controls-bg) 32%, transparent);
}
.background-controls-panel
  :is(.fullscreen-lyrics-typography-group, .fullscreen-info-typography-group) {
  margin-top: 24px;
}
.background-controls-panel
  :is(.fullscreen-lyrics-typography-row, .fullscreen-info-typography-row)
  > div:first-child {
  flex: 1 1 100px;
}
.background-controls-panel .fullscreen-info-size-control {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
}
/* The shared stepper is 148px so it lines up with the song-page weight column. */
.background-controls-panel :deep(.fullscreen-info-size-control .song-font-size-input) {
  width: max-content;
}
.background-controls-panel :deep(.fullscreen-info-size-control .song-font-size-value) {
  flex: 0 0 auto;
}
.background-controls-panel :deep(.settings-select) {
  line-height: var(--auralis-type-caption-line-height);
}
.fullscreen-background-controls :deep(.settings-select-menu) {
  color: var(--auralis-fullscreen-controls-text);
}
.background-controls-panel .fullscreen-lyrics-typography-description {
  min-height: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.background-controls-panel
  :is(.fullscreen-lyrics-typography-status, .fullscreen-info-typography-status) {
  padding: 0 16px 14px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.background-controls-panel
  :is(.fullscreen-lyrics-typography-status, .fullscreen-info-typography-status).is-warning {
  color: var(--auralis-danger);
}
.background-controls-panel :is(.settings-group-title, .settings-row > div > strong) {
  font-size: 13px;
  line-height: 1.35;
}
.background-controls-panel :is(.settings-segmented-option, .settings-text-button) {
  font-size: 11px;
  line-height: 1.35;
}
.background-controls-panel .background-controls-reset,
.background-controls-panel .background-controls-reset:hover:not(:disabled) {
  color: var(--auralis-danger);
}
.background-controls-panel .settings-range-control output {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.background-controls-panel :is(button, input, select):focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
  box-shadow: none;
}
.background-controls-panel input[type='range']:focus-visible {
  outline-offset: 4px;
}
.background-sidebar-enter-active,
.background-sidebar-leave-active {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.background-sidebar-enter-from,
.background-sidebar-leave-to {
  transform: translateX(calc(100% + var(--background-panel-gap)));
}
.background-sidebar-enter-active,
.background-sidebar-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .background-sidebar-enter-active,
  .background-sidebar-leave-active {
    transition: none;
  }
}
</style>
