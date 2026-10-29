<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { useStartupAlbumPreference } from '@renderer/features/startupAlbum/startupAlbumPreference'
import { startupAlbumActionsKey } from '@renderer/features/startupAlbum/startupAlbumActions'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/features/appearance/composables/useTheme'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useMotionPreference } from '@renderer/features/appearance/composables/useMotionPreference'
import type { MotionPreference } from '@renderer/shared/animation/motionPreference'
import {
  LYRICS_SCROLL_PRESETS,
  useLyricsScrollPreset,
  type LyricsScrollPreset,
} from '@renderer/features/lyrics/lyricsScrollPreset'
import {
  PLAYING_ICON_PRESETS,
  usePlayingIconPreference,
  type PlayingIconPreset,
} from '@renderer/features/appearance/composables/usePlayingIconPreference'
import {
  PLAYBAR_STYLES,
  usePlaybarStyle,
  type PlaybarStyle,
} from '@renderer/features/appearance/composables/usePlaybarStyle'
import {
  CONTROL_STYLES,
  useControlStyle,
  type ControlStyle,
} from '@renderer/features/appearance/composables/useControlStyle'
import {
  useEnglishFont,
  type EnglishFontChoice,
} from '@renderer/features/appearance/composables/useEnglishFont'
import {
  useChineseFont,
  type ChineseFontChoice,
} from '@renderer/features/appearance/composables/useChineseFont'
import {
  PLAYBAR_LAYOUTS,
  usePlaybarLayout,
  type PlaybarLayout,
} from '@renderer/features/appearance/composables/usePlaybarLayout'
import {
  LIQUID_GLASS_PARAMETER_FIELDS,
  LIQUID_GLASS_PARAMETER_LIMITS,
  useLiquidGlassParameters,
  type LiquidGlassParameterField,
} from '@renderer/features/appearance/composables/useLiquidGlassParameters'
import SettingsSelect from '@renderer/shared/components/SettingsSelect.vue'
import SettingsSegmentedControl from './SettingsSegmentedControl.vue'
import LyricsPanelLayoutSettings from './LyricsPanelLayoutSettings.vue'
import ThemeAccentSettings from './ThemeAccentSettings.vue'
import ChineseTextSettings from './ChineseTextSettings.vue'
import LyricsEffectsSettings from './LyricsEffectsSettings.vue'
import LyricsCountdownSettings from './LyricsCountdownSettings.vue'
import WindowBehaviorSettings from './WindowBehaviorSettings.vue'
import { useUiLocale } from '@renderer/i18n'
import type { UiLocale } from '@shared/uiLocale'
import { useSettingsDialog } from '../composables/useSettingsDialog'

const {
  enabled: startupAlbumEnabled,
  persistFailed: startupAlbumPersistFailed,
  setEnabled: setStartupAlbumEnabled,
} = useStartupAlbumPreference()
const startupAlbumActions = inject(startupAlbumActionsKey, null)
const { closeSettings } = useSettingsDialog()
const startupAlbumDrawing = computed(() => startupAlbumActions?.busy.value ?? false)
const startupAlbumDrawError = ref<'drawEmpty' | 'drawFailed' | null>(null)
const startupAlbumDrawButton = ref<HTMLButtonElement | null>(null)
let startupAlbumDrawRequest: AbortController | undefined

async function drawStartupAlbum(): Promise<void> {
  if (!startupAlbumActions || startupAlbumDrawing.value) return
  const request = new AbortController()
  startupAlbumDrawRequest = request
  startupAlbumDrawError.value = null
  try {
    const result = await startupAlbumActions.draw(
      request.signal,
      startupAlbumDrawButton.value ?? undefined,
    )
    if (request.signal.aborted) return
    if (result === 'shown') closeSettings()
    else if (result === 'empty') startupAlbumDrawError.value = 'drawEmpty'
    else if (result === 'failed') startupAlbumDrawError.value = 'drawFailed'
  } finally {
    if (startupAlbumDrawRequest === request) startupAlbumDrawRequest = undefined
  }
}

onBeforeUnmount(() => startupAlbumDrawRequest?.abort())
const { t } = useI18n()
const { locale, persistFailed: localePersistFailed, nativeSyncFailed, setUiLocale } = useUiLocale()
const localeOptions = [
  { value: 'zh-Hans', label: '简体中文', lang: 'zh-Hans' },
  { value: 'en', label: 'English', lang: 'en' },
] as const
function selectLocale(value: UiLocale): void {
  setUiLocale(value)
}
const { theme, setTheme } = useTheme()
const { sidebarFullHeight, setSidebarFullHeight } = useSidebarLayout()
const {
  motionPreference,
  persistFailed: motionPersistFailed,
  setMotionPreference,
} = useMotionPreference()
const {
  preset: lyricsScrollPreset,
  persistFailed: lyricsScrollPersistFailed,
  setPreset: setLyricsScrollPreset,
} = useLyricsScrollPreset()
const lyricsScrollOptions = computed(() =>
  LYRICS_SCROLL_PRESETS.map((value) => ({
    value,
    label: t(`settings.appearance.lyricsScroll.${value}`),
  })),
)
const {
  layout: playbarLayout,
  persistFailed: playbarLayoutPersistFailed,
  setLayout: setPlaybarLayout,
} = usePlaybarLayout()

const playbarLayoutOptions = computed(() =>
  PLAYBAR_LAYOUTS.map((value) => ({
    value,
    label: t(`settings.appearance.playbarLayout.${value}`),
  })),
)
const {
  style: playbarStyle,
  persistFailed: playbarStylePersistFailed,
  setStyle: setPlaybarStyle,
} = usePlaybarStyle()

const playbarStyleOptions = computed(() =>
  PLAYBAR_STYLES.map((value) => ({
    value,
    label: t(`settings.appearance.playbarStyle.${value}`),
  })),
)
const {
  parameters: liquidGlassParameters,
  persistFailed: liquidGlassPersistFailed,
  atDefaults: liquidGlassAtDefaults,
  setParameter: setLiquidGlassParameter,
  resetParameters: resetLiquidGlassParameters,
} = useLiquidGlassParameters()

function liquidGlassProgress(field: LiquidGlassParameterField): string {
  const limit = LIQUID_GLASS_PARAMETER_LIMITS[field]
  const value = liquidGlassParameters.value[field]
  return `${((value - limit.min) / (limit.max - limit.min)) * 100}%`
}

function formatLiquidGlassValue(field: LiquidGlassParameterField): string {
  const value = liquidGlassParameters.value[field]
  return field === 'saturate' ? value.toFixed(1) : String(value)
}

function selectLiquidGlassParameter(field: LiquidGlassParameterField, event: Event): void {
  setLiquidGlassParameter(field, Number((event.target as HTMLInputElement).value))
}
const {
  style: controlStyle,
  persistFailed: controlStylePersistFailed,
  setStyle: setControlStyle,
} = useControlStyle()
const controlStyleOptions = computed(() =>
  CONTROL_STYLES.map((value) => ({
    value,
    label: t(`settings.appearance.controlStyle.${value}`),
  })),
)
const { playingIcon, setPlayingIcon } = usePlayingIconPreference()
const playingIconOptions = computed(() =>
  PLAYING_ICON_PRESETS.map((value) => ({
    value,
    label: t(`settings.appearance.playingIcon.${value}`),
  })),
)
const {
  font: englishFont,
  persistFailed: englishFontPersistFailed,
  setEnglishFont,
} = useEnglishFont()
const englishFontOptions = [
  { value: 'plusJakartaSans', label: 'Plus Jakarta Sans' },
  { value: 'inter', label: 'Inter' },
  { value: 'publicSans', label: 'Public Sans' },
  { value: 'geist', label: 'Geist' },
  { value: 'rubik', label: 'Rubik' },
] as const
const {
  font: chineseFont,
  persistFailed: chineseFontPersistFailed,
  setChineseFont,
} = useChineseFont()
const chineseFontOptions = [
  { value: 'harmonyOsSans', label: 'HarmonyOS Sans SC' },
  { value: 'misans', label: 'MiSans' },
] as const
const themeOptions = computed(() =>
  (['light', 'dark'] as const).map((value) => ({
    value,
    label: t(`settings.appearance.theme${value === 'light' ? 'Light' : 'Dark'}`),
  })),
)
const sidebarLayoutOptions = computed(() =>
  (['floating', 'fullHeight'] as const).map((value) => ({
    value,
    label: t(
      `settings.appearance.sidebar${value === 'floating' ? 'Floating' : 'FullHeightOption'}`,
    ),
  })),
)
const motionPreferenceOptions = computed(() =>
  (['system', 'reduce'] as const).map((value) => ({
    value,
    label: t(`settings.appearance.reducedMotion.${value === 'system' ? 'system' : 'enabled'}`),
  })),
)

function selectTheme(mode: ThemeMode): void {
  void setTheme(mode)
}

function selectSidebarLayout(fullHeight: boolean): void {
  setSidebarFullHeight(fullHeight)
}

function selectMotionPreference(value: MotionPreference): void {
  setMotionPreference(value)
}

function selectLyricsScrollPreset(value: LyricsScrollPreset): void {
  setLyricsScrollPreset(value)
}

function selectPlaybarLayout(value: PlaybarLayout): void {
  setPlaybarLayout(value)
}

function selectPlaybarStyle(value: PlaybarStyle): void {
  setPlaybarStyle(value)
}

function selectControlStyle(value: ControlStyle): void {
  setControlStyle(value)
}

function selectPlayingIconPreset(value: PlayingIconPreset): void {
  setPlayingIcon(value)
}
</script>

<template>
  <section class="settings-section appearance-settings">
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.themeColors') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.appearance.theme') }}</strong>
          </div>
          <SettingsSegmentedControl
            id="appearance-theme"
            :label="t('settings.appearance.theme')"
            :model-value="theme"
            :options="themeOptions"
            @update:model-value="selectTheme($event as ThemeMode)"
          />
        </div>
        <ThemeAccentSettings />
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.interfaceStyles') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.sidebarLayout') }}</strong>
            <span id="appearance-sidebar-layout-description">{{
              t('settings.appearance.sidebarLayoutDescription')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-sidebar-layout"
            :label="t('settings.appearance.sidebarLayout')"
            describedby="appearance-sidebar-layout-description"
            :model-value="sidebarFullHeight ? 'fullHeight' : 'floating'"
            :options="sidebarLayoutOptions"
            @update:model-value="selectSidebarLayout($event === 'fullHeight')"
          />
        </div>
        <div class="settings-row settings-row--with-desc settings-row--playbar-layout">
          <div>
            <strong id="appearance-playbar-layout-label">{{
              t('settings.appearance.playbarLayout.title')
            }}</strong>
            <span id="appearance-playbar-layout-description">{{
              t('settings.appearance.playbarLayout.description')
            }}</span>
            <span v-if="playbarLayoutPersistFailed" role="status">{{
              t('settings.appearance.playbarLayout.persistFailed')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-playbar-layout"
            labelledby="appearance-playbar-layout-label"
            describedby="appearance-playbar-layout-description"
            :model-value="playbarLayout"
            :options="playbarLayoutOptions"
            @update:model-value="selectPlaybarLayout($event as PlaybarLayout)"
          />
        </div>
        <div class="settings-row settings-row--with-desc settings-row--playbar-style">
          <div>
            <strong id="appearance-playbar-style-label">{{
              t('settings.appearance.playbarStyle.title')
            }}</strong>
            <span id="appearance-playbar-style-description">{{
              t('settings.appearance.playbarStyle.description')
            }}</span>
            <span v-if="playbarStylePersistFailed" role="status">{{
              t('settings.appearance.playbarStyle.persistFailed')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-playbar-style"
            labelledby="appearance-playbar-style-label"
            describedby="appearance-playbar-style-description"
            :model-value="playbarStyle"
            :options="playbarStyleOptions"
            @update:model-value="selectPlaybarStyle($event as PlaybarStyle)"
          />
        </div>
        <div v-if="playbarStyle === 'liquid'" class="liquid-glass-parameters">
          <div class="settings-row settings-row--with-desc liquid-glass-parameter-header">
            <div>
              <strong id="appearance-liquid-glass-label">{{
                t('settings.appearance.liquidGlass.title')
              }}</strong>
              <span id="appearance-liquid-glass-description">{{
                t('settings.appearance.liquidGlass.description')
              }}</span>
              <span v-if="liquidGlassPersistFailed" role="status">{{
                t('settings.appearance.liquidGlass.persistFailed')
              }}</span>
            </div>
            <button
              type="button"
              class="settings-text-button"
              :disabled="liquidGlassAtDefaults"
              aria-describedby="appearance-liquid-glass-description"
              @click="resetLiquidGlassParameters"
            >
              {{ t('settings.appearance.liquidGlass.restoreDefault') }}
            </button>
          </div>
          <div
            v-for="field in LIQUID_GLASS_PARAMETER_FIELDS"
            :key="field"
            class="settings-row liquid-glass-parameter-row"
          >
            <div>
              <strong :id="`appearance-liquid-glass-${field}-label`">{{
                t(`settings.appearance.liquidGlass.${field}`)
              }}</strong>
            </div>
            <div class="settings-range-control">
              <input
                :id="`appearance-liquid-glass-${field}`"
                type="range"
                :min="LIQUID_GLASS_PARAMETER_LIMITS[field].min"
                :max="LIQUID_GLASS_PARAMETER_LIMITS[field].max"
                :step="LIQUID_GLASS_PARAMETER_LIMITS[field].step"
                :value="liquidGlassParameters[field]"
                :style="{ '--settings-range-progress': liquidGlassProgress(field) }"
                :aria-labelledby="`appearance-liquid-glass-${field}-label`"
                :aria-valuetext="formatLiquidGlassValue(field)"
                @input="selectLiquidGlassParameter(field, $event)"
              />
              <output :for="`appearance-liquid-glass-${field}`">{{
                formatLiquidGlassValue(field)
              }}</output>
            </div>
          </div>
        </div>
        <div class="settings-row settings-row--with-desc settings-row--control-style">
          <div>
            <strong id="appearance-control-style-label">{{
              t('settings.appearance.controlStyle.title')
            }}</strong>
            <span id="appearance-control-style-description">{{
              t('settings.appearance.controlStyle.description')
            }}</span>
            <span v-if="controlStylePersistFailed" role="status">{{
              t('settings.appearance.controlStyle.persistFailed')
            }}</span>
          </div>
          <SettingsSelect
            id="appearance-control-style"
            labelledby="appearance-control-style-label"
            describedby="appearance-control-style-description"
            :model-value="controlStyle"
            :options="controlStyleOptions"
            @update:model-value="selectControlStyle($event as ControlStyle)"
          />
        </div>
        <div class="settings-row settings-row--with-desc settings-row--playing-icon">
          <div>
            <strong id="appearance-playing-icon-label">{{
              t('settings.appearance.playingIcon.title')
            }}</strong>
            <span id="appearance-playing-icon-description">{{
              t('settings.appearance.playingIcon.description')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-playing-icon"
            labelledby="appearance-playing-icon-label"
            describedby="appearance-playing-icon-description"
            :model-value="playingIcon"
            :options="playingIconOptions"
            @update:model-value="selectPlayingIconPreset($event as PlayingIconPreset)"
          />
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.reducedMotion.title') }}</strong>
            <span id="appearance-motion-description">{{
              t('settings.appearance.reducedMotion.description')
            }}</span>
            <span v-if="motionPersistFailed" role="status">{{
              t('settings.appearance.reducedMotion.persistFailed')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-motion"
            :label="t('settings.appearance.reducedMotion.title')"
            describedby="appearance-motion-description"
            :model-value="motionPreference"
            :options="motionPreferenceOptions"
            @update:model-value="selectMotionPreference($event as MotionPreference)"
          />
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.languageAndText') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong id="appearance-language-label">{{ t('settings.appearance.language') }}</strong>
            <span id="appearance-language-description">{{
              t('settings.appearance.languageDescription')
            }}</span>
            <span v-if="localePersistFailed" role="status">{{
              t('settings.appearance.languagePersistFailed')
            }}</span>
            <span v-if="nativeSyncFailed" role="status">{{
              t('settings.appearance.languageSyncFailed')
            }}</span>
          </div>
          <SettingsSelect
            id="appearance-language"
            labelledby="appearance-language-label"
            describedby="appearance-language-description"
            :model-value="locale"
            :options="localeOptions"
            :show-value-title="false"
            @update:model-value="selectLocale($event as UiLocale)"
          />
        </div>
        <div class="settings-row settings-row--with-desc settings-row--chinese-font">
          <div>
            <strong id="appearance-chinese-font-label">{{
              t('settings.appearance.chineseFont.title')
            }}</strong>
            <span id="appearance-chinese-font-description">{{
              t('settings.appearance.chineseFont.description')
            }}</span>
            <span v-if="chineseFontPersistFailed" role="status">{{
              t('settings.appearance.chineseFont.persistFailed')
            }}</span>
          </div>
          <SettingsSelect
            id="appearance-chinese-font"
            labelledby="appearance-chinese-font-label"
            describedby="appearance-chinese-font-description"
            :model-value="chineseFont"
            :options="chineseFontOptions"
            :show-value-title="false"
            @update:model-value="setChineseFont($event as ChineseFontChoice)"
          />
        </div>
        <div class="settings-row settings-row--with-desc settings-row--english-font">
          <div>
            <strong id="appearance-english-font-label">{{
              t('settings.appearance.englishFont.title')
            }}</strong>
            <span id="appearance-english-font-description">{{
              t('settings.appearance.englishFont.description')
            }}</span>
            <span v-if="englishFontPersistFailed" role="status">{{
              t('settings.appearance.englishFont.persistFailed')
            }}</span>
          </div>
          <SettingsSelect
            id="appearance-english-font"
            labelledby="appearance-english-font-label"
            describedby="appearance-english-font-description"
            :model-value="englishFont"
            :options="englishFontOptions"
            :show-value-title="false"
            @update:model-value="setEnglishFont($event as EnglishFontChoice)"
          />
        </div>
        <ChineseTextSettings />
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.lyrics') }}</h2>
      </div>
      <div class="settings-group-card">
        <LyricsPanelLayoutSettings />
        <div class="settings-row settings-row--with-desc settings-row--lyrics-scroll">
          <div>
            <strong id="appearance-lyrics-scroll-label">{{
              t('settings.appearance.lyricsScroll.title')
            }}</strong>
            <span id="appearance-lyrics-scroll-description">{{
              t('settings.appearance.lyricsScroll.description')
            }}</span>
            <span v-if="lyricsScrollPersistFailed" role="status">{{
              t('settings.appearance.lyricsScroll.persistFailed')
            }}</span>
          </div>
          <SettingsSegmentedControl
            id="appearance-lyrics-scroll"
            labelledby="appearance-lyrics-scroll-label"
            describedby="appearance-lyrics-scroll-description"
            :model-value="lyricsScrollPreset"
            :options="lyricsScrollOptions"
            @update:model-value="selectLyricsScrollPreset($event as LyricsScrollPreset)"
          />
        </div>
        <LyricsCountdownSettings />
        <LyricsEffectsSettings />
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.startupAndWindow') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc settings-row--startup-album">
          <div>
            <strong>{{ t('settings.appearance.startupAlbum.title') }}</strong>
            <span id="startup-album-description">{{
              t('settings.appearance.startupAlbum.description')
            }}</span>
            <span v-if="startupAlbumPersistFailed" role="status">{{
              t('settings.appearance.startupAlbum.persistFailed')
            }}</span>
            <span v-if="startupAlbumDrawError" role="status">{{
              t(`settings.appearance.startupAlbum.${startupAlbumDrawError}`)
            }}</span>
          </div>
          <div class="startup-album-actions">
            <button
              type="button"
              class="settings-switch"
              role="switch"
              :aria-checked="startupAlbumEnabled"
              :aria-label="t('settings.appearance.startupAlbum.title')"
              aria-describedby="startup-album-description"
              :class="{ 'is-enabled': startupAlbumEnabled }"
              data-startup-setting
              @click="setStartupAlbumEnabled(!startupAlbumEnabled)"
            >
              <span class="settings-switch-thumb" aria-hidden="true" />
            </button>
            <button
              ref="startupAlbumDrawButton"
              type="button"
              class="settings-text-button startup-album-draw"
              :disabled="!startupAlbumActions || startupAlbumDrawing"
              :aria-busy="startupAlbumDrawing"
              data-startup-album-draw
              @click="drawStartupAlbum"
            >
              {{
                t(
                  startupAlbumDrawing
                    ? 'settings.appearance.startupAlbum.drawing'
                    : 'settings.appearance.startupAlbum.drawNow',
                )
              }}
            </button>
          </div>
        </div>
        <WindowBehaviorSettings />
      </div>
    </div>
  </section>
</template>

<style scoped>
.appearance-settings :deep(.settings-row:has(> .settings-segmented-control)) {
  flex-wrap: wrap;
  row-gap: 8px;
}

.appearance-settings :deep(.settings-row:has(> .settings-segmented-control) > div:first-child) {
  flex: 1 1 220px;
}

.appearance-settings :deep(.settings-row > .settings-segmented-control) {
  flex-wrap: wrap;
  max-width: 100%;
  margin-left: auto;
}

.settings-row--startup-album {
  flex-wrap: wrap;
}

.settings-row--startup-album > div:first-child {
  flex: 1 1 220px;
}

.settings-row > .startup-album-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

/* Keep the optical controls together without changing shared slider layouts. */
.liquid-glass-parameters {
  container: liquid-glass-parameters / inline-size;
  width: 100%;
  max-width: 760px;
}

.appearance-settings :deep(.settings-row + .dark-accent-settings),
.liquid-glass-parameters,
.liquid-glass-parameters + .settings-row {
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.appearance-settings .liquid-glass-parameter-header {
  flex-wrap: wrap;
  gap: 8px 16px;
}

.liquid-glass-parameter-header > div {
  flex: 1 1 240px;
}

.liquid-glass-parameter-header > button {
  margin-left: auto;
}

.appearance-settings .settings-row.liquid-glass-parameter-row {
  display: grid;
  box-sizing: border-box;
  grid-template-columns: 128px minmax(0, 1fr) 64px;
  grid-template-rows: auto;
  align-items: center;
  gap: 0 16px;
  height: auto;
  min-height: 56px;
  max-height: none;
}

.appearance-settings .liquid-glass-parameter-row > div:first-child {
  grid-column: 1;
  grid-row: 1;
}

.appearance-settings .liquid-glass-parameter-row > div:first-child > strong {
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.appearance-settings .liquid-glass-parameter-row > .settings-range-control {
  display: contents;
}

.appearance-settings .liquid-glass-parameter-row .settings-range-control input {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  min-width: 0;
}

.appearance-settings .liquid-glass-parameter-row .settings-range-control output {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
  justify-self: end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@container liquid-glass-parameters (width < 600px) {
  .appearance-settings .settings-row.liquid-glass-parameter-row {
    grid-template-columns: minmax(0, 1fr) 64px;
    grid-template-rows: auto auto;
    min-height: 64px;
    row-gap: 4px;
  }

  .appearance-settings .liquid-glass-parameter-row .settings-range-control input {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .appearance-settings .liquid-glass-parameter-row .settings-range-control output {
    grid-column: 2;
  }
}

.startup-album-actions .startup-album-draw {
  white-space: nowrap;
}
</style>
