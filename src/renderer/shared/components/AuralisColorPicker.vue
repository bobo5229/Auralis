<script setup lang="ts">
import { computed } from 'vue'
import { SketchPicker, tinycolor } from 'vue-color'
import 'vue-color/style.css'
import {
  parseOpaquePickerColor,
  pickerColorChange,
  type PickerColorChange,
} from '@renderer/shared/color/pickerColor'

const props = defineProps<{ color: string; presetColors: string[] }>()
const emit = defineEmits<{
  change: [value: PickerColorChange]
  invalid: [reason: 'invalid' | 'alpha']
}>()
const pickerColor = computed(() => tinycolor(props.color))
function update(value: unknown): void {
  const result = parseOpaquePickerColor(value)
  if (!result.valid) return emit('invalid', result.reason)
  emit('change', pickerColorChange(value, result.color))
}
</script>

<template>
  <SketchPicker
    :tiny-color="pickerColor"
    :preset-colors="presetColors"
    :disable-alpha="true"
    @update:tiny-color="update"
  />
</template>
