<script setup lang="ts">
import { computed } from 'vue'
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
            <span v-if="playbarLayoutPersistFailed" class="settings-status--error" role="status">{{
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
            <span v-if="motionPersistFailed" class="settings-status--error" role="status">{{
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
            <span v-if="localePersistFailed" class="settings-status--error" role="status">{{
              t('settings.appearance.languagePersistFailed')
            }}</span>
            <span v-if="nativeSyncFailed" class="settings-status--error" role="status">{{
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
            <span v-if="chineseFontPersistFailed" class="settings-status--error" role="status">{{
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
            <span v-if="englishFontPersistFailed" class="settings-status--error" role="status">{{
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
            <span v-if="lyricsScrollPersistFailed" class="settings-status--error" role="status">{{
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

.appearance-settings :deep(.settings-row + .dark-accent-settings) {
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}
</style>
