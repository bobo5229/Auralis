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
const closeButtonRef = ref<HTMLButtonElement | null>(null)
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

async function toggle(): Promise<void> {
  if (close()) return
  open.value = true
  await nextTick()
  closeButtonRef.value?.focus({ preventScroll: true })
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
      :aria-label="t('fullscreen.settings')"
      :title="t('fullscreen.settings')"
      :aria-expanded="open"
      aria-controls="fullscreen-background-panel"
      @click="toggle"
    >
      <span class="i-lucide-sliders-horizontal h-5 w-5" aria-hidden="true" />
    </button>
    <Transition name="background-sidebar">
      <section
        v-if="open"
        id="fullscreen-background-panel"
        class="background-controls-panel settings-controls"
        :aria-label="t('fullscreen.settings')"
        @keydown.esc.stop.prevent="close"
      >
        <header class="background-controls-header">
          <h2>{{ t('fullscreen.settings') }}</h2>
          <button
            ref="closeButtonRef"
            class="background-controls-close"
            type="button"
            :aria-label="t('fullscreen.closeSettings')"
            :title="t('fullscreen.closeSettings')"
            @click="close"
          >
            <span class="i-lucide-x h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div class="background-controls-content">
          <div class="settings-group-header">
            <h3 class="settings-group-title">{{ t('fullscreen.background.section') }}</h3>
            <button
              v-if="backgroundMode === 'metal'"
              type="button"
              class="settings-text-button background-controls-reset"
              @click="resetMetalSettings"
            >
              {{ t('fullscreen.background.reset') }}
            </button>
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
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.fullscreen-background-controls {
  position: fixed;
  top: 12px;
  right: 76px;
  z-index: 103;
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
  --background-panel-gap: 16px;
  --auralis-text: var(--auralis-fullscreen-controls-text);
  --auralis-text-muted: var(--auralis-fullscreen-controls-muted);
  --auralis-text-subtle: var(--auralis-fullscreen-controls-muted);
  position: fixed;
  top: var(--background-panel-gap);
  right: var(--background-panel-gap);
  bottom: var(--background-panel-gap);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 2 * var(--background-panel-gap)));
  overflow: hidden;
  border: 1px solid var(--auralis-fullscreen-controls-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-fullscreen-controls-bg) 78%, transparent);
  backdrop-filter: blur(28px) saturate(135%);
  box-shadow: -12px 0 40px rgb(0 0 0 / 12%);
  color: var(--auralis-text);
  font-family: var(--auralis-font-ui);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.background-controls-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--auralis-fullscreen-controls-border);
}
.background-controls-header h2 {
  margin: 0;
  font-size: var(--auralis-type-section-size);
  line-height: var(--auralis-type-section-line-height);
  font-weight: 600;
}
.background-controls-close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  background: transparent;
  cursor: pointer;
}
.background-controls-close:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
}
.background-controls-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-text-muted) transparent;
}
.background-controls-panel .settings-row {
  padding: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.background-controls-panel .settings-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 30px;
  margin-bottom: 12px;
}
.background-controls-panel .settings-group-card {
  border-color: var(--auralis-fullscreen-controls-border);
  background: color-mix(in srgb, var(--auralis-fullscreen-controls-bg) 32%, transparent);
}
.background-controls-panel
  :is(
    .settings-group-title,
    .settings-row > div > strong,
    .settings-segmented-option,
    .settings-text-button
  ) {
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.background-controls-panel .background-controls-reset,
.background-controls-panel .background-controls-reset:hover:not(:disabled) {
  color: var(--auralis-danger);
}
.background-controls-panel .settings-text-button.background-controls-reset,
.background-controls-panel .settings-range-control output {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.background-controls-panel :is(button, input):focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
  box-shadow: none;
}
.background-controls-panel input[type='range']:focus-visible {
  outline-offset: 4px;
}
.background-sidebar-enter-active,
.background-sidebar-leave-active {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.background-sidebar-enter-from,
.background-sidebar-leave-to {
  transform: translateX(calc(100% + var(--background-panel-gap)));
}
.background-sidebar-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .background-sidebar-enter-active,
  .background-sidebar-leave-active {
    transition: none;
  }
}
</style>
