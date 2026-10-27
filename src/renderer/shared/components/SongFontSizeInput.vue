<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: number
    min: number
    max: number
    step?: number
    kind?: 'size' | 'weight' | 'spacing' | 'percent'
    disabled?: boolean
  }>(),
  { step: 1, kind: 'size', disabled: false },
)
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
  if (value >= props.min && value <= props.max && (value - props.min) % props.step === 0)
    emit('update:modelValue', value)
}

function restore() {
  draft.value = String(props.modelValue)
}
function adjust(delta: number) {
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
    <button
      type="button"
      :disabled="disabled || modelValue <= min"
      :aria-label="
        t(
          `settings.appearance.songFontWeight.${kind === 'size' ? 'decreaseSize' : kind === 'weight' ? 'decreaseWeight' : 'decreaseSpacing'}`,
          { field: label },
        )
      "
      @click="adjust(-step)"
    >
      <span class="i-lucide-minus" aria-hidden="true" />
    </button>
    <div class="song-font-size-value">
      <input
        :id="id"
        type="text"
        inputmode="numeric"
        role="spinbutton"
        :aria-label="
          kind === 'spacing' || kind === 'percent'
            ? label
            : `${label} ${t(`settings.appearance.songFontWeight.${kind === 'size' ? 'sizeLabel' : 'weightSection'}`)}`
        "
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="modelValue"
        :aria-valuetext="
          kind === 'weight'
            ? String(modelValue)
            : kind === 'percent'
              ? `${modelValue}%`
              : `${modelValue} px`
        "
        :disabled="disabled"
        :value="draft"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @blur="restore"
        @keydown.up.prevent="adjust(step)"
        @keydown.down.prevent="adjust(-step)"
        @keydown.enter.prevent="restore"
        @keydown.esc.prevent.stop="restore"
      />
      <span v-if="kind !== 'weight'" class="song-font-size-unit" aria-hidden="true">{{
        kind === 'percent' ? '%' : 'px'
      }}</span>
    </div>
    <button
      type="button"
      :disabled="disabled || modelValue >= max"
      :aria-label="
        t(
          `settings.appearance.songFontWeight.${kind === 'size' ? 'increaseSize' : kind === 'weight' ? 'increaseWeight' : 'increaseSpacing'}`,
          { field: label },
        )
      "
      @click="adjust(step)"
    >
      <span class="i-lucide-plus" aria-hidden="true" />
    </button>
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
.song-font-size-value {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
}
input {
  width: 3ch;
  flex: 0 1 3ch;
  min-width: 0;
  border: 0;
  padding: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
  caret-color: var(--auralis-text);
}
.song-font-size-unit {
  margin-inline-start: 2px;
  color: var(--auralis-text-muted);
}
button {
  display: flex;
  flex: 0 0 20px;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 2px;
  color: var(--auralis-text-muted);
  background: transparent;
  cursor: pointer;
}
button > span {
  width: 12px;
  height: 12px;
}
button:hover:not(:disabled) {
  color: var(--auralis-text);
  background: transparent;
  box-shadow: none;
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
