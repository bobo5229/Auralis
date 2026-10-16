<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface SettingsSelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = defineProps<{
  id: string
  labelledby: string
  describedby?: string
  modelValue: string
  options: readonly SettingsSelectOption[]
  disabled?: boolean
  teleportTo?: string | HTMLElement
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)
const open = ref(false)
const pointerFocus = ref(false)
const activeIndex = ref(0)
const position = ref({
  left: '0px',
  top: '0px',
  width: '0px',
  maxHeight: '240px',
})
const selectedIndex = computed(() =>
  props.options.findIndex((item) => item.value === props.modelValue),
)
let disclosure: HTMLDetailsElement | null = null

function close(): void {
  open.value = false
}

function onBlur(): void {
  close()
  pointerFocus.value = false
}

async function show(): Promise<void> {
  if (!trigger.value || props.disabled) return
  activeIndex.value =
    selectedIndex.value >= 0 && !props.options[selectedIndex.value].disabled
      ? selectedIndex.value
      : firstEnabled()
  if (activeIndex.value < 0) return
  const rect = trigger.value.getBoundingClientRect()
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
    top: `${rect.bottom + 6}px`,
    width: `${rect.width}px`,
    maxHeight: `${Math.max(0, window.innerHeight - 16)}px`,
  }
  open.value = true
  await nextTick()
  if (!open.value || !menu.value) return
  const { height } = menu.value.getBoundingClientRect()
  const below = Math.max(0, window.innerHeight - rect.bottom - 14)
  const above = Math.max(0, rect.top - 14)
  const upwards = height > below && above > below
  const available = upwards ? above : below
  position.value = {
    ...position.value,
    top: `${upwards ? rect.top - 6 - Math.min(height, available) : rect.bottom + 6}px`,
    maxHeight: `${available}px`,
  }
  await revealActive()
}

async function revealActive(): Promise<void> {
  await nextTick()
  menu.value
    ?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function select(index: number): void {
  const option = props.options[index]
  if (!option || option.disabled || props.disabled) return
  emit('update:modelValue', option.value)
  close()
  trigger.value?.focus({ preventScroll: true })
}

function onPointerDown(): void {
  pointerFocus.value = true
  trigger.value?.classList.add('is-pointer-focus')
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  pointerFocus.value = false
  trigger.value?.classList.remove('is-pointer-focus')
  if (event.key === 'Tab') {
    close()
    return
  }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!open.value) {
      void show()
      if (event.key === 'Home') activeIndex.value = firstEnabled()
      if (event.key === 'End') activeIndex.value = lastEnabled()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      select(activeIndex.value)
      return
    }
    if (event.key === 'Home') activeIndex.value = firstEnabled()
    else if (event.key === 'End') activeIndex.value = lastEnabled()
    else {
      const step = event.key === 'ArrowDown' ? 1 : -1
      for (
        let index = activeIndex.value + step;
        index >= 0 && index < props.options.length;
        index += step
      ) {
        if (!props.options[index].disabled) {
          activeIndex.value = index
          break
        }
      }
    }
    void revealActive()
  }
}

function firstEnabled(): number {
  return props.options.findIndex((option) => !option.disabled)
}

function lastEnabled(): number {
  return props.options.findLastIndex((option) => !option.disabled)
}

function onOutsidePointer(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return
  if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) close()
}

function onScroll(event: Event): void {
  if (event.target instanceof Node && menu.value?.contains(event.target)) return
  close()
}

function onDisclosureToggle(): void {
  if (!disclosure?.open) close()
}

function removeListeners(): void {
  document.removeEventListener('pointerdown', onOutsidePointer, true)
  document.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
  disclosure?.removeEventListener('toggle', onDisclosureToggle)
  disclosure = null
}

watch(
  open,
  (value) => {
    removeListeners()
    if (!value) return
    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    disclosure = trigger.value?.closest('details') ?? null
    disclosure?.addEventListener('toggle', onDisclosureToggle)
  },
  { flush: 'sync' },
)
onBeforeUnmount(removeListeners)
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close()
  },
)
</script>

<template>
  <button
    :id="id"
    ref="trigger"
    type="button"
    role="combobox"
    class="settings-select"
    :disabled="disabled"
    :class="{ 'is-pointer-focus': pointerFocus }"
    :aria-labelledby="`${labelledby} ${id}-value`"
    :aria-describedby="describedby"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? `${id}-menu` : undefined"
    :aria-activedescendant="open ? `${id}-option-${activeIndex}` : undefined"
    @pointerdown="onPointerDown"
    @blur="onBlur"
    @click="open ? close() : show()"
    @keydown="onKeydown"
  >
    <span
      :id="`${id}-value`"
      class="settings-select-value"
      :title="options[selectedIndex]?.label"
      >{{ options[selectedIndex]?.label }}</span
    >
    <span
      class="settings-select-chevron i-lucide-chevron-down h-3.5 w-3.5"
      aria-hidden="true"
    ></span>
  </button>
  <Teleport :to="teleportTo ?? 'body'">
    <div
      v-if="open"
      :id="`${id}-menu`"
      ref="menu"
      class="settings-overlay settings-select-menu"
      role="listbox"
      :aria-labelledby="labelledby"
      :style="position"
      @pointerdown.prevent="onPointerDown"
    >
      <div
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.value"
        role="option"
        class="settings-select-option"
        :class="{ 'is-active': activeIndex === index }"
        :data-index="index"
        :aria-selected="modelValue === option.value"
        :aria-disabled="option.disabled || undefined"
        @pointermove="!option.disabled && (activeIndex = index)"
        @click="select(index)"
      >
        <span :title="option.label">{{ option.label }}</span>
        <span
          class="settings-select-check i-lucide-check h-3.5 w-3.5"
          :class="{ 'is-hidden': modelValue !== option.value }"
          aria-hidden="true"
        ></span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-select {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  box-sizing: border-box;
  flex: 0 0 auto;
  width: max-content;
  min-width: 0;
  max-width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 80%, transparent);
  border-radius: 8px;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 5%, transparent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.settings-select:hover {
  border-color: color-mix(in srgb, var(--auralis-text) 25%, transparent);
}
.settings-select-value,
.settings-select-option > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-select-chevron {
  flex-shrink: 0;
}
.settings-select:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}
.settings-select.is-pointer-focus:focus {
  outline: none;
}
.settings-select:disabled {
  opacity: 0.45;
  cursor: default;
}
.settings-select-menu {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 10px;
  color: var(--auralis-text);
  background: var(--auralis-context-menu-bg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 22%);
  font-size: 12px;
  font-weight: 500;
}
.settings-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 0 6px;
  border-radius: 6px;
  cursor: pointer;
}
.settings-select-option[aria-selected='true'] {
  color: var(--auralis-sidebar-active-indicator);
  font-weight: 600;
}
.settings-select-check {
  flex-shrink: 0;
}
.settings-select-check.is-hidden {
  visibility: hidden;
}
.settings-select-option.is-active {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 14%, transparent);
}
.settings-select-option[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
