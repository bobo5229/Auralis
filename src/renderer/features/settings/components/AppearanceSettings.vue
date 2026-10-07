<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useMotionPreference } from '@renderer/features/appearance/composables/useMotionPreference'
import type { MotionPreference } from '@renderer/shared/animation/motionPreference'
import SongFontWeightSettings from './SongFontWeightSettings.vue'
import ThemeAccentSettings from './ThemeAccentSettings.vue'
import ChineseTextSettings from './ChineseTextSettings.vue'
import { useUiLocale } from '@renderer/i18n'
import type { UiLocale } from '@shared/uiLocale'

const { t } = useI18n()
const { locale, persistFailed: localePersistFailed, nativeSyncFailed, setUiLocale } = useUiLocale()
const localeOptions = [
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'en', label: 'English' },
] as const
const localeButtons = ref<HTMLButtonElement[]>([])
function selectLocale(value: UiLocale): void {
  setUiLocale(value)
  localeButtons.value[localeOptions.findIndex((option) => option.id === value)]?.focus()
}
const { theme, setTheme } = useTheme()
const { sidebarFullHeight, setSidebarFullHeight } = useSidebarLayout()
const {
  motionPreference,
  persistFailed: motionPersistFailed,
  setMotionPreference,
} = useMotionPreference()
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
</script>

<template>
  <section class="settings-section">
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.appearance.interface') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.language') }}</strong>
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
          <div
            class="settings-segmented-control"
            role="radiogroup"
            :aria-label="t('settings.appearance.language')"
            aria-describedby="appearance-language-description"
          >
            <button
              v-for="option in localeOptions"
              :key="option.id"
              ref="localeButtons"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="locale === option.id"
              :tabindex="locale === option.id ? 0 : -1"
              :class="{ 'is-selected': locale === option.id }"
              :lang="option.id"
              @click="selectLocale(option.id)"
              @keydown.left.prevent="selectLocale(locale === 'en' ? 'zh-Hans' : 'en')"
              @keydown.right.prevent="selectLocale(locale === 'en' ? 'zh-Hans' : 'en')"
              @keydown.up.prevent="selectLocale(locale === 'en' ? 'zh-Hans' : 'en')"
              @keydown.down.prevent="selectLocale(locale === 'en' ? 'zh-Hans' : 'en')"
              @keydown.home.prevent="selectLocale('zh-Hans')"
              @keydown.end.prevent="selectLocale('en')"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
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
        <ThemeAccentSettings />
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
      </div>
    </div>

    <ChineseTextSettings />
    <SongFontWeightSettings />
  </section>
</template>
