<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsSegmentedControl from '@renderer/shared/components/SettingsSegmentedControl.vue'
import {
  LYRICS_COUNTDOWN_EFFECTS,
  useLyricsCountdownPreference,
  type LyricsCountdownEffect,
} from '@renderer/features/lyrics/lyricsCountdownPreference'

const { t } = useI18n()
const { effect: countdownEffect, persistFailed, setEffect } = useLyricsCountdownPreference()
const options = LYRICS_COUNTDOWN_EFFECTS.map((value) => ({
  value,
  label: t(`settings.appearance.lyricsEffects.countdown.${value}`),
}))
</script>

<template>
  <div class="settings-row settings-row--with-desc settings-row--lyrics-countdown">
    <div>
      <strong id="lyrics-countdown-label">{{
        t('settings.appearance.lyricsEffects.countdown.title')
      }}</strong>
      <span id="lyrics-countdown-description">{{
        t('settings.appearance.lyricsEffects.countdown.description')
      }}</span>
      <span v-if="persistFailed" role="status">{{
        t('settings.appearance.lyricsEffects.persistFailed')
      }}</span>
    </div>
    <SettingsSegmentedControl
      id="lyrics-countdown"
      labelledby="lyrics-countdown-label"
      describedby="lyrics-countdown-description"
      :model-value="countdownEffect"
      :options="options"
      @update:model-value="setEffect($event as LyricsCountdownEffect)"
    />
  </div>
</template>

<style scoped>
.settings-row--lyrics-countdown {
  flex-wrap: wrap;
}

.settings-row--lyrics-countdown > div:first-child {
  flex: 1 1 220px;
}

.settings-row--lyrics-countdown > .settings-segmented-control {
  margin-left: auto;
}
</style>
