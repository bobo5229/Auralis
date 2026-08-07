<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useVisualStyle, type VisualStyle } from '../composables/useVisualStyle'

const { t } = useI18n()
const { visualStyle, setVisualStyle } = useVisualStyle()

const STYLE_OPTIONS: readonly { value: VisualStyle; labelKey: string }[] = [
  { value: 'modern', labelKey: 'library.visualStyle.modern' },
  { value: 'manuscript', labelKey: 'library.visualStyle.manuscript' },
]
</script>

<template>
  <div class="visual-style-switch" role="group" :aria-label="t('library.visualStyle.label')">
    <button
      v-for="option in STYLE_OPTIONS"
      :key="option.value"
      type="button"
      class="visual-style-switch-button"
      :class="{ 'is-active': visualStyle === option.value }"
      :aria-pressed="visualStyle === option.value"
      @click="setVisualStyle(option.value)"
    >
      {{ t(option.labelKey) }}
    </button>
  </div>
</template>

<style scoped>
.visual-style-switch {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 38px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--auralis-search-border);
  background: var(--auralis-search-bg);
  box-shadow: var(--auralis-search-shadow);
  backdrop-filter: blur(14px) saturate(1.08);
  -webkit-backdrop-filter: blur(14px) saturate(1.08);
  pointer-events: auto;
}

.visual-style-switch-button {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.visual-style-switch-button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.visual-style-switch-button.is-active {
  background: var(--auralis-control-active-bg);
  color: var(--auralis-text);
}

.visual-style-switch-button:focus-visible {
  outline: 2px solid var(--auralis-progress-fill);
  outline-offset: 1px;
}
</style>
