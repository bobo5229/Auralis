<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppearanceSettings from '../components/AppearanceSettings.vue'
import AboutSettings from '../components/AboutSettings.vue'
import MusicLibrarySettings from '../components/MusicLibrarySettings.vue'
import { DEFAULT_SETTINGS_SECTION, type SettingsSection } from '../utils/settingsSections'
import '../styles/settings.chrome.css'

const { t } = useI18n()

const sections = computed<
  Array<{
    id: SettingsSection
    label: string
    icon: string
  }>
>(() => [
  {
    id: 'appearance',
    label: t('settings.nav.appearance'),
    icon: 'i-lucide-palette',
  },
  {
    id: 'library',
    label: t('settings.nav.library'),
    icon: 'i-lucide-library',
  },
  {
    id: 'about',
    label: t('settings.nav.about'),
    icon: 'i-lucide-info',
  },
])

const selectedSection = ref<SettingsSection>(DEFAULT_SETTINGS_SECTION)
</script>

<template>
  <section class="settings-page">
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
          :aria-current="selectedSection === section.id ? 'true' : undefined"
          @click="selectedSection = section.id"
        >
          <span class="settings-nav-icon" :class="section.icon" aria-hidden="true"></span>
          <span class="settings-nav-label">{{ section.label }}</span>
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 24px;
}

/* Nav Item - restrained desktop inspector style without card aesthetics */
.settings-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  color: var(--auralis-text-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  position: relative;
  user-select: none;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}

.settings-nav button:hover {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 4%, transparent);
}

.settings-nav button:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

.settings-nav button.is-active {
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 8%, transparent);
}

/* Restrained short vertical accent indicator */
.settings-nav button.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2.5px;
  height: 16px;
  border-radius: 0 2px 2px 0;
  background: var(--auralis-sidebar-active-indicator);
}

.settings-nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: inherit;
  opacity: 0.75;
  transition: opacity 140ms ease;
}

.settings-nav button:hover .settings-nav-icon,
.settings-nav button.is-active .settings-nav-icon {
  opacity: 1;
}

.settings-nav button.is-active .settings-nav-icon {
  color: var(--auralis-sidebar-active-indicator);
}

.settings-nav-label {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: inherit;
}

.settings-nav button.is-active .settings-nav-label {
  font-weight: 600;
}

.settings-content {
  min-width: 0;
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
    flex-direction: row;
    position: static;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .settings-nav button {
    flex: 1 0 auto;
    width: auto;
    justify-content: center;
    padding: 8px 14px;
  }

  .settings-nav button.is-active::before {
    left: 50%;
    top: auto;
    bottom: 0;
    width: 20px;
    height: 2.5px;
    transform: translateX(-50%);
    border-radius: 2px 2px 0 0;
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
  .settings-nav button,
  .settings-nav-icon {
    transition: none;
  }
}
</style>
