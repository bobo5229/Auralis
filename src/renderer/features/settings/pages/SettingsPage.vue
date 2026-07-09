<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppInfo } from '@shared/types/app'
import type { ThemeMode } from '@renderer/composables/useTheme'
import { useTheme } from '@renderer/composables/useTheme'
import { auralis } from '@renderer/shared/ipc/client'
import MusicLibrarySettings from '../components/MusicLibrarySettings.vue'

type SettingsSection = 'appearance' | 'library' | 'about'

const sections: Array<{
  id: SettingsSection
  label: string
  description: string
  icon: string
}> = [
  {
    id: 'appearance',
    label: '外观',
    description: '选择 Auralis 的显示方式',
    icon: 'i-lucide-palette',
  },
  {
    id: 'library',
    label: '音乐资料库',
    description: '管理音乐文件与元数据',
    icon: 'i-lucide-library',
  },
  {
    id: 'about',
    label: '关于',
    description: '版本与本地数据位置',
    icon: 'i-lucide-info',
  },
]

const selectedSection = ref<SettingsSection>('appearance')
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
let copyStateTimer: number | undefined

const { theme, isThemeTransitioning, setTheme } = useTheme()

async function selectTheme(nextTheme: ThemeMode, event: MouseEvent): Promise<void> {
  await setTheme(nextTheme, {
    animate: true,
    origin: {
      x: event.clientX,
      y: event.clientY,
    },
  })
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
  <section class="settings-page">
    <header class="settings-header">
      <p class="settings-eyebrow">偏好设置</p>
      <h1>设置</h1>
      <p>调整 Auralis 的外观，管理你的本地音乐资料库。</p>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
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
              <h2>外观</h2>
              <p>选择最适合当下环境的显示主题。</p>
            </div>
          </div>

          <div class="theme-options" role="radiogroup" aria-label="显示主题">
            <button
              type="button"
              class="theme-option"
              :class="{ 'is-selected': theme === 'light' }"
              role="radio"
              :aria-checked="theme === 'light'"
              :disabled="isThemeTransitioning"
              @click="selectTheme('light', $event)"
            >
              <span class="theme-preview theme-preview--light">
                <span class="theme-preview-sidebar"></span>
                <span class="theme-preview-main">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span class="theme-preview-player"></span>
              </span>
              <span class="theme-option-footer">
                <span>
                  <strong>浅色</strong>
                  <small>明亮、干净的纸张质感</small>
                </span>
                <span class="theme-check">
                  <span v-if="theme === 'light'" class="i-lucide-check"></span>
                </span>
              </span>
            </button>

            <button
              type="button"
              class="theme-option"
              :class="{ 'is-selected': theme === 'dark' }"
              role="radio"
              :aria-checked="theme === 'dark'"
              :disabled="isThemeTransitioning"
              @click="selectTheme('dark', $event)"
            >
              <span class="theme-preview theme-preview--dark">
                <span class="theme-preview-sidebar"></span>
                <span class="theme-preview-main">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span class="theme-preview-player"></span>
              </span>
              <span class="theme-option-footer">
                <span>
                  <strong>深色</strong>
                  <small>安静、专注的夜间体验</small>
                </span>
                <span class="theme-check">
                  <span v-if="theme === 'dark'" class="i-lucide-check"></span>
                </span>
              </span>
            </button>
          </div>

          <p class="settings-note">
            <span class="i-lucide-info"></span>
            主题选择会自动保存在这台设备上。
          </p>
        </section>

        <MusicLibrarySettings v-else-if="selectedSection === 'library'" />

        <section v-else class="settings-section">
          <div class="settings-section-heading">
            <span class="settings-section-icon i-lucide-info"></span>
            <div>
              <h2>关于 Auralis</h2>
              <p>一个安静、私密的本地音乐归档工具。</p>
            </div>
          </div>

          <div class="about-mark">
            <span class="about-logo"><span class="i-lucide-audio-lines"></span></span>
            <div>
              <strong>Auralis</strong>
              <span>Local Music Archive</span>
            </div>
          </div>

          <div class="settings-list">
            <div class="settings-row">
              <div>
                <strong>版本</strong>
                <span>当前安装的应用版本</span>
              </div>
              <span class="settings-value">{{
                appInfo?.version ?? (appInfoError ? '无法读取' : '…')
              }}</span>
            </div>

            <div class="settings-row settings-row--path">
              <div>
                <strong>数据库位置</strong>
                <span class="database-path">
                  {{ appInfo?.databasePath ?? (appInfoError ? '无法读取应用信息' : '正在读取…') }}
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
                    ? '已复制'
                    : copyState === 'failed'
                      ? '复制失败'
                      : '复制路径'
                }}
              </button>
            </div>
          </div>

          <p class="settings-note">
            <span class="i-lucide-shield-check"></span>
            音乐文件和资料库数据均保存在本机。
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
}

.settings-header {
  margin-bottom: 30px;
}

.settings-eyebrow {
  margin: 0 0 7px;
  color: var(--auralis-sidebar-active-text);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.settings-header h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 36px);
  font-weight: 650;
  letter-spacing: -0.035em;
}

.settings-header > p:last-child {
  margin: 9px 0 0;
  color: var(--auralis-text-muted);
  font-size: 14px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 42px;
  align-items: start;
}

.settings-nav {
  display: grid;
  gap: 5px;
  position: sticky;
  top: 24px;
}

.settings-nav button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 14px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 11px 10px;
  border: 0;
  border-radius: 12px;
  color: var(--auralis-text-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease;
}

.settings-nav button:hover {
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}

.settings-nav button.is-active {
  color: var(--auralis-sidebar-active-text);
  background: var(--auralis-sidebar-active-bg);
}

.settings-nav-icon {
  width: 17px;
  height: 17px;
  margin: auto;
}

.settings-nav-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.settings-nav-copy strong {
  font-size: 13px;
  font-weight: 600;
}

.settings-nav-copy small {
  overflow: hidden;
  color: var(--auralis-text-subtle);
  font-size: 10px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav-chevron {
  width: 13px;
  height: 13px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.settings-nav button.is-active .settings-nav-chevron {
  opacity: 0.65;
}

.settings-content {
  min-width: 0;
}

.settings-section {
  animation: settings-enter 220ms ease both;
}

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
  background: var(--auralis-sidebar-active-bg);
}

.settings-section-heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.settings-section-heading p {
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.theme-option {
  padding: 7px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 16px;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 68%, transparent);
  text-align: left;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.theme-option:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 38%, transparent);
}

.theme-option.is-selected {
  border-color: var(--auralis-sidebar-active-indicator);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 13%, transparent);
}

.theme-option:disabled {
  cursor: default;
}

.theme-preview {
  position: relative;
  display: grid;
  grid-template-columns: 27% 1fr;
  height: 154px;
  overflow: hidden;
  border: 1px solid rgba(120, 120, 120, 0.14);
  border-radius: 11px;
}

.theme-preview--light {
  background: #fff;
}

.theme-preview--dark {
  background: #1f1f1f;
}

.theme-preview-sidebar {
  border-right: 1px solid rgba(120, 120, 120, 0.12);
}

.theme-preview--light .theme-preview-sidebar {
  background: #f6f6f7;
}

.theme-preview--dark .theme-preview-sidebar {
  background: #272728;
}

.theme-preview-main {
  display: grid;
  align-content: start;
  gap: 9px;
  padding: 28px 16px;
}

.theme-preview-main i {
  display: block;
  height: 19px;
  border-radius: 5px;
}

.theme-preview--light .theme-preview-main i {
  background: #eff1f3;
}

.theme-preview--dark .theme-preview-main i {
  background: #2d2f32;
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
  height: 23px;
  border: 1px solid rgba(120, 120, 120, 0.12);
  border-radius: 8px;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.08);
}

.theme-preview--light .theme-preview-player {
  background: rgba(255, 255, 255, 0.88);
}

.theme-preview--dark .theme-preview-player {
  background: rgba(45, 47, 50, 0.9);
}

.theme-option-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 8px 8px;
}

.theme-option-footer > span:first-child {
  display: grid;
  gap: 3px;
}

.theme-option-footer strong {
  font-size: 13px;
  font-weight: 600;
}

.theme-option-footer small {
  color: var(--auralis-text-subtle);
  font-size: 10px;
}

.theme-check {
  display: grid;
  flex: 0 0 19px;
  width: 19px;
  height: 19px;
  place-items: center;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 50%;
}

.is-selected .theme-check {
  border-color: var(--auralis-sidebar-active-indicator);
  color: white;
  background: var(--auralis-sidebar-active-indicator);
}

.theme-check span {
  width: 12px;
  height: 12px;
}

.settings-note {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 18px 2px 0;
  color: var(--auralis-text-subtle);
  font-size: 11px;
}

.settings-note span {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
}

.about-mark {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 22px;
  padding: 20px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 68%, transparent);
}

.about-logo {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  color: var(--auralis-control-primary-text);
  background: var(--auralis-control-primary-bg);
}

.about-logo span {
  width: 22px;
  height: 22px;
}

.about-mark > div {
  display: grid;
  gap: 3px;
}

.about-mark strong {
  font-size: 18px;
  letter-spacing: -0.02em;
}

.about-mark div span {
  color: var(--auralis-text-subtle);
  font-size: 11px;
}

.settings-list {
  overflow: hidden;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 48%, transparent);
}

.settings-row {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 0 18px;
}

.settings-row + .settings-row {
  border-top: 1px solid var(--auralis-border-subtle);
}

.settings-row > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.settings-row strong {
  font-size: 13px;
  font-weight: 600;
}

.settings-row div span {
  color: var(--auralis-text-subtle);
  font-size: 10px;
}

.settings-value {
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.database-path {
  overflow: hidden;
  max-width: 480px;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
}

.settings-secondary-button {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 7px;
  align-items: center;
  min-width: 86px;
  justify-content: center;
  padding: 8px 11px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 9px;
  color: var(--auralis-text);
  background: var(--auralis-control-active-bg);
  font-size: 11px;
  cursor: pointer;
}

.settings-secondary-button:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.settings-secondary-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.settings-secondary-button span {
  width: 13px;
  height: 13px;
}

@keyframes settings-enter {
  from {
    opacity: 0;
    transform: translateY(5px);
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
    padding-bottom: 2px;
  }

  .settings-nav button {
    display: flex;
    flex: 1 0 auto;
    width: auto;
    padding: 9px 13px;
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

  .theme-options {
    grid-template-columns: 1fr;
  }

  .settings-nav-icon {
    display: none;
  }

  .settings-row--path {
    align-items: flex-start;
    flex-direction: column;
    padding-block: 16px;
  }

  .database-path {
    max-width: calc(100vw - 72px);
  }
}
</style>
