<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useCoverArtworkCorners } from '@renderer/features/appearance/composables/useCoverArtworkCorners'
import SongFontWeightSettings from './SongFontWeightSettings.vue'

const { t } = useI18n()
const { theme, setTheme } = useTheme()
const { sidebarFullHeight, setSidebarFullHeight } = useSidebarLayout()
const { coverArtworkRounded, setCoverArtworkRounded } = useCoverArtworkCorners()
const darkOptionRef = ref<HTMLButtonElement | null>(null)
const lightOptionRef = ref<HTMLButtonElement | null>(null)

function selectTheme(mode: ThemeMode): void {
  void setTheme(mode)
  if (mode === 'dark') {
    darkOptionRef.value?.focus()
  } else {
    lightOptionRef.value?.focus()
  }
}

const { shellFluidBackgroundEnabled, setShellFluidBackgroundEnabled } = useShellFluidBackground()
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
              ref="darkOptionRef"
              type="button"
              class="settings-segmented-option"
              role="radio"
              :aria-checked="theme === 'dark'"
              :tabindex="theme === 'dark' ? 0 : -1"
              :class="{ 'is-selected': theme === 'dark' }"
              @click="selectTheme('dark')"
              @keydown.right.prevent="selectTheme('light')"
              @keydown.down.prevent="selectTheme('light')"
            >
              {{ t('settings.appearance.themeDark') }}
            </button>
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
            >
              {{ t('settings.appearance.themeLight') }}
            </button>
          </div>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.sidebarFullHeight') }}</strong>
            <span id="appearance-sidebar-layout-description">{{
              t('settings.appearance.sidebarFullHeightDescription')
            }}</span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="sidebarFullHeight"
            :aria-label="t('settings.appearance.sidebarFullHeight')"
            aria-describedby="appearance-sidebar-layout-description"
            :class="{ 'is-enabled': sidebarFullHeight }"
            @click="setSidebarFullHeight(!sidebarFullHeight)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.coverArtworkRounded') }}</strong>
            <span id="appearance-cover-corners-description">{{
              t('settings.appearance.coverArtworkRoundedDescription')
            }}</span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="coverArtworkRounded"
            :aria-label="t('settings.appearance.coverArtworkRounded')"
            aria-describedby="appearance-cover-corners-description"
            :class="{ 'is-enabled': coverArtworkRounded }"
            @click="setCoverArtworkRounded(!coverArtworkRounded)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.appearance.fluidBackground') }}</strong>
            <span id="appearance-fluid-bg-description">{{
              t('settings.appearance.fluidBackgroundDescription')
            }}</span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="shellFluidBackgroundEnabled"
            aria-describedby="appearance-fluid-bg-description"
            :aria-label="
              shellFluidBackgroundEnabled
                ? t('settings.appearance.fluidBackgroundAriaOn')
                : t('settings.appearance.fluidBackgroundAriaOff')
            "
            :class="{ 'is-enabled': shellFluidBackgroundEnabled }"
            @click="setShellFluidBackgroundEnabled(!shellFluidBackgroundEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>

    <SongFontWeightSettings />
  </section>
</template>
