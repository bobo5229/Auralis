<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  id: string
  labelledby?: string
  label?: string
  describedby?: string
  modelValue: string
  options: readonly { value: string; label: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const buttons = ref<Record<string, HTMLButtonElement | null>>({})

function select(value: string): void {
  emit('update:modelValue', value)
  buttons.value[value]?.focus()
}

function onKeydown(event: KeyboardEvent, index: number): void {
  let next: number
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index - 1 + props.options.length) % props.options.length
      break
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % props.options.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = props.options.length - 1
      break
    default:
      return
  }
  const option = props.options[next]
  if (!option) return
  event.preventDefault()
  select(option.value)
}
</script>

<template>
  <div
    :id="id"
    class="settings-segmented-control"
    role="radiogroup"
    :aria-labelledby="labelledby"
    :aria-label="label"
    :aria-describedby="describedby"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      :ref="(element) => (buttons[option.value] = element as HTMLButtonElement | null)"
      type="button"
      class="settings-segmented-option"
      role="radio"
      :aria-checked="modelValue === option.value"
      :tabindex="modelValue === option.value ? 0 : -1"
      :class="{ 'is-selected': modelValue === option.value }"
      @click="select(option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.settings-segmented-control {
  display: inline-flex;
  flex-wrap: wrap;
  max-width: 100%;
}
</style>
