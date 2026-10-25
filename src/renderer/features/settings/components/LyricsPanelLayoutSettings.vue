<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsSegmentedControl from '@renderer/shared/components/SettingsSegmentedControl.vue'
import {
  LYRICS_PANEL_MODES,
  useLyricsPanelMode,
  type LyricsPanelMode,
} from '@renderer/features/appearance/composables/useLyricsPanelMode'

const { t } = useI18n()
const { mode, persistFailed, setMode } = useLyricsPanelMode()
const options = LYRICS_PANEL_MODES.map((value) => ({
  value,
  label: t(`settings.appearance.lyricsPanelLayout.${value}`),
}))
</script>

<template>
  <div class="settings-row settings-row--with-desc settings-row--lyrics-panel-layout">
    <div>
      <strong id="lyrics-panel-layout-label">{{
        t('settings.appearance.lyricsPanelLayout.title')
      }}</strong>
      <span id="lyrics-panel-layout-description">{{
        t('settings.appearance.lyricsPanelLayout.description')
      }}</span>
      <span v-if="persistFailed" role="status">{{
        t('settings.appearance.lyricsPanelLayout.persistFailed')
      }}</span>
    </div>
    <SettingsSegmentedControl
      id="lyrics-panel-layout"
      labelledby="lyrics-panel-layout-label"
      describedby="lyrics-panel-layout-description"
      :model-value="mode"
      :options="options"
      @update:model-value="setMode($event as LyricsPanelMode)"
    />
  </div>
</template>

<style scoped>
.settings-row--lyrics-panel-layout {
  flex-wrap: wrap;
}

.settings-row--lyrics-panel-layout > div:first-child {
  flex: 1 1 220px;
}

.settings-row--lyrics-panel-layout > .settings-segmented-control {
  margin-left: auto;
}
</style>
