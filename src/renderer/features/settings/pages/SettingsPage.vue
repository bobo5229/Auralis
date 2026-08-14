<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import AppearanceSettings from '../components/AppearanceSettings.vue'
import AboutSettings from '../components/AboutSettings.vue'
import MusicLibrarySettings from '../components/MusicLibrarySettings.vue'
import { resolveSettingsPresentation } from '../utils/settingsPresentation'
import { DEFAULT_SETTINGS_SECTION, type SettingsSection } from '../utils/settingsSections'
import type { SettingsPresentation } from '../types/settingsPresentation'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import '../styles/settings.chrome.css'
import '../styles/manuscript.css'

const { t } = useI18n()
const route = useRoute()
const { visualStyle } = useVisualStyle()
const settingsPresentation = computed<SettingsPresentation>(() =>
  resolveSettingsPresentation(route.name, visualStyle.value),
)

const sections = computed<
  Array<{
    id: SettingsSection
    label: string
    description: string
    icon: string
  }>
>(() => [
  {
    id: 'appearance',
    label: t('settings.nav.appearance'),
    description: t('settings.nav.appearanceDescription'),
    icon: 'i-lucide-palette',
  },
  {
    id: 'library',
    label: t('settings.nav.library'),
    description: t('settings.nav.libraryDescription'),
    icon: 'i-lucide-library',
  },
  {
    id: 'about',
    label: t('settings.nav.about'),
    description: t('settings.nav.aboutDescription'),
    icon: 'i-lucide-info',
  },
])

const selectedSection = ref<SettingsSection>(DEFAULT_SETTINGS_SECTION)
</script>

<template>
  <section class="settings-page" :data-visual-style="settingsPresentation">
    <header class="settings-header">
      <h1>{{ t('settings.title') }}</h1>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" :aria-label="t('settings.navAriaLabel')">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ 'is-active': selectedSection === section.id }"
          @click="selectedSection = section.id"
        >
          <span class="settings-nav-icon" :class="section.icon"></span>
          <span class="settings-nav-copy">
            <strong>{{ section.label }}</strong>
            <small>{{ section.description }}</small>
          </span>
          <span class="i-lucide-chevron-right settings-nav-chevron"></span>
        </button>
      </nav>

      <main class="settings-content">
        <AppearanceSettings v-if="selectedSection === 'appearance'" />
        <MusicLibrarySettings v-else-if="selectedSection === 'library'" />
        <AboutSettings v-else />
      </main>
    </div>
  </section>
</template>

<style scoped>
.settings-page {
  width: min(1120px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 38px 36px var(--auralis-playbar-safe-area);
  animation: settings-enter 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.settings-header {
  margin-bottom: 18px;
  position: relative;
}

.settings-header h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 36px);
  font-weight: 800;
  letter-spacing: -0.035em;
  color: var(--auralis-text);
}

.settings-layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 42px;
  align-items: start;
}

.settings-nav {
  display: grid;
  gap: 6px;
  position: sticky;
  top: 24px;
}

/* Nav Item card redesign */
.settings-nav button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 14px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--auralis-text-muted);
  background: rgba(255, 255, 255, 0.015);
  text-align: left;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.settings-nav button:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 8%, transparent);
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 12%, transparent);
  transform: translateX(3px);
}

.settings-nav button.is-active {
  background: linear-gradient(
    95deg,
    color-mix(in srgb, var(--auralis-sidebar-active-bg) 85%, transparent),
    color-mix(in srgb, var(--auralis-sidebar-active-bg) 60%, transparent)
  ) !important;
  border: 1px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 35%, transparent) !important;
  color: var(--auralis-sidebar-active-text) !important;
  box-shadow:
    0 4px 14px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 12%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  font-weight: 700;
}

/* Active indicator vertical line */
.settings-nav button.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  height: 50%;
  width: 3px;
  border-radius: 2px;
  background: var(--auralis-sidebar-active-indicator);
  box-shadow: 0 0 8px var(--auralis-sidebar-active-indicator);
}

/* Shimmer Sweep Effect */
.settings-nav button.is-active::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 15%, transparent),
    transparent
  );
  transform: skewX(-20deg);
  pointer-events: none;
  animation: settings-nav-shimmer 5s infinite linear;
}

@keyframes settings-nav-shimmer {
  0% {
    left: -150%;
  }
  25% {
    left: 150%;
  }
  100% {
    left: 150%;
  }
}

.settings-nav-icon {
  width: 17px;
  height: 17px;
  margin: auto;
  transition: transform 0.2s ease;
}

.settings-nav button:hover .settings-nav-icon {
  transform: scale(1.1);
}

.settings-nav-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.settings-nav-copy strong {
  font-size: 13px;
  font-weight: 700;
}

.settings-nav-copy small {
  overflow: hidden;
  color: var(--auralis-text-subtle);
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav-chevron {
  width: 13px;
  height: 13px;
  opacity: 0;
  transform: translateX(-4px);
  transition: all 200ms ease;
}

.settings-nav button.is-active .settings-nav-chevron {
  opacity: 0.65;
  transform: translateX(0);
}

.settings-content {
  min-width: 0;
}

@keyframes settings-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (max-width: 820px) {
  .settings-page {
    padding: 28px 24px var(--auralis-playbar-safe-area);
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 26px;
  }

  .settings-nav {
    display: flex;
    position: static;
    gap: 7px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .settings-nav button {
    display: flex;
    flex: 1 0 auto;
    width: auto;
    padding: 10px 14px;
  }

  .settings-nav-copy small,
  .settings-nav-chevron {
    display: none;
  }
}

@media (max-width: 560px) {
  .settings-page {
    padding-inline: 18px;
  }

  .settings-header {
    margin-bottom: 18px;
  }

  .settings-nav-icon {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-page {
    animation: none;
  }

  .settings-nav button,
  .settings-nav button:hover,
  .settings-nav-icon,
  .settings-nav-chevron {
    transition: none;
    transform: none;
  }

  .settings-nav button.is-active::after {
    animation: none;
    content: none;
  }
}
</style>
