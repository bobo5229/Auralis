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
import { useFullscreenBackground } from '../composables/useFullscreenBackground'
import { LIQUID_METAL_RANGES, type LiquidMetalSettings } from '../runtime/liquidMetalSettings'
import SettingsSelect from '@renderer/features/settings/components/SettingsSelect.vue'
import '@renderer/features/settings/styles/settings.chrome.css'
import '@renderer/features/settings/styles/parameterSurface.css'

const { t } = useI18n()
const {
  preference: lyricsTypography,
  persistFailed: lyricsTypographyPersistFailed,
  setPreference: setLyricsTypographyPreference,
  resetPreference: resetLyricsTypographyPreference,
} = useFullscreenLyricsTypography()
const {
  backgroundMode,
  backgroundMotionPaused,
  metalSettings,
  setBackgroundMode,
  setBackgroundMotionPaused,
  setMetalSettings,
  resetMetalSettings,
} = useFullscreenBackground()
const rootRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const resetAnnounced = ref(false)
let resetStatusTimer: ReturnType<typeof setTimeout> | null = null
const controls = [
  { key: 'speed', label: 'fullscreen.background.speed' },
  { key: 'folds', label: 'fullscreen.background.folds' },
  { key: 'roughness', label: 'fullscreen.background.roughness' },
] as const
const lyricsTypographyStatus = computed(() => {
  if (lyricsTypographyPersistFailed.value) return t('fullscreen.lyrics.persistFailed')
  if (resetAnnounced.value) return t('fullscreen.lyrics.resetStatus')
  return ''
})
const lyricsFontWeightOptions = computed(() =>
  FULLSCREEN_LYRIC_FONT_WEIGHTS.map((weight) => ({
    value: String(weight),
    label: t(`fullscreen.lyrics.weights.${weight}`),
  })),
)

function clearResetStatus(): void {
  resetAnnounced.value = false
  if (resetStatusTimer !== null) {
    clearTimeout(resetStatusTimer)
    resetStatusTimer = null
  }
}

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

function updateParameter(key: keyof LiquidMetalSettings, event: Event): void {
  setMetalSettings({ [key]: Number((event.target as HTMLInputElement).value) })
}

function parameterFill(key: keyof LiquidMetalSettings): string {
  const { min, max } = LIQUID_METAL_RANGES[key]
  return `${((metalSettings.value[key] - min) / (max - min)) * 100}%`
}

function lyricsParameterFill(field: 'fontSizePercent' | 'lineGapPercent'): string {
  const { min, max } = FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES[field]
  return `${((lyricsTypography.value[field] - min) / (max - min)) * 100}%`
}

function updateLyricsPercent(field: 'fontSizePercent' | 'lineGapPercent', event: Event): void {
  clearResetStatus()
  setLyricsTypographyPreference({ [field]: Number((event.target as HTMLInputElement).value) })
}

function updateLyricsFontWeight(selected: string): void {
  clearResetStatus()
  const value = Number(selected)
  if (isFullscreenLyricFontWeight(value))
    setLyricsTypographyPreference({
      fontWeight: value,
    } satisfies Partial<FullscreenLyricsTypography>)
}

function resetLyricsTypography(): void {
  clearResetStatus()
  resetLyricsTypographyPreference()
  if (lyricsTypographyPersistFailed.value) return
  resetAnnounced.value = true
  resetStatusTimer = setTimeout(() => {
    resetAnnounced.value = false
    resetStatusTimer = null
  }, 3000)
}

onMounted(() => document.addEventListener('pointerdown', dismissOutside, true))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside, true)
  clearResetStatus()
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
            <button
              v-if="backgroundMode === 'metal'"
              type="button"
              class="settings-text-button background-controls-reset"
              @click="resetMetalSettings"
            >
              {{ t('fullscreen.background.reset') }}
            </button>
          </div>
          <div class="settings-group-card">
            <div class="settings-row">
              <div>
                <strong>{{ t('fullscreen.background.mode') }}</strong>
              </div>
              <div
                class="settings-segmented-control"
                role="group"
                :aria-label="t('fullscreen.background.mode')"
              >
                <button
                  type="button"
                  class="settings-segmented-option"
                  :class="{ 'is-selected': backgroundMode === 'metal' }"
                  data-background-mode="metal"
                  :aria-pressed="backgroundMode === 'metal'"
                  @click="setBackgroundMode('metal')"
                >
                  {{ t('fullscreen.background.metal') }}
                </button>
                <button
                  type="button"
                  class="settings-segmented-option"
                  :class="{ 'is-selected': backgroundMode === 'fluid' }"
                  data-background-mode="fluid"
                  :aria-pressed="backgroundMode === 'fluid'"
                  @click="setBackgroundMode('fluid')"
                >
                  {{ t('fullscreen.background.fluid') }}
                </button>
              </div>
            </div>
            <template v-if="backgroundMode === 'metal'">
              <div v-for="control in controls" :key="control.key" class="settings-row">
                <div>
                  <strong :id="`background-${control.key}-label`">{{ t(control.label) }}</strong>
                </div>
                <div class="settings-range-control">
                  <input
                    :id="`background-${control.key}-input`"
                    type="range"
                    :data-metal-parameter="control.key"
                    :aria-labelledby="`background-${control.key}-label`"
                    :min="LIQUID_METAL_RANGES[control.key].min"
                    :max="LIQUID_METAL_RANGES[control.key].max"
                    :step="LIQUID_METAL_RANGES[control.key].step"
                    :value="metalSettings[control.key]"
                    :style="{ '--settings-range-progress': parameterFill(control.key) }"
                    @input="updateParameter(control.key, $event)"
                  />
                  <output :for="`background-${control.key}-input`">{{
                    metalSettings[control.key].toFixed(2)
                  }}</output>
                </div>
              </div>
            </template>
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
.background-controls-panel .fullscreen-lyrics-typography-group {
  margin-top: 24px;
}
.background-controls-panel .fullscreen-lyrics-typography-row > div:first-child {
  flex: 1 1 100px;
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
.background-controls-panel .fullscreen-lyrics-typography-status {
  padding: 0 16px 14px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.background-controls-panel .fullscreen-lyrics-typography-status.is-warning {
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
