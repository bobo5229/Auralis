<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { useStartupAlbumPreference } from '@renderer/features/startupAlbum/startupAlbumPreference'
import { startupAlbumActionsKey } from '@renderer/features/startupAlbum/startupAlbumActions'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
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
import SettingsSelect from './SettingsSelect.vue'
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
const { playingIcon, setPlayingIcon } = usePlayingIconPreference()
const playingIconOptions = computed(() =>
  PLAYING_ICON_PRESETS.map((value) => ({
    value,
    label: t(`settings.appearance.playingIcon.${value}`),
  })),
)
const systemMotionRef = ref<HTMLButtonElement | null>(null)
const reducedMotionRef = ref<HTMLButtonElement | null>(null)
const darkOptionRef = ref<HTMLButtonElement | null>(null)
const lightOptionRef = ref<HTMLButtonElement | null>(null)
const floatingSidebarOptionRef = ref<HTMLButtonElement | null>(null)
const fullHeightSidebarOptionRef = ref<HTMLButtonElement | null>(null)

function selectTheme(mode: ThemeMode): void {
  void setTheme(mode)
  if (mode === 'dark') {
    darkOptionRef.value?.focus()
  } else {
    lightOptionRef.value?.focus()
  }
}

function selectSidebarLayout(fullHeight: boolean): void {
  setSidebarFullHeight(fullHeight)
  if (fullHeight) {
    fullHeightSidebarOptionRef.value?.focus()
  } else {
    floatingSidebarOptionRef.value?.focus()
  }
}

function selectMotionPreference(value: MotionPreference): void {
  setMotionPreference(value)
  ;(value === 'system' ? systemMotionRef : reducedMotionRef).value?.focus()
}

function selectLyricsScrollPreset(value: LyricsScrollPreset): void {
  setLyricsScrollPreset(value)
}

function selectPlaybarStyle(value: PlaybarStyle): void {
  setPlaybarStyle(value)
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
        <ThemeAccentSettings />
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.interfaceStyles') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.appearance.theme') }}</strong>
          </div>
          <div
            class="settings-segmented-control"
            role="radiogroup"
            :aria-label="t('settings.appearance.theme')"
          >
            <button
              ref="lightOptionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="theme === 'light'"
              :tabindex="theme === 'light' ? 0 : -1"
              :class="{ 'is-selected': theme === 'light' }"
              @click="selectTheme('light')"
              @keydown.left.prevent="selectTheme('dark')"
              @keydown.up.prevent="selectTheme('dark')"
              @keydown.right.prevent="selectTheme('dark')"
              @keydown.down.prevent="selectTheme('dark')"
              @keydown.home.prevent="selectTheme('light')"
              @keydown.end.prevent="selectTheme('dark')"
            >
              {{ t('settings.appearance.themeLight') }}
            </button>
            <button
              ref="darkOptionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="theme === 'dark'"
              :tabindex="theme === 'dark' ? 0 : -1"
              :class="{ 'is-selected': theme === 'dark' }"
              @click="selectTheme('dark')"
              @keydown.left.prevent="selectTheme('light')"
              @keydown.up.prevent="selectTheme('light')"
              @keydown.right.prevent="selectTheme('light')"
              @keydown.down.prevent="selectTheme('light')"
              @keydown.home.prevent="selectTheme('light')"
              @keydown.end.prevent="selectTheme('dark')"
            >
              {{ t('settings.appearance.themeDark') }}
            </button>
          </div>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.sidebarLayout') }}</strong>
            <span id="appearance-sidebar-layout-description">{{
              t('settings.appearance.sidebarLayoutDescription')
            }}</span>
          </div>
          <div
            class="settings-segmented-control"
            role="radiogroup"
            :aria-label="t('settings.appearance.sidebarLayout')"
            aria-describedby="appearance-sidebar-layout-description"
          >
            <button
              ref="floatingSidebarOptionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="!sidebarFullHeight"
              :tabindex="sidebarFullHeight ? -1 : 0"
              :class="{ 'is-selected': !sidebarFullHeight }"
              @click="selectSidebarLayout(false)"
              @keydown.left.prevent="selectSidebarLayout(true)"
              @keydown.up.prevent="selectSidebarLayout(true)"
              @keydown.right.prevent="selectSidebarLayout(true)"
              @keydown.down.prevent="selectSidebarLayout(true)"
              @keydown.home.prevent="selectSidebarLayout(false)"
              @keydown.end.prevent="selectSidebarLayout(true)"
            >
              {{ t('settings.appearance.sidebarFloating') }}
            </button>
            <button
              ref="fullHeightSidebarOptionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="sidebarFullHeight"
              :tabindex="sidebarFullHeight ? 0 : -1"
              :class="{ 'is-selected': sidebarFullHeight }"
              @click="selectSidebarLayout(true)"
              @keydown.left.prevent="selectSidebarLayout(false)"
              @keydown.up.prevent="selectSidebarLayout(false)"
              @keydown.right.prevent="selectSidebarLayout(false)"
              @keydown.down.prevent="selectSidebarLayout(false)"
              @keydown.home.prevent="selectSidebarLayout(false)"
              @keydown.end.prevent="selectSidebarLayout(true)"
            >
              {{ t('settings.appearance.sidebarFullHeightOption') }}
            </button>
          </div>
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
      </div>
    </div>

    <ChineseTextSettings />

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.lyricsAndMotion') }}</h2>
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
          <div
            class="settings-segmented-control"
            role="radiogroup"
            :aria-label="t('settings.appearance.reducedMotion.title')"
            aria-describedby="appearance-motion-description"
          >
            <button
              ref="systemMotionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="motionPreference === 'system'"
              :tabindex="motionPreference === 'system' ? 0 : -1"
              :class="{ 'is-selected': motionPreference === 'system' }"
              @click="selectMotionPreference('system')"
              @keydown.left.prevent="selectMotionPreference('reduce')"
              @keydown.up.prevent="selectMotionPreference('reduce')"
              @keydown.right.prevent="selectMotionPreference('reduce')"
              @keydown.down.prevent="selectMotionPreference('reduce')"
              @keydown.home.prevent="selectMotionPreference('system')"
              @keydown.end.prevent="selectMotionPreference('reduce')"
            >
              {{ t('settings.appearance.reducedMotion.system') }}
            </button>
            <button
              ref="reducedMotionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="motionPreference === 'reduce'"
              :tabindex="motionPreference === 'reduce' ? 0 : -1"
              :class="{ 'is-selected': motionPreference === 'reduce' }"
              @click="selectMotionPreference('reduce')"
              @keydown.right.prevent="selectMotionPreference('system')"
              @keydown.down.prevent="selectMotionPreference('system')"
              @keydown.left.prevent="selectMotionPreference('system')"
              @keydown.up.prevent="selectMotionPreference('system')"
              @keydown.home.prevent="selectMotionPreference('system')"
              @keydown.end.prevent="selectMotionPreference('reduce')"
            >
              {{ t('settings.appearance.reducedMotion.enabled') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.groups.generalPreferences') }}</h2>
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
            @update:model-value="selectLocale($event as UiLocale)"
          />
        </div>
        <WindowBehaviorSettings />
      </div>
    </div>

    <LyricsEffectsSettings>
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
    </LyricsEffectsSettings>
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

.startup-album-actions .startup-album-draw {
  white-space: nowrap;
}
</style>
