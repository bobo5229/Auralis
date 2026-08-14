<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import VisualStylePreference from '@renderer/features/appearance/components/VisualStylePreference.vue'
import { type PlayerBarMaterial, usePlayerBarMaterial } from '../composables/usePlayerBarMaterial'
import { type AppLocale, useLocale } from '@renderer/composables/useLocale'
import MusicLibrarySettings from '../components/MusicLibrarySettings.vue'
import { resolveSettingsPresentation } from '../utils/settingsPresentation'
import type { SettingsPresentation } from '../types/settingsPresentation'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import '../styles/manuscript.css'
import '../styles/settings.chrome.css'

type SettingsSection = 'appearance' | 'playback' | 'library' | 'about'

const { t } = useI18n()
const route = useRoute()
const { visualStyle } = useVisualStyle()
const settingsPresentation = computed<SettingsPresentation>(() =>
  resolveSettingsPresentation(route.name, visualStyle.value),
)
const { locale, setLocale, localeOptions } = useLocale()

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
    id: 'playback',
    label: t('settings.nav.playback'),
    description: t('settings.nav.playbackDescription'),
    icon: 'i-lucide-audio-lines',
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

const selectedSection = ref<SettingsSection>('library')
const { gaplessPlaybackEnabled, setGaplessPlaybackEnabled } = usePlayback()
const { playerBarMaterial, setPlayerBarMaterial } = usePlayerBarMaterial()
const playerBarMaterialOptions = computed<Array<{ value: PlayerBarMaterial; label: string }>>(
  () => [
    {
      value: 'cover-tint',
      label: t('settings.appearance.playerBarMaterialOption.coverTint'),
    },
    {
      value: 'liquid-glass',
      label: t('settings.appearance.playerBarMaterialOption.liquidGlass'),
    },
  ],
)
const coverTintButtonRef = ref<HTMLButtonElement | null>(null)
const liquidGlassButtonRef = ref<HTMLButtonElement | null>(null)
const localeButtonRefs = new Map<AppLocale, HTMLButtonElement>()
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
let copyStateTimer: number | undefined

function getPlayerBarMaterialButton(value: PlayerBarMaterial): HTMLButtonElement | null {
  return value === 'cover-tint' ? coverTintButtonRef.value : liquidGlassButtonRef.value
}

function selectPlayerBarMaterial(value: PlayerBarMaterial, focusSelectedOption = false): void {
  setPlayerBarMaterial(value)

  if (focusSelectedOption) {
    void nextTick(() => getPlayerBarMaterialButton(value)?.focus())
  }
}

function handlePlayerBarMaterialKeydown(event: KeyboardEvent, value: PlayerBarMaterial): void {
  const currentIndex = playerBarMaterialOptions.value.findIndex((option) => option.value === value)
  if (currentIndex < 0) return

  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex =
        (currentIndex - 1 + playerBarMaterialOptions.value.length) %
        playerBarMaterialOptions.value.length
      break
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % playerBarMaterialOptions.value.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = playerBarMaterialOptions.value.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const nextOption = playerBarMaterialOptions.value[nextIndex]
  if (nextOption) {
    selectPlayerBarMaterial(nextOption.value, true)
  }
}

function setLocaleButtonRef(value: AppLocale, el: unknown): void {
  if (el instanceof HTMLButtonElement) {
    localeButtonRefs.set(value, el)
  } else {
    localeButtonRefs.delete(value)
  }
}

function selectLocale(value: AppLocale, focusSelectedOption = false): void {
  setLocale(value)

  if (focusSelectedOption) {
    void nextTick(() => localeButtonRefs.get(value)?.focus())
  }
}

function handleLocaleKeydown(event: KeyboardEvent, value: AppLocale): void {
  const currentIndex = localeOptions.value.findIndex((option) => option.value === value)
  if (currentIndex < 0) return

  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + localeOptions.value.length) % localeOptions.value.length
      break
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % localeOptions.value.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = localeOptions.value.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const nextOption = localeOptions.value[nextIndex]
  if (nextOption) {
    selectLocale(nextOption.value, true)
  }
}

async function copyDatabasePath(): Promise<void> {
  if (!appInfo.value?.databasePath) return

  window.clearTimeout(copyStateTimer)

  try {
    await navigator.clipboard.writeText(appInfo.value.databasePath)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }

  copyStateTimer = window.setTimeout(() => {
    copyState.value = 'idle'
  }, 2400)
}

onMounted(async () => {
  try {
    appInfo.value = await auralis.app.getInfo()
  } catch {
    appInfoError.value = true
  }
})
</script>

<template>
  <section class="settings-page" :data-visual-style="settingsPresentation">
    <header class="settings-header">
      <p class="settings-eyebrow">{{ t('settings.eyebrow') }}</p>
      <h1>{{ t('settings.title') }}</h1>
      <p>{{ t('settings.headerDescription') }}</p>
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
        <section v-if="selectedSection === 'appearance'" class="settings-section">
          <div class="settings-section-heading">
            <span class="settings-section-icon i-lucide-palette"></span>
            <div>
              <h2>{{ t('settings.appearance.headingTitle') }}</h2>
              <p>{{ t('settings.appearance.headingDescription') }}</p>
            </div>
          </div>

          <div class="settings-list settings-list--appearance">
            <div class="settings-row settings-row--visual-style">
              <VisualStylePreference />
            </div>

            <div class="settings-row">
              <div>
                <strong id="locale-label">{{ t('settings.appearance.language') }}</strong>
                <span id="locale-description">{{
                  t('settings.appearance.languageDescription')
                }}</span>
              </div>
              <div
                class="settings-segmented-control"
                role="radiogroup"
                aria-labelledby="locale-label"
                aria-describedby="locale-description"
              >
                <button
                  v-for="option in localeOptions"
                  :key="option.value"
                  :ref="(el) => setLocaleButtonRef(option.value, el)"
                  type="button"
                  role="radio"
                  class="settings-segmented-option"
                  :class="{ 'is-selected': locale === option.value }"
                  :aria-checked="locale === option.value"
                  :tabindex="locale === option.value ? 0 : -1"
                  @click="selectLocale(option.value)"
                  @keydown="handleLocaleKeydown($event, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="settings-row">
              <div>
                <strong id="player-bar-material-label">{{
                  t('settings.appearance.playerBarMaterial')
                }}</strong>
                <span id="player-bar-material-description">{{
                  t('settings.appearance.playerBarMaterialDescription')
                }}</span>
              </div>
              <div
                class="settings-segmented-control"
                role="radiogroup"
                aria-labelledby="player-bar-material-label"
                aria-describedby="player-bar-material-description"
              >
                <button
                  ref="coverTintButtonRef"
                  type="button"
                  role="radio"
                  class="settings-segmented-option"
                  :class="{ 'is-selected': playerBarMaterial === 'cover-tint' }"
                  :aria-checked="playerBarMaterial === 'cover-tint'"
                  :tabindex="playerBarMaterial === 'cover-tint' ? 0 : -1"
                  @click="selectPlayerBarMaterial('cover-tint')"
                  @keydown="handlePlayerBarMaterialKeydown($event, 'cover-tint')"
                >
                  {{ t('settings.appearance.playerBarMaterialOption.coverTint') }}
                </button>
                <button
                  ref="liquidGlassButtonRef"
                  type="button"
                  role="radio"
                  class="settings-segmented-option"
                  :class="{ 'is-selected': playerBarMaterial === 'liquid-glass' }"
                  :aria-checked="playerBarMaterial === 'liquid-glass'"
                  :tabindex="playerBarMaterial === 'liquid-glass' ? 0 : -1"
                  @click="selectPlayerBarMaterial('liquid-glass')"
                  @keydown="handlePlayerBarMaterialKeydown($event, 'liquid-glass')"
                >
                  {{ t('settings.appearance.playerBarMaterialOption.liquidGlass') }}
                </button>
              </div>
            </div>
          </div>

          <div class="theme-status" :aria-label="t('settings.appearance.themeAria')">
            <span class="theme-preview theme-preview--dark" aria-hidden="true">
              <span class="theme-preview-sidebar"></span>
              <span class="theme-preview-main">
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span class="theme-preview-player"></span>
            </span>
            <div class="theme-status-copy">
              <strong>{{ t('settings.appearance.themeValue') }}</strong>
              <small>{{ t('settings.appearance.themeDescription') }}</small>
            </div>
          </div>

          <p class="settings-note">
            <span class="i-lucide-info"></span>
            {{ t('settings.appearance.note') }}
          </p>
        </section>

        <section v-else-if="selectedSection === 'playback'" class="settings-section">
          <div class="settings-section-heading">
            <span class="settings-section-icon i-lucide-audio-lines"></span>
            <div>
              <h2>{{ t('settings.playback.headingTitle') }}</h2>
              <p>{{ t('settings.playback.headingDescription') }}</p>
            </div>
          </div>

          <div class="settings-list">
            <div class="settings-row">
              <div>
                <strong>{{ t('settings.playback.gapless') }}</strong>
                <span id="gapless-playback-description">{{
                  t('settings.playback.gaplessDescription')
                }}</span>
              </div>
              <button
                type="button"
                class="settings-switch"
                role="switch"
                :aria-checked="gaplessPlaybackEnabled"
                aria-describedby="gapless-playback-description"
                :aria-label="
                  gaplessPlaybackEnabled
                    ? t('settings.playback.gaplessAriaOn')
                    : t('settings.playback.gaplessAriaOff')
                "
                :class="{ 'is-enabled': gaplessPlaybackEnabled }"
                @click="setGaplessPlaybackEnabled(!gaplessPlaybackEnabled)"
              >
                <span class="settings-switch-thumb" aria-hidden="true"></span>
              </button>
            </div>
          </div>

          <p class="settings-note">
            <span class="i-lucide-info"></span>
            {{ t('settings.playback.note') }}
          </p>
        </section>

        <MusicLibrarySettings v-else-if="selectedSection === 'library'" />

        <section v-else class="settings-section">
          <div class="settings-section-heading">
            <span class="settings-section-icon i-lucide-info"></span>
            <div>
              <h2>{{ t('settings.about.headingTitle') }}</h2>
              <p>{{ t('settings.about.headingDescription') }}</p>
            </div>
          </div>

          <div class="about-mark">
            <span class="about-logo"><span class="i-lucide-audio-lines"></span></span>
            <div>
              <strong>Auralis</strong>
              <span>{{ t('settings.about.tagline') }}</span>
            </div>
          </div>

          <div class="settings-list">
            <div class="settings-row">
              <div>
                <strong>{{ t('settings.about.version') }}</strong>
                <span>{{ t('settings.about.versionDescription') }}</span>
              </div>
              <span class="settings-value">{{
                appInfo?.version ?? (appInfoError ? t('settings.about.versionUnavailable') : '…')
              }}</span>
            </div>

            <div class="settings-row settings-row--path">
              <div>
                <strong>{{ t('settings.about.databaseLocation') }}</strong>
                <span class="database-path">
                  {{
                    appInfo?.databasePath ??
                    (appInfoError
                      ? t('settings.about.databaseReadFailed')
                      : t('settings.about.databaseLoading'))
                  }}
                </span>
              </div>
              <button
                type="button"
                class="settings-secondary-button"
                :disabled="!appInfo?.databasePath"
                @click="copyDatabasePath"
              >
                <span :class="copyState === 'copied' ? 'i-lucide-check' : 'i-lucide-copy'"></span>
                {{
                  copyState === 'copied'
                    ? t('settings.about.copySuccess')
                    : copyState === 'failed'
                      ? t('settings.about.copyFailed')
                      : t('settings.about.copyPath')
                }}
              </button>
            </div>
          </div>

          <p class="settings-note">
            <span class="i-lucide-shield-check"></span>
            {{ t('settings.about.note') }}
          </p>
        </section>
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
  margin-bottom: 30px;
  position: relative;
}

.settings-eyebrow {
  margin: 0 0 7px;
  color: var(--auralis-sidebar-active-text);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.settings-header h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 36px);
  font-weight: 800;
  letter-spacing: -0.035em;
  background: linear-gradient(
    135deg,
    var(--auralis-text) 60%,
    var(--auralis-sidebar-active-indicator)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.settings-header > p:last-child {
  margin: 9px 0 0;
  color: var(--auralis-text-muted);
  font-size: 14px;
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

.settings-section {
  animation: settings-enter 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* Section Header Redesign */
.settings-section-heading {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 24px;
}

.settings-section-icon {
  display: grid;
  flex: 0 0 40px;
  width: 20px;
  height: 20px;
  padding: 10px;
  border-radius: 12px;
  color: var(--auralis-sidebar-active-icon);
  background: color-mix(in srgb, var(--auralis-sidebar-active-bg) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 20%, transparent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 8%, transparent);
}

.settings-section-heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.settings-section-heading p {
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.theme-status {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 20px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 65%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
}

.theme-preview {
  position: relative;
  display: grid;
  grid-template-columns: 27% 1fr;
  height: 132px;
  overflow: hidden;
  border: 1px solid rgba(120, 120, 120, 0.12);
  border-radius: 14px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.08);
}

.theme-preview--dark {
  background: #191919;
}

.theme-preview-sidebar {
  border-right: 1px solid rgba(120, 120, 120, 0.08);
  background: #232324;
}

.theme-preview-main {
  display: grid;
  align-content: start;
  gap: 9px;
  padding: 24px 14px;
}

.theme-preview-main i {
  display: block;
  height: 16px;
  border-radius: 5px;
  background: #2a2c2f;
}

.theme-preview-main i:first-child {
  width: 64%;
  height: 8px;
  margin-bottom: 4px;
}

.theme-preview-player {
  position: absolute;
  right: 12%;
  bottom: 9px;
  left: 34%;
  height: 20px;
  border: 1px solid rgba(120, 120, 120, 0.08);
  border-radius: 8px;
  background: rgba(35, 35, 36, 0.95);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.theme-status-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.theme-status-copy strong {
  font-size: 15px;
  font-weight: 700;
}

.theme-status-copy small {
  color: var(--auralis-text-subtle);
  font-size: 12px;
  line-height: 1.45;
}

.settings-note {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 20px 2px 0;
  color: var(--auralis-text-subtle);
  font-size: 11px;
}

.settings-note span {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  color: var(--auralis-sidebar-active-indicator);
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
    margin-bottom: 22px;
  }

  .theme-status {
    grid-template-columns: 1fr;
  }

  .settings-nav-icon {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-page,
  .settings-section {
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
