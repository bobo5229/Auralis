<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LYRICS_PANEL_MODES,
  useLyricsPanelMode,
  type LyricsPanelMode,
} from '@renderer/features/appearance/composables/useLyricsPanelMode'

const { t } = useI18n()
const { mode, persistFailed, setMode } = useLyricsPanelMode()
const optionButtons = ref<HTMLButtonElement[]>([])

function selectMode(value: LyricsPanelMode): void {
  setMode(value)
  optionButtons.value[LYRICS_PANEL_MODES.indexOf(value)]?.focus()
}

function toggleMode(): void {
  selectMode(mode.value === 'split' ? 'floating' : 'split')
}
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
    <div
      class="settings-segmented-control"
      role="radiogroup"
      aria-labelledby="lyrics-panel-layout-label"
      aria-describedby="lyrics-panel-layout-description"
    >
      <button
        v-for="option in LYRICS_PANEL_MODES"
        :key="option"
        ref="optionButtons"
        type="button"
        class="settings-segmented-option"
        role="radio"
        :aria-checked="mode === option"
        :tabindex="mode === option ? 0 : -1"
        :class="{ 'is-selected': mode === option }"
        @click="selectMode(option)"
        @keydown.left.prevent="toggleMode"
        @keydown.right.prevent="toggleMode"
        @keydown.up.prevent="toggleMode"
        @keydown.down.prevent="toggleMode"
        @keydown.home.prevent="selectMode('split')"
        @keydown.end.prevent="selectMode('floating')"
      >
        {{ t(`settings.appearance.lyricsPanelLayout.${option}`) }}
      </button>
    </div>
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
