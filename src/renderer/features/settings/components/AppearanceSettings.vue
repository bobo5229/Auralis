<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import SongFontWeightSettings from './SongFontWeightSettings.vue'
import DarkAccentSettings from './DarkAccentSettings.vue'

const { t } = useI18n()
const { theme, setTheme } = useTheme()
const { sidebarFullHeight, setSidebarFullHeight } = useSidebarLayout()
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
        <DarkAccentSettings />
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
