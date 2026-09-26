<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeMode } from '@renderer/composables/useTheme'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const { t } = useI18n()
const { theme, setTheme } = useTheme()
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
const {
  gaplessPlaybackEnabled,
  setGaplessPlaybackEnabled,
  skipDigitalSilenceEnabled,
  setSkipDigitalSilenceEnabled,
  softTransitionEnabled,
  setSoftTransitionEnabled,
} = usePlayback()
const nativeAvailable = ref<boolean | null>(null)
onMounted(async () => {
  try {
    nativeAvailable.value = (await auralis.playback.nativeAvailability()).available
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'settings.playback',
      message: 'Could not check native playback availability',
      cause,
    })
  }
})
</script>

<template>
  <section class="settings-section">
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">界面</h2>
      </div>
      <div class="settings-list">
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
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.appearance.fluidBackground') }}</strong>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="shellFluidBackgroundEnabled"
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

    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">播放</h2>
      </div>
      <div class="settings-list">
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.playback.gapless') }}</strong>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="gaplessPlaybackEnabled"
            :aria-label="
              gaplessPlaybackEnabled
                ? t('settings.playback.gaplessAriaOn')
                : t('settings.playback.gaplessAriaOff')
            "
            :class="{ 'is-enabled': gaplessPlaybackEnabled }"
            @click="setGaplessPlaybackEnabled(!gaplessPlaybackEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row">
          <div>
            <strong>跳过边界数字静音</strong>
            <span id="digital-silence-description">
              移除连续专辑曲目间极短的数字静音。
              <template v-if="gaplessPlaybackEnabled && nativeAvailable === false"
                >当前原生播放不可用。</template
              >
            </span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            aria-label="跳过边界数字静音"
            aria-describedby="digital-silence-description"
            :aria-checked="skipDigitalSilenceEnabled"
            :disabled="!gaplessPlaybackEnabled"
            :class="{ 'is-enabled': skipDigitalSilenceEnabled }"
            @click="setSkipDigitalSilenceEnabled(!skipDigitalSilenceEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row">
          <div>
            <strong>柔和过渡</strong>
            <span id="soft-transition-description">
              普通换曲时交叉淡化 2 秒。
              <template v-if="nativeAvailable === false">当前原生播放不可用。</template>
            </span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            aria-label="柔和过渡"
            aria-describedby="soft-transition-description"
            :aria-checked="softTransitionEnabled"
            :disabled="!gaplessPlaybackEnabled || nativeAvailable === false"
            :class="{ 'is-enabled': softTransitionEnabled }"
            @click="setSoftTransitionEnabled(!softTransitionEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
