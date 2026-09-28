<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SONG_FONT_WEIGHT_OPTIONS,
  type SongFontWeightChoice,
} from '@renderer/features/appearance/constants/songFontWeights'

const props = defineProps<{
  id: string
  labelledby: string
  modelValue: SongFontWeightChoice
  defaultWeight: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: SongFontWeightChoice] }>()
const { t } = useI18n()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)
const open = ref(false)
const pointerFocus = ref(false)
const activeIndex = ref(0)
const position = ref({ left: '0px', top: '0px', width: '148px', maxHeight: '240px' })
const options = computed(() => [
  {
    value: 'default' as const,
    label: t('settings.appearance.songFontWeight.options.default', { weight: props.defaultWeight }),
  },
  ...SONG_FONT_WEIGHT_OPTIONS.map((value) => ({
    value,
    label: t(`settings.appearance.songFontWeight.options.${value}`),
  })),
])
const selectedIndex = computed(() =>
  options.value.findIndex((item) => item.value === props.modelValue),
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
  if (!trigger.value) return
  activeIndex.value = Math.max(0, selectedIndex.value)
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(Math.max(148, rect.width), window.innerWidth - 16)
  position.value = {
    left: `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`,
    top: `${rect.bottom + 6}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, window.innerHeight - 16)}px`,
  }
  open.value = true
  await nextTick()
  if (!open.value || !menu.value) return
  const height = menu.value.getBoundingClientRect().height
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
  const option = options.value[index]
  if (!option) return
  emit('update:modelValue', option.value)
  close()
  trigger.value?.focus({ preventScroll: true })
}

function onPointerDown(): void {
  pointerFocus.value = true
  trigger.value?.classList.add('is-pointer-focus')
}

function onKeydown(event: KeyboardEvent): void {
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
      if (event.key === 'Home') activeIndex.value = 0
      if (event.key === 'End') activeIndex.value = options.value.length - 1
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      select(activeIndex.value)
      return
    }
    if (event.key === 'Home') activeIndex.value = 0
    else if (event.key === 'End') activeIndex.value = options.value.length - 1
    else
      activeIndex.value = Math.max(
        0,
        Math.min(
          options.value.length - 1,
          activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1),
        ),
      )
    void revealActive()
  }
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
</script>

<template>
  <button
    :id="id"
    ref="trigger"
    type="button"
    role="combobox"
    class="song-font-weight-select"
    :class="{ 'is-pointer-focus': pointerFocus }"
    :aria-labelledby="`${labelledby} ${id}-value`"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? `${id}-menu` : undefined"
    :aria-activedescendant="open ? `${id}-option-${activeIndex}` : undefined"
    @pointerdown="onPointerDown"
    @blur="onBlur"
    @click="open ? close() : show()"
    @keydown="onKeydown"
  >
    <span :id="`${id}-value`">{{ options[selectedIndex]?.label }}</span>
    <span class="i-lucide-chevron-down h-3.5 w-3.5" aria-hidden="true"></span>
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="`${id}-menu`"
      ref="menu"
      class="settings-overlay song-font-weight-menu"
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
        class="song-font-weight-option"
        :class="{ 'is-active': activeIndex === index }"
        :data-index="index"
        :aria-selected="modelValue === option.value"
        @pointermove="activeIndex = index"
        @click="select(index)"
      >
        <span>{{ option.label }}</span>
        <span
          v-if="modelValue === option.value"
          class="i-lucide-check h-3.5 w-3.5"
          aria-hidden="true"
        ></span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.song-font-weight-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-sizing: border-box;
  min-width: 148px;
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
.song-font-weight-select:hover {
  border-color: color-mix(in srgb, var(--auralis-text) 25%, transparent);
}
.song-font-weight-select:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}
.song-font-weight-select.is-pointer-focus:focus {
  outline: none;
}
.song-font-weight-menu {
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
.song-font-weight-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
}
.song-font-weight-option[aria-selected='true'] {
  color: var(--auralis-sidebar-active-indicator);
  font-weight: 600;
}
.song-font-weight-option.is-active {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 14%, transparent);
}
</style>
