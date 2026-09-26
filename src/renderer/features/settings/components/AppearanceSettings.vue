<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShellFluidBackground } from '@renderer/features/appearance/composables/useShellFluidBackground'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const { t } = useI18n()
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
            开启柔和过渡后，也用于过渡两端的数字静音。 分析未及时完成时，保留原有静音并正常衔接。
            <template v-if="gaplessPlaybackEnabled && nativeAvailable === false">
              当前原生播放后端不可用，兼容播放模式不支持跳过边界数字静音。
            </template>
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
            自然换曲时交叉淡化 2 秒，不跳过歌曲段落。同专辑连续曲目保持无缝播放。
            采样率不同、格式不支持或准备未及时完成时正常衔接。
            <template v-if="nativeAvailable === false"
              >当前原生播放后端不可用，此功能暂不生效。</template
            >
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
  </section>
</template>
