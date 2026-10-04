<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useMotionPreference } from '@renderer/features/appearance/composables/useMotionPreference'
import type { MotionPreference } from '@renderer/shared/animation/motionPreference'
import SongFontWeightSettings from './SongFontWeightSettings.vue'
import ThemeAccentSettings from './ThemeAccentSettings.vue'

const { t } = useI18n()
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
        <h2 class="settings-group-title">界面</h2>
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
              @keydown.right.prevent="selectTheme('dark')"
              @keydown.down.prevent="selectTheme('dark')"
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
              @keydown.right.prevent="selectSidebarLayout(true)"
              @keydown.down.prevent="selectSidebarLayout(true)"
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
            >
              {{ t('settings.appearance.sidebarFullHeightOption') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <SongFontWeightSettings />
  </section>
</template>
