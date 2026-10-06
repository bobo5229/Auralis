<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useSettingsDialog } from '../composables/useSettingsDialog'
import { loadSettingsContent } from '../utils/settingsContentLoader'
import { prepareSettingsDialogEnter } from '../utils/prepareSettingsDialogEnter'
import type { SettingsSection } from '../utils/settingsSections'

const { t } = useI18n()
const {
  isSettingsOpen,
  selectedSection,
  closeSettings,
  selectSettingsSection,
  restoreSettingsFocus,
} = useSettingsDialog()
const panel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const content = shallowRef<Component | null>(null)
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
let loadRevision = 0
let contentReady = Promise.resolve()
let cancelEnter: (() => void) | undefined
let fadingIn = false
let deferredContent: Component | null = null

function reducedMotion(): boolean {
  return document.documentElement.dataset.reducedMotion === 'true'
}

function beforeEnter(element: Element): void {
  cancelEnter?.()
  const target = element.querySelector<HTMLElement>('.settings-dialog-panel')!
  // Keep the blur layer at its final opacity; only the panel will fade.
  // A small nonzero opacity lets Chromium prepare the panel's first paint too.
  target.style.removeProperty('opacity')
  if (!reducedMotion()) target.style.opacity = '0.01'
}

function enterDialog(element: Element, done: () => void): void {
  if (reducedMotion()) {
    done()
    return
  }
  const target = element.querySelector<HTMLElement>('.settings-dialog-panel')!
  let timeout: ReturnType<typeof setTimeout> | undefined
  const stopPreparation = prepareSettingsDialogEnter(contentReady, () => {
    if (!isSettingsOpen.value) return
    fadingIn = true
    target.addEventListener('transitionend', onEnd)
    // Also finish when reduced motion is enabled during entry, removing the CSS transition.
    timeout = setTimeout(finish, 180)
    target.style.removeProperty('opacity')
    if (reducedMotion()) finish()
  })
  function onEnd(event: TransitionEvent): void {
    if (event.target === target && event.propertyName === 'opacity') finish()
  }
  function cleanup(): void {
    stopPreparation()
    clearTimeout(timeout)
    target.removeEventListener('transitionend', onEnd)
  }
  function finish(): void {
    cleanup()
    cancelEnter = undefined
    fadingIn = false
    done()
    if (deferredContent && isSettingsOpen.value) {
      content.value = deferredContent
      deferredContent = null
      loadState.value = 'ready'
    }
  }
  cancelEnter = cleanup
}

function cancelDialogEnter(): void {
  cancelEnter?.()
  cancelEnter = undefined
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

useOverlayFocusTrap({
  isOpen: isSettingsOpen,
  container: panel,
  initialFocus: () => closeButton.value ?? undefined,
  onEscape: closeSettings,
  restoreFocus: restoreSettingsFocus,
})

onBeforeUnmount(() => {
  cancelDialogEnter()
  loadRevision++
  closeSettings()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      name="settings-dialog-fade"
      @before-enter="beforeEnter"
      @enter="enterDialog"
      @enter-cancelled="cancelDialogEnter"
    >
      <div
        v-if="isSettingsOpen"
        class="sidebar-overlay settings-dialog-backdrop"
        @click.self="closeSettings"
      >
        <section
          ref="panel"
          class="settings-dialog-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          data-settings-dialog
        >
          <header class="settings-dialog-header">
            <h2 id="settings-dialog-title">{{ t('settings.title') }}</h2>
            <button
              ref="closeButton"
              type="button"
              class="settings-dialog-close"
              :aria-label="t('settings.dialog.close')"
              @click="closeSettings"
            >
              <span class="i-lucide-x" aria-hidden="true"></span>
            </button>
          </header>

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
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 40px 24px;
  background: rgba(0, 0, 0, 0.18);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  -webkit-app-region: no-drag;
}

.settings-dialog-panel {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(960px, calc(100vw - 48px));
  height: min(680px, calc(100vh - 80px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: var(--auralis-main-bg);
  color: var(--auralis-text);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
}

.settings-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--auralis-border-subtle);
}

.settings-dialog-header h2 {
  margin: 0;
  font-size: var(--auralis-type-section-size);
  line-height: var(--auralis-type-section-line-height);
  font-weight: 700;
}

.settings-dialog-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--auralis-text-muted);
  background: transparent;
  cursor: pointer;
}

.settings-dialog-close span {
  width: 18px;
  height: 18px;
}

.settings-dialog-close:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 6%, transparent);
}

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
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--auralis-border-subtle) transparent;
  padding: 20px 24px 24px;
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

:is(
  .settings-dialog-close,
  .settings-dialog-nav button,
  .settings-dialog-status button
):focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

.settings-dialog-fade-enter-active .settings-dialog-panel,
.settings-dialog-fade-leave-active {
  transition: opacity 140ms ease;
}

.settings-dialog-fade-leave-to {
  opacity: 0;
}

:where([data-reduced-motion='true']) .settings-dialog-fade-enter-active .settings-dialog-panel,
:where([data-reduced-motion='true']) .settings-dialog-fade-leave-active,
:where([data-reduced-motion='true']) .settings-dialog-nav button {
  transition: none;
}
</style>
