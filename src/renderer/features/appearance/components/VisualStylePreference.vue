<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVisualStyle, type VisualStyle } from '../composables/useVisualStyle'
import { resolveRovingIndex } from '../utils/rovingIndex'

const { t } = useI18n()
const { visualStyle, setVisualStyle } = useVisualStyle()

const OPTIONS = [
  {
    value: 'modern' as const,
    labelKey: 'settings.appearance.visualStyle.modernLabel',
    descriptionKey: 'settings.appearance.visualStyle.modernDescription',
  },
  {
    value: 'manuscript' as const,
    labelKey: 'settings.appearance.visualStyle.manuscriptLabel',
    descriptionKey: 'settings.appearance.visualStyle.manuscriptDescription',
  },
]

const optionRefs = ref<Array<HTMLButtonElement | null>>([])

function setOptionRef(index: number, el: unknown): void {
  optionRefs.value[index] = el instanceof HTMLButtonElement ? el : null
}

function selectStyle(value: VisualStyle, focusSelected = false): void {
  setVisualStyle(value)
  if (!focusSelected) return
  const index = OPTIONS.findIndex((option) => option.value === value)
  void nextTick(() => optionRefs.value[index]?.focus())
}

function handleKeydown(event: KeyboardEvent, value: VisualStyle): void {
  const currentIndex = OPTIONS.findIndex((option) => option.value === value)
  const nextIndex = resolveRovingIndex(currentIndex, OPTIONS.length, event.key)
  if (nextIndex === null) return
  event.preventDefault()
  const nextOption = OPTIONS[nextIndex]
  if (nextOption) selectStyle(nextOption.value, true)
}
</script>

<template>
  <div class="visual-style-preference">
    <div class="visual-style-preference__copy">
      <strong id="visual-style-label">{{ t('settings.appearance.visualStyle.label') }}</strong>
      <span id="visual-style-description">{{
        t('settings.appearance.visualStyle.description')
      }}</span>
    </div>

    <div
      class="visual-style-preference__group"
      role="radiogroup"
      aria-labelledby="visual-style-label"
      aria-describedby="visual-style-description visual-style-coverage"
    >
      <button
        v-for="(option, index) in OPTIONS"
        :key="option.value"
        :ref="(el) => setOptionRef(index, el)"
        type="button"
        role="radio"
        class="visual-style-option"
        :class="{ 'is-selected': visualStyle === option.value }"
        :data-style="option.value"
        :aria-checked="visualStyle === option.value"
        :tabindex="visualStyle === option.value ? 0 : -1"
        @click="selectStyle(option.value)"
        @keydown="handleKeydown($event, option.value)"
      >
        <span class="visual-style-sample" :data-style="option.value" aria-hidden="true">
          <span class="visual-style-sample__sidebar"></span>
          <span class="visual-style-sample__page">
            <i></i>
            <i></i>
            <i></i>
          </span>
        </span>
        <span class="visual-style-option__text">
          <strong>{{ t(option.labelKey) }}</strong>
          <small>{{ t(option.descriptionKey) }}</small>
        </span>
      </button>
    </div>

    <p id="visual-style-coverage" class="visual-style-preference__coverage">
      {{ t('settings.appearance.visualStyle.coverage') }}
    </p>
  </div>
</template>

<style scoped>
.visual-style-preference {
  display: grid;
  gap: 12px;
}

.visual-style-preference__copy {
  display: grid;
  gap: 4px;
}

.visual-style-preference__copy strong {
  font-size: 13px;
  font-weight: 700;
}

.visual-style-preference__copy span,
.visual-style-preference__coverage {
  color: var(--auralis-text-subtle);
  font-size: 12px;
  line-height: 1.45;
}

.visual-style-preference__coverage {
  margin: 0;
}

.visual-style-preference__group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.visual-style-option {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 55%, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.visual-style-option.is-selected {
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 45%, transparent);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 28%, transparent);
}

.visual-style-option:focus-visible {
  outline: 2px solid var(--auralis-progress-fill);
  outline-offset: 2px;
}

.visual-style-sample {
  display: grid;
  grid-template-columns: 22% 1fr;
  height: 72px;
  overflow: hidden;
  border: 1px solid rgba(120, 120, 120, 0.16);
  border-radius: 10px;
}

.visual-style-sample[data-style='modern'] {
  background: #191919;
}

.visual-style-sample[data-style='modern'] .visual-style-sample__sidebar {
  background: #232324;
  border-right: 1px solid rgba(120, 120, 120, 0.1);
}

.visual-style-sample[data-style='modern'] .visual-style-sample__page {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 12px 10px;
}

.visual-style-sample[data-style='modern'] i {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: #2a2c2f;
}

.visual-style-sample[data-style='manuscript'] {
  background: #f4efe4;
}

.visual-style-sample[data-style='manuscript'] .visual-style-sample__sidebar {
  background: #ebe4d4;
  border-right: 1px solid rgba(62, 57, 50, 0.18);
}

.visual-style-sample[data-style='manuscript'] .visual-style-sample__page {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 12px 10px;
}

.visual-style-sample[data-style='manuscript'] i {
  display: block;
  height: 7px;
  background: rgba(48, 43, 37, 0.28);
}

.visual-style-sample[data-style='manuscript'] i:first-child {
  width: 42%;
  background: #8b302f;
}

.visual-style-option__text {
  display: grid;
  gap: 3px;
}

.visual-style-option__text strong {
  font-size: 13px;
}

.visual-style-option__text small {
  color: var(--auralis-text-subtle);
  font-size: 11px;
  line-height: 1.4;
}

@media (max-width: 560px) {
  .visual-style-preference__group {
    grid-template-columns: 1fr;
  }
}
</style>
