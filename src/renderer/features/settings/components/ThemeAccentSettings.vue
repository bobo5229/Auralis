<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { SketchPicker, tinycolor } from 'vue-color'
import 'vue-color/style.css'
import { DARK_ACCENT_PRESETS } from '@renderer/features/appearance/constants/darkAccent'
import { useDarkAccent } from '@renderer/features/appearance/composables/useDarkAccent'
import { parseOpaquePickerAccent } from '@renderer/features/appearance/utils/parsePickerAccent'
import { useLightAccent } from '@renderer/features/appearance/composables/useLightAccent'
import { useTheme } from '@renderer/composables/useTheme'

const { t, locale } = useI18n()
const { theme } = useTheme()
const {
  darkAccent,
  resolution: darkResolution,
  persistFailed: darkPersistFailed,
  setDarkAccent,
  resetDarkAccent,
} = useDarkAccent()
const {
  lightAccent,
  resolution: lightResolution,
  persistFailed: lightPersistFailed,
  setLightAccent,
  resetLightAccent,
} = useLightAccent()
const isOpen = ref(false)
const pickerIssue = ref<'alpha' | 'invalid' | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const pickerHostRef = ref<HTMLElement | null>(null)
const focusInteraction = ref<'pointer' | 'keyboard'>('keyboard')
const activeAccent = computed(() =>
  theme.value === 'light' ? lightAccent.value : darkAccent.value,
)
const activeResolution = computed(() =>
  theme.value === 'light' ? lightResolution.value : darkResolution.value,
)
const activePersistFailed = computed(() =>
  theme.value === 'light' ? lightPersistFailed.value : darkPersistFailed.value,
)
const themeLabel = computed(() =>
  t(theme.value === 'light' ? 'settings.appearance.themeLight' : 'settings.appearance.themeDark'),
)
const pickerLabel = computed(() =>
  t('settings.appearance.accent.pickerLabel', { theme: themeLabel.value }),
)
useEventListener(
  document,
  'pointerdown',
  () => {
    focusInteraction.value = 'pointer'
  },
  { capture: true },
)
useEventListener(
  document,
  'keydown',
  (event) => {
    if (event.key === 'Tab') focusInteraction.value = 'keyboard'
  },
  { capture: true },
)
const pickerBinding = computed(() => {
  const boundTheme = theme.value
  return {
    color: tinycolor(activeAccent.value),
    onUpdate: (value: unknown) => {
      if (theme.value !== boundTheme) return
      const result = parseOpaquePickerAccent(value)
      if (!result.valid) {
        pickerIssue.value = result.reason
        return
      }
      pickerIssue.value = null
      setEditingAccent(result.color)
    },
  }
})
const presetColors = [...DARK_ACCENT_PRESETS]
const inputLabelKeys: Record<string, string> = {
  hex: 'hexField',
  'hex with transparency': 'hexField',
  red: 'redField',
  green: 'greenField',
  blue: 'blueField',
  hue: 'hueField',
  saturation: 'saturationField',
  lightness: 'lightnessField',
  brightness: 'brightnessField',
}
const previewStyle = computed(() => ({
  '--dark-accent-preview': activeResolution.value.display,
  '--dark-accent-on-preview': activeResolution.value.onAccent,
}))

function setEditingAccent(value: string): void {
  if (theme.value === 'light') setLightAccent(value)
  else setDarkAccent(value)
}

function resetEditingAccent(): void {
  pickerIssue.value = null
  if (theme.value === 'light') resetLightAccent()
  else resetDarkAccent()
}

function syncPickerAccessibility(): void {
  const host = pickerHostRef.value
  if (!host) return

  host
    .querySelector<HTMLElement>('[role="application"]')
    ?.setAttribute('aria-label', pickerLabel.value)
  host
    .querySelector<HTMLElement>('.vc-saturation-slider[role="application"]')
    ?.setAttribute('aria-label', t('settings.appearance.accent.saturationBrightnessSlider'))
  host
    .querySelector<HTMLElement>('.presets[role="listbox"]')
    ?.setAttribute('aria-label', t('settings.appearance.accent.presetListLabel'))

  host.querySelectorAll<HTMLElement>('.presets [role="option"]').forEach((option) => {
    const color = option.getAttribute('title')
    if (color) {
      option.setAttribute(
        'aria-label',
        `${t('settings.appearance.accent.presetColor')} ${color.toUpperCase()}`,
      )
    }
  })

  host.querySelectorAll<HTMLInputElement>('.vc-input-input').forEach((input) => {
    const originalLabel = input.getAttribute('aria-label')?.toLowerCase()
    const key =
      input.getAttribute('data-accent-label-key') ??
      (originalLabel ? inputLabelKeys[originalLabel] : undefined)
    if (key) {
      input.setAttribute('data-accent-label-key', key)
      input.setAttribute('aria-label', t(`settings.appearance.accent.${key}`))
    }
  })

  host.querySelectorAll<HTMLElement>('[role="slider"]').forEach((slider) => {
    const originalLabel = slider.getAttribute('aria-label')?.toLowerCase() ?? ''
    if (originalLabel.includes('saturation') && originalLabel.includes('brightness')) {
      slider.setAttribute('aria-label', t('settings.appearance.accent.saturationBrightnessSlider'))
      const valueText = slider.getAttribute('aria-valuetext')
      const valueMatch = /saturation:\s*(\d+(?:\.\d+)?)%,\s*brightness:\s*(\d+(?:\.\d+)?)%/iu.exec(
        valueText ?? '',
      )
      if (valueMatch) {
        slider.setAttribute(
          'aria-valuetext',
          t('settings.appearance.accent.saturationBrightnessValue', {
            saturation: valueMatch[1],
            brightness: valueMatch[2],
          }),
        )
      }
      return
    }

    const key = slider.getAttribute('data-accent-label-key') ?? inputLabelKeys[originalLabel]
    if (key) {
      slider.setAttribute('data-accent-label-key', key)
      slider.setAttribute('aria-label', t(`settings.appearance.accent.${key}`))
    }
  })

  syncCurrentColorAccessibility(host)
}

function syncCurrentColorAccessibility(host = pickerHostRef.value): void {
  if (!host) return

  const saturationSlider = host.querySelector<HTMLElement>('.vc-saturation-slider [role="slider"]')
  if (saturationSlider) {
    saturationSlider.setAttribute(
      'aria-label',
      t('settings.appearance.accent.saturationBrightnessSlider'),
    )
    const hsv = tinycolor(activeAccent.value).toHsv()
    saturationSlider.setAttribute('aria-valuenow', hsv.s.toFixed(2))
    saturationSlider.setAttribute(
      'aria-valuetext',
      t('settings.appearance.accent.saturationBrightnessValue', {
        saturation: Math.round(hsv.s * 100),
        brightness: Math.round(hsv.v * 100),
      }),
    )
  }

  host.querySelectorAll<HTMLElement>('.presets [role="option"]').forEach((option) => {
    const selected =
      option.getAttribute('title')?.toUpperCase() === activeAccent.value.toUpperCase()
    option.setAttribute('aria-selected', String(selected))
  })

  const currentColor = host.querySelector<HTMLElement>('.active-color')
  if (currentColor) {
    currentColor.setAttribute(
      'aria-label',
      t('settings.appearance.accent.currentColor', {
        color: tinycolor(activeAccent.value).toRgbString(),
      }),
    )
  }
}

function openPicker(): void {
  isOpen.value = true
  pickerIssue.value = null
}

async function closePicker(restoreFocus = false): Promise<void> {
  isOpen.value = false
  pickerIssue.value = null
  if (restoreFocus) {
    await nextTick()
    triggerRef.value?.focus()
  }
}

function togglePicker(): void {
  if (isOpen.value) void closePicker()
  else openPicker()
}

function onPickerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    void closePicker(true)
    return
  }

  const preset = (event.target as HTMLElement).closest<HTMLElement>('.preset-color[role="option"]')
  if (event.key === ' ' && preset) {
    event.preventDefault()
    event.stopPropagation()
  }
  if (event.key === 'Enter' && preset) {
    event.preventDefault()
    event.stopPropagation()
    preset.click()
  }
}

function clearPickerIssueOnInput(event: Event): void {
  if ((event.target as HTMLElement).closest('.vc-input-input')) pickerIssue.value = null
}

watch(isOpen, async (open) => {
  if (!open) return
  await nextTick()
  syncPickerAccessibility()
})
watch(locale, async () => {
  if (!isOpen.value) return
  await nextTick()
  syncPickerAccessibility()
})
watch(theme, async () => {
  pickerIssue.value = null
  if (!isOpen.value) return
  await nextTick()
  syncPickerAccessibility()
})
watch(activeAccent, async () => {
  if (!isOpen.value) return
  await nextTick()
  syncCurrentColorAccessibility()
})
</script>

<template>
  <div class="dark-accent-settings">
    <div class="settings-row settings-row--with-desc dark-accent-settings-row">
      <div>
        <strong id="theme-accent-label">{{ t('settings.appearance.accent.title') }}</strong>
      </div>
      <div class="dark-accent-setting-value">
        <span
          class="dark-accent-user-swatch"
          :style="{ backgroundColor: activeAccent }"
          aria-hidden="true"
        ></span>
        <code>{{ activeAccent }}</code>
        <button
          ref="triggerRef"
          type="button"
          class="dark-accent-toggle"
          aria-labelledby="theme-accent-label"
          aria-controls="dark-accent-picker-panel"
          :aria-expanded="isOpen"
          :aria-label="
            isOpen ? t('settings.appearance.accent.close') : t('settings.appearance.accent.change')
          "
          @click="togglePicker"
        >
          <span
            class="dark-accent-toggle-chevron"
            :class="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>

    <Transition name="dark-accent-expand">
      <div
        v-if="isOpen"
        id="dark-accent-picker-panel"
        class="dark-accent-picker-panel"
        @keydown="onPickerKeydown"
        @input.capture="clearPickerIssueOnInput"
      >
        <div class="dark-accent-picker-content">
          <div class="dark-accent-preview-card" :style="previewStyle">
            <div class="dark-accent-preview-row">
              <div class="dark-accent-preview-header">
                <span class="dark-accent-preview-label">
                  {{ t('settings.appearance.accent.preview') }}
                </span>
                <button type="button" class="dark-accent-reset" @click="resetEditingAccent">
                  {{ t('settings.appearance.accent.restoreDefault') }}
                </button>
              </div>
              <div class="dark-accent-preview-controls">
                <span class="dark-accent-preview-icon i-lucide-music" aria-hidden="true"></span>
                <span
                  class="settings-switch is-enabled dark-accent-preview-switch"
                  aria-hidden="true"
                >
                  <span class="settings-switch-thumb"></span>
                </span>
                <span class="dark-accent-preview-sample">
                  {{ t('settings.appearance.accent.previewSample') }}
                </span>
              </div>
              <div class="dark-accent-preview-progress" aria-hidden="true"><span></span></div>
            </div>
          </div>

          <p v-if="pickerIssue === 'alpha'" class="dark-accent-message" role="status">
            {{ t('settings.appearance.accent.alphaRejected') }}
          </p>
          <p v-else-if="pickerIssue === 'invalid'" class="dark-accent-message" role="status">
            {{ t('settings.appearance.accent.invalidColor') }}
          </p>
          <p v-if="activePersistFailed" class="dark-accent-message" role="status">
            {{ t('settings.appearance.accent.persistFailed') }}
          </p>

          <div
            ref="pickerHostRef"
            class="dark-accent-picker-host"
            :data-focus-interaction="focusInteraction"
            role="group"
            :aria-label="pickerLabel"
          >
            <SketchPicker
              :key="theme"
              :tiny-color="pickerBinding.color"
              :disable-alpha="true"
              :preset-colors="presetColors"
              @update:tiny-color="pickerBinding.onUpdate"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dark-accent-settings {
  container: accent-settings / inline-size;
  font-family: var(--auralis-font-ui);
}

.dark-accent-settings-row {
  align-items: center;
}

.dark-accent-settings-row > .dark-accent-setting-value {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 9px;
}

.dark-accent-user-swatch {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 1px solid var(--auralis-border-strong);
  border-radius: 6px;
}

.dark-accent-setting-value code {
  color: var(--auralis-text-muted);
  font-family: var(--auralis-font-color-value);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dark-accent-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  color: var(--auralis-text-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: color 150ms ease;
}

.dark-accent-toggle:hover {
  color: var(--auralis-text);
  background: transparent;
  box-shadow: none;
}

.dark-accent-toggle:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

.dark-accent-toggle-chevron {
  width: 16px;
  height: 16px;
  color: currentColor;
  flex-shrink: 0;
}

.dark-accent-picker-panel {
  interpolate-size: allow-keywords;
}

.dark-accent-picker-content {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 12px 24px;
  padding: 16px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.dark-accent-preview-card {
  position: relative;
  z-index: 1;
  grid-column: 2;
  grid-row: 4;
  align-self: stretch;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 13px;
  background: var(--auralis-surface-raised);
}

.dark-accent-preview-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dark-accent-preview-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}

.dark-accent-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dark-accent-preview-icon {
  width: 18px;
  height: 18px;
  color: var(--dark-accent-preview);
}

.dark-accent-preview-card .dark-accent-preview-controls > .dark-accent-preview-switch {
  background: var(--dark-accent-preview);
  border-color: var(--dark-accent-preview);
  pointer-events: none;
}

.dark-accent-preview-progress {
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: var(--auralis-progress-track);
  overflow: hidden;
  margin-top: 2px;
}

.dark-accent-preview-progress > span {
  display: block;
  width: 60%;
  height: 100%;
  background: var(--dark-accent-preview);
}

.dark-accent-preview-label {
  align-self: flex-start;
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.dark-accent-message {
  color: var(--auralis-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.dark-accent-preview-sample {
  display: inline-flex;
  min-width: 76px;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--dark-accent-on-preview);
  background: var(--dark-accent-preview);
  font-size: 12px;
  font-weight: 600;
}

.dark-accent-message {
  grid-column: 1 / -1;
  margin: 0;
}

.dark-accent-message {
  color: var(--auralis-danger);
}

.dark-accent-picker-host {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 1 / span 4;
  grid-template-columns: subgrid;
  grid-template-rows: subgrid;
  width: 100%;
  min-width: 0;
  --vc-body-bg: transparent;
  --vc-picker-bg: var(--auralis-surface-floating);
  --vc-input-bg: var(--auralis-main-bg);
  --vc-input-text: var(--auralis-text);
  --vc-input-label: var(--auralis-text-muted);
  --vc-input-border: var(--auralis-border-strong);
  --vc-sketch-input-label: var(--auralis-text-muted);
  --vc-sketch-presets-border: var(--auralis-border-strong);
}

.dark-accent-picker-host :deep(.vc-sketch-picker) {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  grid-template-columns: subgrid;
  grid-template-rows: subgrid;
  align-items: start;
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  font-family: var(--auralis-font-ui);
}

.dark-accent-picker-host :deep(.saturation) {
  grid-column: 1;
  grid-row: 1 / span 4;
  padding-bottom: 0;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
}

.dark-accent-picker-host :deep(.controls) {
  grid-column: 2;
  grid-row: 1;
}

.dark-accent-picker-host :deep(.preset-color) {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  margin: 0;
}

.dark-accent-picker-host :deep(.presets) {
  grid-column: 2;
  grid-row: 3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 12px;
  margin: 0;
  padding-left: 0;
}

.dark-accent-picker-host :deep(.preset-color[aria-selected='true']) {
  outline: 2px solid var(--auralis-text);
  outline-offset: 3px;
}

.dark-accent-picker-host :deep(.vc-saturation-slider) {
  border-radius: 8px;
  overflow: hidden;
}

.dark-accent-picker-host :deep(.field) {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.dark-accent-picker-host :deep(.field_single),
.dark-accent-picker-host :deep(.field_double) {
  min-width: 0;
  padding-left: 0;
}

.dark-accent-picker-host :deep(.vc-editable-input) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.dark-accent-picker-host :deep(.vc-input-input) {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 6px;
  border-radius: 6px;
  font-family: var(--auralis-font-color-value);
  font-variant-numeric: tabular-nums;
}

.dark-accent-picker-host :deep(.vc-input-label) {
  grid-column: 1;
  grid-row: 1;
  padding: 0;
  font-family: var(--auralis-font-ui);
  text-align: left;
}

.dark-accent-picker-host :deep(.vc-input-input:focus) {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--auralis-focus-ring);
}

.dark-accent-picker-host :deep([role='application']:focus-visible),
.dark-accent-picker-host :deep(.preset-color:focus-visible),
.dark-accent-picker-host :deep(.picker-wrap:focus-visible),
.dark-accent-picker-host[data-focus-interaction='keyboard'] :deep(.vc-input-input:focus-visible) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.dark-accent-reset {
  border: 0;
  border-radius: 6px;
  padding: 0;
  color: var(--auralis-danger);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: color 150ms ease;
}

.dark-accent-reset:hover {
  color: var(--auralis-danger);
  text-decoration: underline;
}

.dark-accent-reset:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.dark-accent-expand-enter-active,
.dark-accent-expand-leave-active {
  overflow: hidden;
  transition:
    height 280ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease;
  height: auto;
}

.dark-accent-expand-enter-from,
.dark-accent-expand-leave-to {
  height: 0;
  opacity: 0;
}

@container accent-settings (max-width: 620px) {
  .dark-accent-picker-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .dark-accent-preview-card {
    grid-column: 1;
    grid-row: auto;
  }

  .dark-accent-picker-host {
    display: block;
    grid-row: auto;
    max-width: 300px;
  }

  .dark-accent-picker-host :deep(.vc-sketch-picker) {
    display: block;
  }

  .dark-accent-picker-host :deep(.saturation) {
    aspect-ratio: auto;
    padding-bottom: 75%;
  }

  .dark-accent-picker-host :deep(.presets) {
    margin-top: 12px;
  }
}

:where([data-reduced-motion='true']) .dark-accent-expand-enter-active,
:where([data-reduced-motion='true']) .dark-accent-expand-leave-active {
  transition: opacity 120ms ease;
}

@container accent-settings (max-width: 360px) {
  .dark-accent-settings-row {
    align-items: flex-start;
  }

  .dark-accent-settings-row > .dark-accent-setting-value {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .dark-accent-picker-content {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
