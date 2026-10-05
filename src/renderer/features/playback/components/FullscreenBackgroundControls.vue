<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFullscreenBackground } from '../composables/useFullscreenBackground'
import { LIQUID_METAL_RANGES, type LiquidMetalSettings } from '../runtime/liquidMetalSettings'
import '@renderer/features/settings/styles/settings.chrome.css'

const { t } = useI18n()
const {
  backgroundMode,
  backgroundMotionPaused,
  metalSettings,
  setBackgroundMode,
  setBackgroundMotionPaused,
  setMetalSettings,
  resetMetalSettings,
} = useFullscreenBackground()
const rootRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const controls = [
  { key: 'speed', label: 'fullscreen.background.speed' },
  { key: 'folds', label: 'fullscreen.background.folds' },
  { key: 'roughness', label: 'fullscreen.background.roughness' },
] as const

function close(): boolean {
  if (!open.value) return false
  open.value = false
  void nextTick(() => buttonRef.value?.focus({ preventScroll: true }))
  return true
}

function dismissOutside(event: PointerEvent): void {
  if (event.target instanceof Node && !rootRef.value?.contains(event.target)) open.value = false
}

function updateParameter(key: keyof LiquidMetalSettings, event: Event): void {
  setMetalSettings({ [key]: Number((event.target as HTMLInputElement).value) })
}

function parameterFill(key: keyof LiquidMetalSettings): string {
  const { min, max } = LIQUID_METAL_RANGES[key]
  return `${((metalSettings.value[key] - min) / (max - min)) * 100}%`
}

onMounted(() => document.addEventListener('pointerdown', dismissOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissOutside, true))
defineExpose({ close })
</script>

<template>
  <div ref="rootRef" class="fullscreen-background-controls">
    <button
      ref="buttonRef"
      class="background-controls-toggle"
      type="button"
      :aria-label="t('fullscreen.background.controls')"
      :title="t('fullscreen.background.controls')"
      :aria-expanded="open"
      aria-controls="fullscreen-background-panel"
      @click="open = !open"
    >
      <span class="i-lucide-sliders-horizontal h-5 w-5" aria-hidden="true" />
    </button>
    <section
      v-if="open"
      id="fullscreen-background-panel"
      class="background-controls-panel settings-controls"
      :aria-label="t('fullscreen.background.controls')"
    >
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('fullscreen.background.controls') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row">
          <div>
            <strong>{{ t('fullscreen.background.mode') }}</strong>
          </div>
          <div
            class="settings-segmented-control"
            role="group"
            :aria-label="t('fullscreen.background.mode')"
          >
            <button
              type="button"
              class="settings-segmented-option"
              :class="{ 'is-selected': backgroundMode === 'metal' }"
              data-background-mode="metal"
              :aria-pressed="backgroundMode === 'metal'"
              @click="setBackgroundMode('metal')"
            >
              {{ t('fullscreen.background.metal') }}
            </button>
            <button
              type="button"
              class="settings-segmented-option"
              :class="{ 'is-selected': backgroundMode === 'fluid' }"
              data-background-mode="fluid"
              :aria-pressed="backgroundMode === 'fluid'"
              @click="setBackgroundMode('fluid')"
            >
              {{ t('fullscreen.background.fluid') }}
            </button>
          </div>
        </div>
        <template v-if="backgroundMode === 'metal'">
          <div v-for="control in controls" :key="control.key" class="settings-row">
            <div>
              <strong :id="`background-${control.key}-label`">{{ t(control.label) }}</strong>
            </div>
            <div class="settings-range-control">
              <input
                :id="`background-${control.key}-input`"
                type="range"
                :data-metal-parameter="control.key"
                :aria-labelledby="`background-${control.key}-label`"
                :min="LIQUID_METAL_RANGES[control.key].min"
                :max="LIQUID_METAL_RANGES[control.key].max"
                :step="LIQUID_METAL_RANGES[control.key].step"
                :value="metalSettings[control.key]"
                :style="{ '--settings-range-progress': parameterFill(control.key) }"
                @input="updateParameter(control.key, $event)"
              />
              <output :for="`background-${control.key}-input`">{{
                metalSettings[control.key].toFixed(2)
              }}</output>
            </div>
          </div>
        </template>
        <div class="settings-row">
          <div>
            <strong>{{ t('fullscreen.background.pause') }}</strong>
          </div>
          <button
            type="button"
            class="settings-switch"
            :class="{ 'is-enabled': backgroundMotionPaused }"
            data-background-pause
            role="switch"
            :aria-label="t('fullscreen.background.pause')"
            :aria-checked="backgroundMotionPaused"
            @click="setBackgroundMotionPaused(!backgroundMotionPaused)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div v-if="backgroundMode === 'metal'" class="background-controls-actions">
        <button type="button" class="settings-text-button" @click="resetMetalSettings">
          {{ t('fullscreen.background.reset') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fullscreen-background-controls {
  position: fixed;
  top: 12px;
  right: 76px;
  z-index: 102;
  -webkit-app-region: no-drag;
}
.background-controls-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border-radius: 8px;
  color: var(--auralis-text-muted);
}
.background-controls-toggle:hover {
  color: var(--auralis-text);
}
.background-controls-panel {
  --auralis-text: var(--auralis-fullscreen-controls-text);
  --auralis-text-muted: var(--auralis-fullscreen-controls-muted);
  position: absolute;
  top: 52px;
  right: 0;
  width: min(340px, calc(100vw - 104px));
  max-height: calc(100vh - 84px);
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--auralis-fullscreen-controls-border);
  border-radius: 13px;
  background: var(--auralis-fullscreen-controls-bg);
  color: var(--auralis-text);
  font-family: var(--auralis-font-ui);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.background-controls-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.background-controls-panel :is(button, input):focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
  box-shadow: none;
}
.background-controls-panel input[type='range']:focus-visible {
  outline-offset: 4px;
}
</style>
