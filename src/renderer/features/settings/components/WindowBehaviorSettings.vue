<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import {
  WINDOW_CLOSE_BEHAVIORS,
  type WindowBehaviorState,
  type WindowCloseBehavior,
} from '@shared/types/windowBehavior'
import SettingsSelect from './SettingsSelect.vue'

const { t } = useI18n()
const state = ref<WindowBehaviorState>({ behavior: 'quit', trayAvailable: false })
const ready = ref(false)
const busy = ref(false)
const error = ref<'loadFailed' | 'saveFailed' | null>(null)
const options = computed(() =>
  WINDOW_CLOSE_BEHAVIORS.map((value) => ({
    value,
    label: t(`settings.appearance.windowBehavior.${value}`),
    disabled: value === 'tray' && !state.value.trayAvailable,
  })),
)

async function load(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    state.value = await auralis.window.getCloseBehavior()
    ready.value = true
  } catch {
    error.value = 'loadFailed'
  } finally {
    busy.value = false
  }
}

async function select(value: WindowCloseBehavior): Promise<void> {
  if (!ready.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    state.value = await auralis.window.setCloseBehavior(value)
  } catch {
    error.value = 'saveFailed'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="settings-group window-behavior-settings">
    <div class="settings-group-header">
      <h2 class="settings-group-title">{{ t('settings.appearance.windowBehavior.title') }}</h2>
    </div>
    <div class="settings-group-card">
      <div class="settings-row settings-row--with-desc">
        <div>
          <strong id="window-close-behavior-label">{{
            t('settings.appearance.windowBehavior.label')
          }}</strong>
          <span id="window-close-behavior-description">{{
            t('settings.appearance.windowBehavior.description')
          }}</span>
          <span v-if="ready && !state.trayAvailable" role="status">{{
            t('settings.appearance.windowBehavior.trayUnavailable')
          }}</span>
          <span v-if="error" role="status">{{
            t(`settings.appearance.windowBehavior.${error}`)
          }}</span>
          <button
            v-if="error === 'loadFailed'"
            type="button"
            class="settings-text-button"
            :disabled="busy"
            @click="load"
          >
            {{ t('settings.appearance.windowBehavior.retry') }}
          </button>
        </div>
        <SettingsSelect
          id="window-close-behavior"
          labelledby="window-close-behavior-label"
          describedby="window-close-behavior-description"
          :model-value="state.behavior"
          :options="options"
          :disabled="!ready || busy"
          @update:model-value="select($event as WindowCloseBehavior)"
        />
      </div>
    </div>
  </div>
</template>
