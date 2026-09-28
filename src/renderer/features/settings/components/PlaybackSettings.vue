<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const { t } = useI18n()
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
        <h2 class="settings-group-title">{{ t('settings.nav.playback') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
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
        <div class="settings-row settings-row--with-desc">
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
        <div class="settings-row settings-row--with-desc">
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
