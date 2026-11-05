<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppInfo } from '@shared/types/app'
import { auralis } from '@renderer/shared/ipc/client'

import licenseText from '../../../../../LICENSE?raw'
import thirdPartyNotices from '../../../../../THIRD_PARTY_NOTICES.md?raw'

const { t } = useI18n()
const appInfo = ref<AppInfo | null>(null)
const appInfoError = ref(false)
const exportState = ref<'idle' | 'exporting' | 'saved' | 'cancelled' | 'failed'>('idle')

async function exportDiagnostics(): Promise<void> {
  exportState.value = 'exporting'

  try {
    const result = await auralis.app.exportDiagnostics()
    exportState.value = result.status
  } catch {
    exportState.value = 'failed'
  }
}

function exportButtonLabel(): string {
  if (exportState.value === 'exporting') return t('settings.about.diagnosticsExporting')
  if (exportState.value === 'saved') return t('settings.about.diagnosticsSaved')
  if (exportState.value === 'cancelled') return t('settings.about.diagnosticsCancelled')
  if (exportState.value === 'failed') return t('settings.about.diagnosticsFailed')
  return t('settings.about.exportDiagnostics')
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
  <section class="settings-section about-settings settings-compact-actions">
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.about.productSection') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="about-mark">
          <span class="about-logo" aria-hidden="true"
            ><span class="i-lucide-audio-lines"></span
          ></span>
          <div>
            <strong>Auralis</strong>
            <span>{{ t('settings.about.tagline') }}</span>
          </div>
        </div>
        <div class="about-details">
          <div class="settings-row">
            <div>
              <strong>{{ t('settings.about.version') }}</strong>
              <span>{{ t('settings.about.versionDescription') }}</span>
            </div>
            <span class="settings-value">{{
              appInfo?.version ?? (appInfoError ? t('settings.about.versionUnavailable') : '…')
            }}</span>
          </div>

          <details class="about-document">
            <summary>
              <span>{{ t('settings.about.license') }}</span>
              <span class="about-document-action">
                <span>MIT</span>
                <span class="i-lucide-chevron-down" aria-hidden="true"></span>
              </span>
            </summary>
            <pre
              class="about-document-content"
              tabindex="0"
              :aria-label="t('settings.about.license')"
              >{{ licenseText }}</pre
            >
          </details>
          <details class="about-document">
            <summary>
              <span>{{ t('settings.about.thirdPartyNotices') }}</span>
              <span class="about-document-action">
                <span class="i-lucide-chevron-down" aria-hidden="true"></span>
              </span>
            </summary>
            <pre
              class="about-document-content"
              tabindex="0"
              :aria-label="t('settings.about.thirdPartyNotices')"
              >{{ thirdPartyNotices }}</pre
            >
          </details>
        </div>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.about.supportSection') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.about.diagnostics') }}</strong>
            <span>{{ t('settings.about.diagnosticsDescription') }}</span>
            <span role="status" :class="{ 'settings-status--error': exportState === 'failed' }">{{
              exportState === 'idle' ? '' : exportButtonLabel()
            }}</span>
          </div>
          <button
            type="button"
            class="settings-text-button"
            :disabled="exportState === 'exporting'"
            @click="exportDiagnostics"
          >
            {{ t('settings.about.exportDiagnostics') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
