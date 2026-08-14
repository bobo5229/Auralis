<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'

const { t } = useI18n()
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

onBeforeUnmount(() => {
  window.clearTimeout(copyStateTimer)
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
    </div>
  </section>
</template>
