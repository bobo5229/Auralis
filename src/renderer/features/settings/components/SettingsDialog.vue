<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useSettingsDialog } from '../composables/useSettingsDialog'
import { loadSettingsContent } from '../utils/settingsContentLoader'
import type { SettingsSection } from '../utils/settingsSections'

const { t } = useI18n()
const {
  isSettingsOpen,
  selectedSection,
  closeSettings,
  selectSettingsSection,
  restoreSettingsFocus,
} = useSettingsDialog()
const scrollContainer = ref<HTMLElement | null>(null)
const content = shallowRef<Component | null>(null)
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
let loadRevision = 0
let contentReady = Promise.resolve()
let fadingIn = false
let deferredContent: Component | null = null

function finishDialogEnter(): void {
  fadingIn = false
  if (deferredContent && isSettingsOpen.value) {
    content.value = deferredContent
    deferredContent = null
    loadState.value = 'ready'
  }
}
function cancelDialogEnter(): void {
  fadingIn = false
  deferredContent = null
}
const sections = computed<Array<{ id: SettingsSection; label: string; icon: string }>>(() => [
  { id: 'appearance', label: t('settings.nav.appearance'), icon: 'i-lucide-palette' },
  { id: 'playback', label: t('settings.nav.playback'), icon: 'i-lucide-play' },
  { id: 'library', label: t('settings.nav.library'), icon: 'i-lucide-library' },
  { id: 'about', label: t('settings.nav.about'), icon: 'i-lucide-info' },
])

async function loadContent(): Promise<void> {
  const revision = ++loadRevision
  loadState.value = 'loading'
  try {
    const loaded = await loadSettingsContent()
    if (revision !== loadRevision || !isSettingsOpen.value) return
    if (fadingIn) deferredContent = loaded
    else {
      content.value = loaded
      loadState.value = 'ready'
    }
  } catch (cause) {
    if (revision !== loadRevision || !isSettingsOpen.value) return
    loadState.value = 'failed'
    rendererDiagnostics.warn({
      scope: 'settings.dialog',
      message: 'Failed to load settings',
      cause,
    })
  }
}

watch(
  isSettingsOpen,
  (open) => {
    if (open) contentReady = loadContent().then(() => nextTick())
    else {
      cancelDialogEnter()
      loadRevision++
      content.value = null
    }
  },
  { immediate: true },
)

watch(
  [isSettingsOpen, selectedSection],
  () => {
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  cancelDialogEnter()
  loadRevision++
  closeSettings()
})
</script>

<template>
  <AppDialog
    :open="isSettingsOpen"
    :title="t('settings.title')"
    title-id="settings-dialog-title"
    :close-label="t('settings.dialog.close')"
    panel-class="settings-dialog-panel"
    backdrop-class="settings-dialog-backdrop"
    close-class="settings-dialog-close"
    fill
    :padded="false"
    :scroll="false"
    :ready="contentReady"
    :restore-focus="restoreSettingsFocus"
    data-settings-dialog
    @close="closeSettings"
    @enter-start="fadingIn = true"
    @entered="finishDialogEnter"
    @enter-cancelled="cancelDialogEnter"
  >
    <div class="settings-dialog-layout">
      <nav class="settings-dialog-nav" :aria-label="t('settings.navAriaLabel')">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ 'is-active': selectedSection === section.id }"
          :aria-current="selectedSection === section.id ? 'true' : undefined"
          :data-settings-section="section.id"
          @click="selectSettingsSection(section.id)"
        >
          <span :class="section.icon" aria-hidden="true"></span>
          <span>{{ section.label }}</span>
        </button>
      </nav>

      <div
        ref="scrollContainer"
        class="settings-dialog-content"
        :aria-busy="loadState === 'loading'"
      >
        <component :is="content" v-if="content" :section="selectedSection" />
        <div v-else-if="loadState === 'failed'" class="settings-dialog-status" role="alert">
          <p>{{ t('settings.dialog.loadFailed') }}</p>
          <button type="button" @click="loadContent">{{ t('settings.dialog.retry') }}</button>
        </div>
        <p v-else class="settings-dialog-status" role="status">
          {{ t('settings.dialog.loading') }}
        </p>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.settings-dialog-layout {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  min-height: 0;
}

.settings-dialog-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 12px;
  border-right: 1px solid var(--auralis-border-subtle);
}

.settings-dialog-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  color: var(--auralis-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}

.settings-dialog-nav button:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 4%, transparent);
}

.settings-dialog-nav button.is-active {
  color: var(--auralis-control-primary-text);
  background: var(--auralis-theme-accent);
  font-weight: 600;
}

.settings-dialog-nav button span:first-child {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
}

.settings-dialog-content {
  --settings-content-padding-top: 20px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-border-subtle) transparent;
  padding: var(--settings-content-padding-top) 24px 24px;
}

.settings-dialog-status {
  margin: 0;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}

.settings-dialog-status p {
  margin: 0 0 12px;
}

.settings-dialog-status button {
  padding: 6px 12px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  color: var(--auralis-text);
  background: var(--auralis-sidebar-bg);
  font: inherit;
  cursor: pointer;
}

:is(.settings-dialog-nav button, .settings-dialog-status button):focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

:where([data-reduced-motion='true']) .settings-dialog-nav button {
  transition: none;
}
</style>
