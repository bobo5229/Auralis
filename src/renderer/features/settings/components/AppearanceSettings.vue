<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const { t } = useI18n()
const { shellFluidBackgroundEnabled, setShellFluidBackgroundEnabled } = useShellFluidBackground()
const {
  gaplessPlaybackEnabled,
  setGaplessPlaybackEnabled,
  skipDigitalSilenceEnabled,
  setSkipDigitalSilenceEnabled,
} = usePlayback()
</script>

<template>
  <section class="settings-section">
    <div class="settings-list">
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
      <div class="settings-row">
        <div>
          <strong>{{ t('settings.playback.gapless') }}</strong>
          <span id="gapless-playback-description">{{
            t('settings.playback.gaplessDescription')
          }}</span>
        </div>
        <button
          type="button"
          class="settings-switch"
          role="switch"
          :aria-checked="gaplessPlaybackEnabled"
          aria-describedby="gapless-playback-description"
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
            无缝播放时，跳过同专辑、同碟连续音轨边界不超过 100 毫秒的全零静音。
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
    </div>
  </section>
</template>
