<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LYRICS_COUNTDOWN_EFFECTS,
  useLyricsCountdownPreference,
} from '@renderer/features/lyrics/lyricsCountdownPreference'

const { t } = useI18n()
const { effect: countdownEffect, persistFailed, setEffect } = useLyricsCountdownPreference()
const countdownOptions = LYRICS_COUNTDOWN_EFFECTS
const countdownButtons = ref<HTMLButtonElement[]>([])

function selectCountdownEffect(value: (typeof countdownOptions)[number]): void {
  setEffect(value)
  countdownButtons.value[countdownOptions.indexOf(value)]?.focus()
}

function toggleCountdownEffect(): void {
  selectCountdownEffect(countdownEffect.value === 'lighting' ? 'fracture' : 'lighting')
}
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
    <div
      class="settings-segmented-control"
      role="radiogroup"
      aria-labelledby="lyrics-countdown-label"
      aria-describedby="lyrics-countdown-description"
    >
      <button
        v-for="option in countdownOptions"
        :key="option"
        ref="countdownButtons"
        type="button"
        class="settings-segmented-option"
        role="radio"
        :aria-checked="countdownEffect === option"
        :tabindex="countdownEffect === option ? 0 : -1"
        :class="{ 'is-selected': countdownEffect === option }"
        @click="selectCountdownEffect(option)"
        @keydown.left.prevent="toggleCountdownEffect"
        @keydown.right.prevent="toggleCountdownEffect"
        @keydown.up.prevent="toggleCountdownEffect"
        @keydown.down.prevent="toggleCountdownEffect"
        @keydown.home.prevent="selectCountdownEffect('lighting')"
        @keydown.end.prevent="selectCountdownEffect('fracture')"
      >
        {{ t(`settings.appearance.lyricsEffects.countdown.${option}`) }}
      </button>
    </div>
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
