<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'

const { t } = useI18n()
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const exportState = ref<'idle' | 'exporting' | 'saved' | 'cancelled' | 'failed'>('idle')
const backupState = ref<'idle' | 'exporting' | 'saved' | 'cancelled' | 'failed'>('idle')
const restoreState = ref<'idle' | 'staging' | 'staged' | 'cancelled' | 'failed'>('idle')

let copyStateTimer: number | undefined
let exportStateTimer: number | undefined
let backupStateTimer: number | undefined
let restoreStateTimer: number | undefined

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

async function exportDiagnostics(): Promise<void> {
  window.clearTimeout(exportStateTimer)
  exportState.value = 'exporting'

  try {
    const result = await auralis.app.exportDiagnostics()
    exportState.value = result.status
  } catch {
    exportState.value = 'failed'
  }

  exportStateTimer = window.setTimeout(() => {
    exportState.value = 'idle'
  }, 3200)
}

async function backupDatabase(): Promise<void> {
  window.clearTimeout(backupStateTimer)
  backupState.value = 'exporting'

  try {
    const result = await auralis.database.exportBackup()
    backupState.value = result.status
  } catch {
    backupState.value = 'failed'
  }

  backupStateTimer = window.setTimeout(() => {
    backupState.value = 'idle'
  }, 3200)
}

async function restoreDatabase(): Promise<void> {
  window.clearTimeout(restoreStateTimer)
  restoreState.value = 'staging'

  try {
    const result = await auralis.database.restoreBackup()
    restoreState.value = result.status
  } catch {
    restoreState.value = 'failed'
  }

  restoreStateTimer = window.setTimeout(() => {
    restoreState.value = 'idle'
  }, 4800)
}

function exportButtonLabel(): string {
  if (exportState.value === 'exporting') return t('settings.about.diagnosticsExporting')
  if (exportState.value === 'saved') return t('settings.about.diagnosticsSaved')
  if (exportState.value === 'cancelled') return t('settings.about.diagnosticsCancelled')
  if (exportState.value === 'failed') return t('settings.about.diagnosticsFailed')
  return t('settings.about.exportDiagnostics')
}

function backupButtonLabel(): string {
  if (backupState.value === 'exporting') return t('settings.about.backupExporting')
  if (backupState.value === 'saved') return t('settings.about.backupSaved')
  if (backupState.value === 'cancelled') return t('settings.about.backupCancelled')
  if (backupState.value === 'failed') return t('settings.about.backupFailed')
  return t('settings.about.exportBackup')
}

function restoreButtonLabel(): string {
  if (restoreState.value === 'staging') return t('settings.about.restoreStaging')
  if (restoreState.value === 'staged') return t('settings.about.restoreStaged')
  if (restoreState.value === 'cancelled') return t('settings.about.restoreCancelled')
  if (restoreState.value === 'failed') return t('settings.about.restoreFailed')
  return t('settings.about.restoreBackup')
}

onMounted(async () => {
  try {
    appInfo.value = await auralis.app.getInfo()
  } catch {
    appInfoError.value = true
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(copyStateTimer)
  window.clearTimeout(exportStateTimer)
  window.clearTimeout(backupStateTimer)
  window.clearTimeout(restoreStateTimer)
})
</script>

<template>
  <section class="settings-section">
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

      <div class="settings-row">
        <div>
          <strong>{{ t('settings.about.backupDatabase') }}</strong>
          <span>{{ t('settings.about.backupDatabaseDescription') }}</span>
        </div>
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="backupState === 'exporting'"
          @click="backupDatabase"
        >
          <span :class="backupState === 'saved' ? 'i-lucide-check' : 'i-lucide-download'"></span>
          {{ backupButtonLabel() }}
        </button>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t('settings.about.restoreDatabase') }}</strong>
          <span>{{ t('settings.about.restoreDatabaseDescription') }}</span>
        </div>
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="restoreState === 'staging'"
          @click="restoreDatabase"
        >
          <span :class="restoreState === 'staged' ? 'i-lucide-check' : 'i-lucide-upload'"></span>
          {{ restoreButtonLabel() }}
        </button>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t('settings.about.diagnostics') }}</strong>
          <span>{{ t('settings.about.diagnosticsDescription') }}</span>
        </div>
        <button
          type="button"
          class="settings-secondary-button"
          :disabled="exportState === 'exporting'"
          @click="exportDiagnostics"
        >
          <span :class="exportState === 'saved' ? 'i-lucide-check' : 'i-lucide-file-down'"></span>
          {{ exportButtonLabel() }}
        </button>
      </div>
    </div>
  </section>
</template>
