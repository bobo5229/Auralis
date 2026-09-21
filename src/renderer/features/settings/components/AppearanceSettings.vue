<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const { t } = useI18n()
const { gaplessPlaybackEnabled, setGaplessPlaybackEnabled } = usePlayback()
</script>

<template>
  <section class="settings-section">
    <div class="settings-list">
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
    </div>
  </section>
</template>
