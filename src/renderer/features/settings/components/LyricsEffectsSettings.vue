<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLyricsEffectsPreference } from '@renderer/features/lyrics/lyricsEffectsPreference'
import LyricsPanelLayoutSettings from './LyricsPanelLayoutSettings.vue'

const { t } = useI18n()
const { effects, persistFailed, setEnabled } = useLyricsEffectsPreference()
const rows = ['edgeFade', 'blur'] as const
</script>

<template>
  <div class="settings-group lyrics-effects-settings">
    <div class="settings-group-header">
      <h2 class="settings-group-title">{{ t('settings.appearance.lyricsEffects.title') }}</h2>
    </div>
    <div class="settings-group-card">
      <LyricsPanelLayoutSettings />
      <div v-for="effect in rows" :key="effect" class="settings-row settings-row--with-desc">
        <div>
          <strong>{{ t(`settings.appearance.lyricsEffects.${effect}.title`) }}</strong>
          <span :id="`lyrics-effect-${effect}-description`">{{
            t(`settings.appearance.lyricsEffects.${effect}.description`)
          }}</span>
          <span v-if="persistFailed[effect]" role="status">{{
            t('settings.appearance.lyricsEffects.persistFailed')
          }}</span>
        </div>
        <button
          type="button"
          class="settings-switch"
          role="switch"
          :aria-checked="effects[effect]"
          :aria-label="t(`settings.appearance.lyricsEffects.${effect}.title`)"
          :aria-describedby="`lyrics-effect-${effect}-description`"
          :class="{ 'is-enabled': effects[effect] }"
          :data-lyrics-effect="effect"
          @click="setEnabled(effect, !effects[effect])"
        >
          <span class="settings-switch-thumb" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
