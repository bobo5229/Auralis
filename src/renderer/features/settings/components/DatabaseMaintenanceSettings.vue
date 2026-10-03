<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'

const { t } = useI18n()
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const backupState = ref<'idle' | 'exporting' | 'saved' | 'cancelled' | 'failed'>('idle')
const restoreState = ref<'idle' | 'staging' | 'staged' | 'cancelled' | 'failed'>('idle')
let copyStateTimer: number | undefined
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

function backupButtonLabel(): string {
  if (backupState.value === 'exporting') return t('settings.library.backupExporting')
  if (backupState.value === 'saved') return t('settings.library.backupSaved')
  if (backupState.value === 'cancelled') return t('settings.library.backupCancelled')
  if (backupState.value === 'failed') return t('settings.library.backupFailed')
  return t('settings.library.exportBackup')
}

function restoreButtonLabel(): string {
  if (restoreState.value === 'staging') return t('settings.library.restoreStaging')
  if (restoreState.value === 'staged') return t('settings.library.restoreStaged')
  if (restoreState.value === 'cancelled') return t('settings.library.restoreCancelled')
  if (restoreState.value === 'failed') return t('settings.library.restoreFailed')
  return t('settings.library.restoreBackup')
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
  window.clearTimeout(backupStateTimer)
  window.clearTimeout(restoreStateTimer)
})
</script>

<template>
  <div class="settings-group settings-compact-actions">
    <div class="settings-group-header">
      <h2 class="settings-group-title">{{ t('settings.library.maintenanceSection') }}</h2>
    </div>
    <div class="settings-group-card">
      <div class="settings-row settings-row--path">
        <div>
          <strong>{{ t('settings.library.databaseLocation') }}</strong>
          <span class="database-path">
            {{
              appInfo?.databasePath ??
              (appInfoError
                ? t('settings.library.databaseReadFailed')
                : t('settings.library.databaseLoading'))
            }}
          </span>
        </div>
        <button
          type="button"
          class="settings-text-button"
          :disabled="!appInfo?.databasePath"
          @click="copyDatabasePath"
        >
          {{
            copyState === 'copied'
              ? t('settings.library.copySuccess')
              : copyState === 'failed'
                ? t('settings.library.copyFailed')
                : t('settings.library.copyPath')
          }}
        </button>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t('settings.library.backupDatabase') }}</strong>
          <span>{{ t('settings.library.backupDatabaseDescription') }}</span>
        </div>
        <button
          type="button"
          class="settings-text-button"
          :disabled="backupState === 'exporting'"
          @click="backupDatabase"
        >
          {{ backupButtonLabel() }}
        </button>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t('settings.library.restoreDatabase') }}</strong>
          <span>{{ t('settings.library.restoreDatabaseDescription') }}</span>
        </div>
        <button
          type="button"
          class="settings-text-button"
          :disabled="restoreState === 'staging'"
          @click="restoreDatabase"
        >
          {{ restoreButtonLabel() }}
        </button>
      </div>
    </div>
  </div>
</template>
