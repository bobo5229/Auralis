<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppInfo } from '@shared/types/app'
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
    description: '当前显示主题',
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

const selectedSection = ref<SettingsSection>('library')
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
let copyStateTimer: number | undefined

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
      <p>管理你的本地音乐资料库，查看应用信息。</p>
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
              <p>当前固定为深色主题，便于封面流光与夜间聆听。</p>
            </div>
          </div>

          <div class="theme-status" aria-label="显示主题">
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
              <strong>深色</strong>
              <small>浅色主题已暂时下线；主题 API 仍保留，便于日后恢复多主题。</small>
            </div>
          </div>

          <p class="settings-note">
            <span class="i-lucide-info"></span>
            应用始终使用深色界面。
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

/* About and Metadata section redesign */
.about-mark {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 22px;
  padding: 20px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 20px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 65%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 color-mix(in srgb, white 15%, transparent);
}

.about-logo {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 14px;
  color: var(--auralis-control-primary-text);
  background: linear-gradient(
    135deg,
    var(--auralis-sidebar-active-indicator) 20%,
    var(--auralis-sidebar-active-text)
  );
  box-shadow: 0 4px 14px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 35%, transparent);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.about-logo span {
  width: 22px;
  height: 22px;
}

.about-mark:hover .about-logo {
  transform: rotate(15deg) scale(1.08);
}

.about-mark > div {
  display: grid;
  gap: 3px;
}

.about-mark strong {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--auralis-text);
}

.about-mark div span {
  color: var(--auralis-text-subtle);
  font-size: 11px;
  font-weight: 600;
}

.settings-list {
  overflow: hidden;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 20px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 48%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.02);
}

.settings-row {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 0 20px;
  transition: background-color 0.2s ease;
}

.settings-row:hover {
  background: color-mix(in srgb, var(--auralis-text) 1.5%, transparent);
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
  font-weight: 700;
}

.settings-row div span {
  color: var(--auralis-text-subtle);
  font-size: 11px;
  font-weight: 500;
}

.settings-value {
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 600;
  background: color-mix(in srgb, var(--auralis-text) 5%, transparent);
  padding: 4px 10px;
  border-radius: 8px;
}

.database-path {
  overflow: hidden;
  max-width: 480px;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
  font-family: monospace;
  background: color-mix(in srgb, var(--auralis-text) 5%, transparent);
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--auralis-sidebar-active-text) !important;
  font-size: 11px !important;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 5%, transparent);
}

/* Success & Secondary Button Redesign */
.settings-secondary-button {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 7px;
  align-items: center;
  min-width: 92px;
  justify-content: center;
  padding: 8px 14px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 12px;
  color: var(--auralis-text);
  background: var(--auralis-control-active-bg);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 20%, transparent);
}

.settings-secondary-button:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--auralis-text) 16%, transparent);
}

.settings-secondary-button:active:not(:disabled) {
  transform: scale(0.97);
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

  .settings-row--path {
    align-items: flex-start;
    flex-direction: column;
    padding-block: 16px;
    gap: 12px;
  }

  .database-path {
    max-width: calc(100vw - 72px);
  }
}
</style>
