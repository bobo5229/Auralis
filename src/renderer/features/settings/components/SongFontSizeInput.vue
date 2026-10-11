<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  id: string
  label: string
  modelValue: number
  min: number
  max: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const { t } = useI18n()
const draft = ref(String(props.modelValue))
const pointerFocus = ref(false)
useEventListener(
  document,
  'keydown',
  (event) => {
    if (event.key === 'Tab') pointerFocus.value = false
  },
  { capture: true },
)
watch(
  () => props.modelValue,
  (value) => {
    draft.value = String(value)
  },
)

function onInput(event: Event) {
  draft.value = (event.target as HTMLInputElement).value
  if (!/^\d+$/.test(draft.value)) return
  const value = Number(draft.value)
  if (value >= props.min && value <= props.max) emit('update:modelValue', value)
}

function restore() {
  draft.value = String(props.modelValue)
}
function step(delta: number) {
  const value = Math.min(props.max, Math.max(props.min, props.modelValue + delta))
  draft.value = String(value)
  if (value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<template>
  <div
    class="song-font-size-input"
    :class="{ 'is-pointer-focus': pointerFocus }"
    @pointerdown.capture="pointerFocus = true"
  >
    <input
      :id="id"
      type="text"
      inputmode="numeric"
      role="spinbutton"
      :aria-label="`${label} ${t('settings.appearance.songFontWeight.sizeLabel')}`"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      :aria-valuetext="`${modelValue} px`"
      :value="draft"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @blur="restore"
      @keydown.up.prevent="step(1)"
      @keydown.down.prevent="step(-1)"
      @keydown.enter.prevent="restore"
      @keydown.esc.prevent.stop="restore"
    />
    <span class="song-font-size-unit" aria-hidden="true">px</span>
    <div class="song-font-size-buttons">
      <button
        type="button"
        :disabled="modelValue >= max"
        :aria-label="t('settings.appearance.songFontWeight.increaseSize', { field: label })"
        @click="step(1)"
      >
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
          <path d="M4 0 8 5H0Z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        :disabled="modelValue <= min"
        :aria-label="t('settings.appearance.songFontWeight.decreaseSize', { field: label })"
        @click="step(-1)"
      >
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
          <path d="m0 0 4 5 4-5Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.song-font-size-input {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  width: 148px;
  max-width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 80%, transparent);
  border-radius: 8px;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 5%, transparent);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 600;
}
.song-font-size-input:hover {
  border-color: color-mix(in srgb, var(--auralis-text) 25%, transparent);
}
.song-font-size-input:not(.is-pointer-focus):focus-within {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}
input {
  width: 0;
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  caret-color: var(--auralis-text);
}
.song-font-size-unit {
  margin-inline: 4px 12px;
  color: var(--auralis-text-muted);
}
.song-font-size-buttons {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  width: 20px;
}
button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 2px;
  color: var(--auralis-text-muted);
  background: transparent;
  cursor: pointer;
}
button:hover:not(:disabled) {
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}
button:active:not(:disabled) {
  background: var(--auralis-control-pressed-bg, var(--auralis-control-hover-bg));
}
button:disabled {
  color: var(--auralis-text-disabled);
  cursor: default;
}
.song-font-size-input:not(.is-pointer-focus) button:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 1px;
}
</style>
