<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  MetadataRefreshFailure,
} from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const { t } = useI18n()

const roots = ref<LibraryRoot[]>([])
const scanStatus = ref<LibraryScanStatus | null>(null)
const currentProgress = ref<LibraryScanProgress | null>(null)
const isLoading = ref(false)
const operationError = ref<string | null>(null)
const unsubscribe = ref<(() => void) | null>(null)
const refreshJobId = ref<number | null>(null)
const refreshStatus = ref<{
  status: string
  totalTracks: number
  processedTracks: number
  failedTracks: number
} | null>(null)
const refreshFailures = ref<MetadataRefreshFailure[]>([])
const refreshErrorMessage = ref<string | null>(null)
const isRefreshing = ref(false)
const isClearingRefreshFailures = ref(false)
const showRefreshFailures = ref(false)
const isMounted = ref(false)
const unsubscribeRefresh = ref<(() => void) | null>(null)

const activeRoot = computed(() => roots.value[0] ?? null)
const isScanning = computed(() => scanStatus.value?.status === 'scanning')
const folderActionButton = ref<HTMLButtonElement | null>(null)
const scanActionButton = ref<HTMLButtonElement | null>(null)
const cancelScanButton = ref<HTMLButtonElement | null>(null)

// 扫描状态切换会让「重新扫描」与「取消」互斥消失，焦点需转移到仍可用的后继控件；
// 仅当焦点仍在即将消失的控件上时转移，不打断用户已主动移动的焦点。
watch(isScanning, (now, was) => {
  if (was === now) return
  const source = now ? scanActionButton : cancelScanButton
  if (document.activeElement !== source.value) return
  void focusAction(now ? cancelScanButton : scanActionButton)
})

async function focusAction(target: Ref<HTMLButtonElement | null>): Promise<void> {
  await nextTick()
  const el = target.value
  if (!isMounted.value || !el || el.disabled) return
  el.focus({ preventScroll: true })
}

const totalFiles = computed(
  () => currentProgress.value?.totalFiles ?? scanStatus.value?.totalFiles ?? 0,
)
const scannedFiles = computed(
  () => currentProgress.value?.scannedFiles ?? scanStatus.value?.scannedFiles ?? 0,
)
const failedFiles = computed(
  () => currentProgress.value?.failedFiles ?? scanStatus.value?.failedFiles ?? 0,
)
const progressPercent = computed(() => {
  if (totalFiles.value === 0) return 0
  return Math.min(100, Math.round((scannedFiles.value / totalFiles.value) * 100))
})
const statusLabel = computed(() => {
  if (isScanning.value) return t('settings.library.scanStatus.scanning')
  if (!scanStatus.value) {
    return activeRoot.value
      ? t('settings.library.scanStatus.waitingFirst')
      : t('settings.library.scanStatus.notConfigured')
  }

  const labels: Record<string, string> = {
    completed: t('settings.library.scanStatus.completed'),
    canceled: t('settings.library.scanStatus.canceled'),
    failed: t('settings.library.scanStatus.failed'),
    queued: t('settings.library.scanStatus.queued'),
  }

  return labels[scanStatus.value.status] ?? t('settings.library.scanStatus.unknown')
})
const lastScannedLabel = computed(() => {
  if (!activeRoot.value?.lastScannedAt) return t('settings.library.neverScanned')

  const date = new Date(activeRoot.value.lastScannedAt)
  if (Number.isNaN(date.getTime())) return activeRoot.value.lastScannedAt

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
})
const libraryMetaText = computed(() => {
  if (!activeRoot.value) {
    return t('settings.library.chooseFolderHint')
  }

  const parts: string[] = []
  if (totalFiles.value > 0) {
    parts.push(t('settings.library.fileCount', { count: totalFiles.value }))
  }

  if (activeRoot.value.lastScannedAt) {
    parts.push(t('settings.library.lastScanned', { time: lastScannedLabel.value }))
  } else {
    parts.push(statusLabel.value)
  }

  return parts.join(' · ')
})
const refreshProgressPercent = computed(() => {
  if (!refreshStatus.value || refreshStatus.value.totalTracks === 0) return 0

  return Math.min(
    100,
    Math.round((refreshStatus.value.processedTracks / refreshStatus.value.totalTracks) * 100),
  )
})
const refreshStatusLabel = computed(() => {
  if (!refreshStatus.value) return ''

  if (refreshStatus.value.status === 'completed') {
    return t('settings.library.refreshCompleted', {
      updated: refreshStatus.value.processedTracks,
      failed: refreshStatus.value.failedTracks,
    })
  }

  if (refreshStatus.value.status === 'failed') {
    return t('settings.library.refreshFailed')
  }

  return t('settings.library.refreshProcessing', {
    processed: refreshStatus.value.processedTracks,
    total: refreshStatus.value.totalTracks,
  })
})

function getErrorMessage(error: unknown, fallback: string): string {
  rendererDiagnostics.error({
    scope: 'settings.library',
    message: 'Library operation failed',
    cause: error,
  })
  return fallback
}

async function loadLibraryState(): Promise<void> {
  try {
    const [nextRoots, nextScanStatus, nextFailures] = await Promise.all([
      auralis.library.getRoots(),
      auralis.library.getScanStatus(),
      auralis.metadata.listRefreshFailures(),
    ])

    if (!isMounted.value) return

    roots.value = nextRoots
    scanStatus.value = nextScanStatus
    refreshFailures.value = nextFailures
  } catch (error) {
    if (isMounted.value) {
      operationError.value = getErrorMessage(error, t('settings.library.errors.loadState'))
    }
  }
}

async function clearRefreshFailures(): Promise<void> {
  if (isClearingRefreshFailures.value) return

  isClearingRefreshFailures.value = true
  refreshErrorMessage.value = null
  try {
    await auralis.metadata.clearRefreshFailures()
    refreshFailures.value = []
    showRefreshFailures.value = false
  } catch (error) {
    refreshErrorMessage.value = getErrorMessage(error, t('settings.library.errors.clearFailures'))
  } finally {
    isClearingRefreshFailures.value = false
  }
}

async function chooseFolder(): Promise<void> {
  isLoading.value = true
  operationError.value = null

  try {
    const result = await auralis.library.selectRoot()

    if (!result.canceled && result.root) {
      roots.value = [result.root]
      scanStatus.value = await auralis.library.getScanStatus()
      currentProgress.value = null
    }
  } catch (error) {
    operationError.value = getErrorMessage(error, t('settings.library.errors.selectFolder'))
  } finally {
    isLoading.value = false
  }
}

async function startScan(): Promise<void> {
  if (!activeRoot.value) return

  isLoading.value = true
  operationError.value = null

  try {
    const result = await auralis.library.startScan(activeRoot.value.id)
    scanStatus.value = await auralis.library.getScanStatus(result.jobId)
    currentProgress.value = null
  } catch (error) {
    operationError.value = getErrorMessage(error, t('settings.library.errors.startScan'))
  } finally {
    isLoading.value = false
  }
}

async function cancelScan(): Promise<void> {
  if (!scanStatus.value) return

  operationError.value = null
  try {
    await auralis.library.cancelScan(scanStatus.value.jobId)
    scanStatus.value = await auralis.library.getScanStatus(scanStatus.value.jobId)
  } catch (error) {
    operationError.value = getErrorMessage(error, t('settings.library.errors.cancelScan'))
  }
}

async function refreshMissingMetadata(): Promise<void> {
  if (isRefreshing.value) return

  isRefreshing.value = true
  refreshStatus.value = null
  refreshErrorMessage.value = null

  try {
    const result = await auralis.metadata.refreshMissing()
    if (!isMounted.value) return
    refreshJobId.value = result.jobId
  } catch (error) {
    if (!isMounted.value) return
    refreshErrorMessage.value = getErrorMessage(error, t('settings.library.errors.startRefresh'))
    isRefreshing.value = false
  }
}

onMounted(async () => {
  isMounted.value = true

  unsubscribe.value = auralis.library.onScanProgress(async (progress) => {
    if (!scanStatus.value || scanStatus.value.jobId === progress.jobId) {
      currentProgress.value = progress
      const nextScanStatus = await auralis.library.getScanStatus(progress.jobId)
      if (!isMounted.value) return
      scanStatus.value = nextScanStatus
    }

    if (progress.status === 'completed') {
      const nextRoots = await auralis.library.getRoots()
      if (isMounted.value) roots.value = nextRoots
    }
  })

  unsubscribeRefresh.value = auralis.metadata.onRefreshProgress(async (progress) => {
    refreshStatus.value = {
      status: progress.status,
      totalTracks: progress.totalTracks,
      processedTracks: progress.processedTracks,
      failedTracks: progress.failedTracks,
    }

    if (progress.status === 'completed' || progress.status === 'failed') {
      isRefreshing.value = false
      const failures = await auralis.metadata.listRefreshFailures()
      if (isMounted.value) refreshFailures.value = failures
    }
  })

  await loadLibraryState()
})

onBeforeUnmount(() => {
  isMounted.value = false
  unsubscribe.value?.()
  unsubscribeRefresh.value?.()
})
</script>

<template>
  <section class="settings-section">
    <!-- 音乐来源 Section -->
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.library.sourceSection') }}</h2>
      </div>
      <div class="settings-group-card library-source-card">
        <div class="library-source-main">
          <div class="library-source-title">{{ t('settings.library.currentFolder') }}</div>
          <div v-if="activeRoot" class="library-source-path">{{ activeRoot.path }}</div>
          <div v-else class="library-source-path is-empty">
            {{ t('settings.library.noFolderSelected') }}
          </div>
        </div>
        <div class="library-source-footer">
          <div class="library-source-meta">{{ libraryMetaText }}</div>
          <div class="library-source-actions">
            <button
              ref="folderActionButton"
              type="button"
              class="settings-button"
              :disabled="isLoading || isScanning"
              @click="chooseFolder"
            >
              {{
                activeRoot ? t('settings.library.changeFolder') : t('settings.library.selectFolder')
              }}
            </button>
            <button
              v-if="activeRoot && !isScanning"
              ref="scanActionButton"
              type="button"
              class="settings-button"
              :disabled="isLoading"
              @click="startScan"
            >
              {{ scanStatus ? t('settings.library.rescan') : t('settings.library.scanLibrary') }}
            </button>
          </div>
        </div>

        <!-- 扫描进行中状态条：内联在卡片底部 -->
        <div v-if="isScanning" class="library-scan-inline">
          <div class="library-scan-header">
            <div class="library-scan-info">
              <span class="scan-spinner i-lucide-loader-circle" aria-hidden="true"></span>
              <span class="scan-title">{{ t('settings.library.scanningTitle') }}</span>
              <span class="scan-detail"
                >·
                {{
                  t('settings.library.fileProgress', { scanned: scannedFiles, total: totalFiles })
                }}</span
              >
              <span v-if="failedFiles > 0" class="scan-failed"
                >· {{ t('settings.library.failedCount', { count: failedFiles }) }}</span
              >
            </div>
            <div class="library-scan-actions">
              <span class="scan-percent">{{ progressPercent }}%</span>
              <button type="button" class="settings-button-link" @click="cancelScan">
                {{ t('settings.library.cancel') }}
              </button>
            </div>
          </div>
          <div class="settings-progress-track">
            <div class="settings-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="operationError" class="library-error-row">
          <span class="i-lucide-circle-alert" aria-hidden="true"></span>
          <span>{{ operationError }}</span>
        </div>
      </div>
    </div>

    <!-- 资料库维护 Section -->
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.library.maintenanceSection') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.library.fillMissing') }}</strong>
            <span>{{ t('settings.library.maintenanceDescription') }}</span>
          </div>
          <button
            type="button"
            class="settings-button"
            :disabled="isRefreshing || isScanning || !activeRoot"
            @click="refreshMissingMetadata"
          >
            <span
              v-if="isRefreshing"
              class="scan-spinner i-lucide-loader-circle"
              aria-hidden="true"
            ></span>
            {{ isRefreshing ? t('settings.library.maintaining') : t('settings.library.runAction') }}
          </button>
        </div>

        <!-- 维护进行中进度条 -->
        <div v-if="refreshStatus" class="library-refresh-inline">
          <div class="refresh-status-header">
            <span>{{ refreshStatusLabel }}</span>
            <strong>{{ refreshProgressPercent }}%</strong>
          </div>
          <div class="settings-progress-track">
            <div
              class="settings-progress-fill"
              :style="{ width: `${refreshProgressPercent}%` }"
            ></div>
          </div>
        </div>

        <!-- 维护错误提示 -->
        <div v-if="refreshErrorMessage" class="library-error-row">
          <span class="i-lucide-circle-alert" aria-hidden="true"></span>
          <span>{{ refreshErrorMessage }}</span>
        </div>

        <!-- 失败记录折叠列表 -->
        <div v-if="refreshFailures.length > 0" class="failure-section">
          <button
            type="button"
            class="failure-toggle"
            :aria-expanded="showRefreshFailures"
            @click="showRefreshFailures = !showRefreshFailures"
          >
            <span class="failure-summary">
              {{ t('settings.library.failuresSummary', { count: refreshFailures.length }) }}
            </span>
            <span
              class="failure-chevron"
              :class="showRefreshFailures ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              aria-hidden="true"
            ></span>
          </button>

          <div v-if="showRefreshFailures" class="failure-content">
            <div class="failure-toolbar">
              <span>{{ t('settings.library.failureRecords') }}</span>
              <button
                type="button"
                class="settings-button-link"
                :disabled="isClearingRefreshFailures"
                @click="clearRefreshFailures"
              >
                {{
                  isClearingRefreshFailures
                    ? t('settings.library.clearing')
                    : t('settings.library.clearRecords')
                }}
              </button>
            </div>
            <div class="failure-list">
              <div v-for="failure in refreshFailures" :key="failure.id" class="failure-item">
                <div class="failure-item-row">
                  <span v-tooltip.overflow="failure.filePath" class="failure-path">
                    {{
                      failure.filePath ??
                      t('settings.library.trackFallback', {
                        id: failure.trackId ?? t('settings.library.unknown'),
                      })
                    }}
                  </span>
                  <span class="failure-reason">{{ failure.reason }}</span>
                </div>
                <span class="failure-meta">
                  {{ t('settings.library.jobPrefix', { id: failure.jobId }) }} ·
                  {{ failure.createdAt }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 按钮基础风格：去 CTA 化的轻量桌面次级按钮 */
.settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-text) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 80%, transparent);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.settings-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 10%, transparent);
  border-color: color-mix(in srgb, var(--auralis-border-subtle) 100%, transparent);
}

.settings-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 14%, transparent);
}

.settings-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-button:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

/* 文本链接型操作按钮 */
.settings-button-link {
  display: inline-flex;
  align-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 150ms ease;
}

.settings-button-link:hover:not(:disabled) {
  color: var(--auralis-text);
}

.settings-button-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-button-link:focus-visible {
  outline: 2px solid var(--auralis-sidebar-active-indicator);
  outline-offset: 2px;
}

/* 音乐来源卡片：上部路径优先，下部摘要与操作 */
.library-source-card {
  container-type: inline-size;
}

.library-source-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 16px;
  min-width: 0;
}

.library-source-title {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--auralis-text-subtle);
  user-select: none;
}

.library-source-path {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  color: var(--auralis-text);
  white-space: normal;
  overflow-wrap: anywhere;
  direction: ltr;
  user-select: text;
}

.library-source-path.is-empty {
  color: var(--auralis-text-faint);
  font-family: inherit;
}

.library-source-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 16px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.library-source-meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--auralis-text-subtle);
  min-width: 0;
}

.library-source-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@container (max-width: 580px) {
  .library-source-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .library-source-actions {
    justify-content: flex-end;
  }
}

/* 扫描进行中内联模块 */
.library-scan-inline {
  padding: 10px 16px 12px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 4%, transparent);
}

.library-scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 11px;
}

.library-scan-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.library-scan-info .scan-spinner {
  flex-shrink: 0;
  color: var(--auralis-sidebar-active-indicator);
}

.scan-title {
  font-weight: 600;
  color: var(--auralis-text);
  white-space: nowrap;
}

.scan-detail {
  color: var(--auralis-text-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-failed {
  color: #c76d5f;
  white-space: nowrap;
}

.library-scan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.scan-percent {
  font-size: 11px;
  font-weight: 600;
  color: var(--auralis-text-muted);
}

/* 维护进度内联模块 */
.library-refresh-inline {
  padding: 10px 16px 12px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.refresh-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--auralis-text-subtle);
}

.refresh-status-header strong {
  color: var(--auralis-text-muted);
  font-weight: 600;
}

/* 紧凑平滑进度条 */
.settings-progress-track {
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  overflow: hidden;
}

.settings-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--auralis-sidebar-active-indicator);
  transition: width 200ms ease;
}

/* 错误提示行 */
.library-error-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
  color: #c2675b;
  font-size: 11px;
  background: color-mix(in srgb, #c2675b 6%, transparent);
}

.library-error-row span.i-lucide-circle-alert {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
}

/* 失败记录折叠与列表 */
.failure-section {
  border-top: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
}

.failure-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.failure-toggle:hover {
  background: color-mix(in srgb, var(--auralis-text) 3%, transparent);
}

.failure-summary {
  font-weight: 500;
  color: #c76d5f;
}

.failure-chevron {
  width: 13px;
  height: 13px;
  color: var(--auralis-text-faint);
}

.failure-content {
  padding: 0 16px 12px;
}

.failure-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 6px 8px;
  font-size: 11px;
  color: var(--auralis-text-faint);
}

.failure-list {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--auralis-text) 12%, transparent) transparent;
}

.failure-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 30%, transparent);
}

.failure-item:last-child {
  border-bottom: none;
}

.failure-item-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.failure-path {
  font-family: monospace;
  font-size: 11px;
  color: var(--auralis-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
}

.failure-reason {
  font-size: 11px;
  color: #c76d5f;
  white-space: nowrap;
  flex-shrink: 0;
}

.failure-meta {
  font-size: 10px;
  color: var(--auralis-text-faint);
}

/* 旋转菊花与微动效 */
.scan-spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scan-spinner {
    animation: none;
  }

  .settings-progress-fill {
    transition: none;
  }
}
</style>
