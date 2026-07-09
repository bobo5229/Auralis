<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  MetadataRefreshFailure,
} from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'

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
  if (isScanning.value) return '正在扫描'
  if (!scanStatus.value) return activeRoot.value ? '等待首次扫描' : '尚未设置'

  const labels: Record<string, string> = {
    completed: '扫描完成',
    canceled: '扫描已取消',
    failed: '扫描失败',
    queued: '等待扫描',
  }

  return labels[scanStatus.value.status] ?? scanStatus.value.status
})
const lastScannedLabel = computed(() => {
  if (!activeRoot.value?.lastScannedAt) return '从未扫描'

  const date = new Date(activeRoot.value.lastScannedAt)
  if (Number.isNaN(date.getTime())) return activeRoot.value.lastScannedAt

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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
    return `已完成 · 更新 ${refreshStatus.value.processedTracks} 首，失败 ${refreshStatus.value.failedTracks} 首`
  }

  if (refreshStatus.value.status === 'failed') {
    return '元数据维护失败'
  }

  return `正在处理 ${refreshStatus.value.processedTracks} / ${refreshStatus.value.totalTracks}`
})

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
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
      operationError.value = getErrorMessage(error, '无法读取音乐资料库状态')
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
    refreshErrorMessage.value = getErrorMessage(error, '无法清除失败记录')
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
    operationError.value = getErrorMessage(error, '无法选择音乐文件夹')
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
    operationError.value = getErrorMessage(error, '无法开始扫描')
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
    operationError.value = getErrorMessage(error, '无法取消扫描')
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
    refreshErrorMessage.value = getErrorMessage(error, '无法开始元数据维护')
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
  <section class="library-settings">
    <div class="settings-section-heading">
      <span class="settings-section-icon i-lucide-library"></span>
      <div>
        <h2>音乐资料库</h2>
        <p>管理 Auralis 读取和整理音乐的方式。</p>
      </div>
    </div>

    <section class="library-card">
      <div class="library-card-header">
        <div class="folder-mark">
          <span class="i-lucide-folder"></span>
        </div>
        <div class="folder-copy">
          <span>当前音乐文件夹</span>
          <strong :title="activeRoot?.path">{{ activeRoot?.path ?? '尚未选择音乐文件夹' }}</strong>
          <small>{{
            activeRoot ? `上次扫描：${lastScannedLabel}` : '选择一个文件夹以建立本地资料库'
          }}</small>
        </div>
        <div class="library-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="isLoading || isScanning"
            @click="chooseFolder"
          >
            <span class="i-lucide-folder-open"></span>
            {{ activeRoot ? '更换文件夹' : '选择文件夹' }}
          </button>
          <button
            v-if="!isScanning"
            type="button"
            class="primary-button"
            :disabled="isLoading || !activeRoot"
            @click="startScan"
          >
            <span class="i-lucide-scan-search"></span>
            {{ scanStatus ? '重新扫描' : '扫描资料库' }}
          </button>
        </div>
      </div>

      <div class="library-status-strip">
        <div>
          <span
            class="status-dot"
            :class="{ 'is-active': isScanning, 'is-ready': activeRoot && !isScanning }"
          ></span>
          <span>状态</span>
          <strong>{{ statusLabel }}</strong>
        </div>
        <div v-if="totalFiles > 0 && !isScanning">
          <span class="i-lucide-file-audio"></span>
          <span>已发现</span>
          <strong>{{ totalFiles }} 个文件</strong>
        </div>
      </div>

      <div v-if="isScanning" class="scan-task">
        <div class="scan-task-heading">
          <div>
            <span class="scan-spinner i-lucide-loader-circle"></span>
            <div>
              <strong>正在整理音乐资料库</strong>
              <span>{{ currentProgress?.message || '正在读取音乐文件…' }}</span>
            </div>
          </div>
          <button type="button" @click="cancelScan">取消</button>
        </div>

        <div class="progress-track">
          <span :style="{ width: `${progressPercent}%` }"></span>
        </div>
        <div class="scan-metrics">
          <span>{{ scannedFiles }} / {{ totalFiles }} 个文件</span>
          <span>{{ failedFiles }} 个失败</span>
          <strong>{{ progressPercent }}%</strong>
        </div>
      </div>

      <p v-if="operationError" class="inline-error library-operation-error">
        <span class="i-lucide-circle-alert"></span>
        {{ operationError }}
      </p>

      <section class="maintenance-section">
        <div class="maintenance-heading">
          <div>
            <span class="i-lucide-wand-sparkles"></span>
            <div>
              <h3>元数据维护</h3>
              <p>重新读取音频文件，补全缺失的标题、艺术家、歌词和封面。</p>
            </div>
          </div>
          <button
            type="button"
            class="secondary-button"
            :disabled="isRefreshing || isScanning || !activeRoot"
            @click="refreshMissingMetadata"
          >
            <span
              :class="isRefreshing ? 'i-lucide-loader-circle scan-spinner' : 'i-lucide-refresh-cw'"
            ></span>
            {{ isRefreshing ? '正在维护…' : '补全缺失信息' }}
          </button>
        </div>

        <div v-if="refreshStatus" class="refresh-progress">
          <div class="progress-track">
            <span :style="{ width: `${refreshProgressPercent}%` }"></span>
          </div>
          <div>
            <span>{{ refreshStatusLabel }}</span>
            <strong>{{ refreshProgressPercent }}%</strong>
          </div>
        </div>

        <p v-if="refreshErrorMessage" class="inline-error">
          <span class="i-lucide-circle-alert"></span>
          {{ refreshErrorMessage }}
        </p>

        <div v-if="refreshFailures.length > 0" class="failure-section">
          <button
            type="button"
            class="failure-toggle"
            :aria-expanded="showRefreshFailures"
            @click="showRefreshFailures = !showRefreshFailures"
          >
            <span class="failure-badge">
              <span class="i-lucide-triangle-alert"></span>
              {{ refreshFailures.length }}
            </span>
            <span>最近有文件未能完成元数据维护</span>
            <span
              class="failure-chevron"
              :class="showRefreshFailures ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            ></span>
          </button>

          <div v-if="showRefreshFailures" class="failure-content">
            <div class="failure-toolbar">
              <span>失败记录</span>
              <button
                type="button"
                :disabled="isClearingRefreshFailures"
                @click="clearRefreshFailures"
              >
                {{ isClearingRefreshFailures ? '正在清除…' : '清除记录' }}
              </button>
            </div>
            <div class="failure-list">
              <div v-for="failure in refreshFailures" :key="failure.id" class="failure-item">
                <span class="failure-path">
                  {{ failure.filePath ?? `曲目 ${failure.trackId ?? '未知'}` }}
                </span>
                <strong>{{ failure.reason }}</strong>
                <small>任务 {{ failure.jobId }} · {{ failure.createdAt }}</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.library-settings {
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

.library-card {
  overflow: hidden;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 54%, transparent);
}

.library-card-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 18px;
}

.folder-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: var(--auralis-sidebar-active-icon);
}

.folder-mark span {
  width: 28px;
  height: 28px;
}

.folder-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.folder-copy > span {
  color: var(--auralis-text-subtle);
  font-size: 10px;
}

.folder-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
}

.folder-copy small {
  color: var(--auralis-text-subtle);
  font-size: 10px;
}

.library-actions {
  display: flex;
  gap: 8px;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  padding: 8px 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  transition:
    opacity 150ms ease,
    background 150ms ease;
}

.primary-button {
  color: var(--auralis-control-primary-text);
  background: var(--auralis-control-primary-bg);
}

.primary-button:hover:not(:disabled) {
  opacity: 0.86;
}

.secondary-button {
  border-color: var(--auralis-border-subtle);
  color: var(--auralis-text);
  background: var(--auralis-control-active-bg);
}

.secondary-button:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.primary-button span,
.secondary-button span {
  width: 13px;
  height: 13px;
}

.library-status-strip {
  display: flex;
  gap: 26px;
  padding: 11px 18px;
  border-top: 1px solid var(--auralis-border-subtle);
  color: var(--auralis-text-subtle);
  font-size: 10px;
}

.library-status-strip > div {
  display: flex;
  gap: 7px;
  align-items: center;
}

.library-status-strip strong {
  color: var(--auralis-text-muted);
  font-weight: 550;
}

.library-status-strip div > span:first-child:not(.status-dot) {
  width: 12px;
  height: 12px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--auralis-text-disabled);
}

.status-dot.is-ready {
  background: var(--auralis-sidebar-active-indicator);
}

.status-dot.is-active {
  background: #d59a43;
  box-shadow: 0 0 0 4px color-mix(in srgb, #d59a43 16%, transparent);
}

.scan-task {
  padding: 16px 18px;
  border-top: 1px solid var(--auralis-border-subtle);
  background: color-mix(in srgb, var(--auralis-sidebar-active-bg) 45%, transparent);
}

.scan-task-heading,
.scan-task-heading > div {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.scan-task-heading > div > div {
  display: grid;
  gap: 3px;
}

.scan-task-heading strong {
  font-size: 11px;
  font-weight: 600;
}

.scan-task-heading span:not(.scan-spinner) {
  color: var(--auralis-text-subtle);
  font-size: 9px;
}

.scan-spinner {
  width: 15px;
  height: 15px;
  animation: spin 900ms linear infinite;
}

.scan-task-heading button {
  border: 0;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: 10px;
  cursor: pointer;
}

.scan-task-heading button:hover {
  color: var(--auralis-text);
}

.progress-track {
  height: 5px;
  overflow: hidden;
  margin-top: 13px;
  border-radius: 99px;
  background: var(--auralis-progress-track);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--auralis-progress-fill);
  transition: width 240ms ease;
}

.scan-metrics,
.refresh-progress > div:last-child {
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--auralis-text-subtle);
  font-size: 9px;
}

.scan-metrics strong,
.refresh-progress strong {
  margin-left: auto;
  color: var(--auralis-text-muted);
}

.maintenance-section {
  border-top: 1px solid var(--auralis-border-subtle);
}

.maintenance-heading {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 18px;
}

.maintenance-heading > div {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.maintenance-heading > div > span {
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
  color: var(--auralis-sidebar-active-icon);
}

.maintenance-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.maintenance-heading p {
  margin: 4px 0 0;
  color: var(--auralis-text-subtle);
  font-size: 10px;
  line-height: 1.5;
}

.refresh-progress {
  padding: 0 18px 16px;
}

.refresh-progress .progress-track {
  margin-top: 0;
}

.inline-error {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 10px 2px 0;
  color: #c2675b;
  font-size: 10px;
}

.library-operation-error {
  margin: 0;
  padding: 10px 18px;
  border-top: 1px solid var(--auralis-border-subtle);
}

.inline-error span {
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
}

.failure-section {
  border-top: 1px solid var(--auralis-border-subtle);
}

.failure-toggle {
  display: flex;
  gap: 9px;
  align-items: center;
  width: 100%;
  padding: 12px 18px;
  border: 0;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}

.failure-toggle:hover {
  background: var(--auralis-control-hover-bg);
}

.failure-badge {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 3px 6px;
  border-radius: 6px;
  color: #b76659;
  background: color-mix(in srgb, #c76d5f 12%, transparent);
  font-weight: 650;
}

.failure-badge span {
  width: 11px;
  height: 11px;
}

.failure-chevron {
  width: 12px;
  height: 12px;
  margin-left: auto;
}

.failure-content {
  padding: 0 18px 16px;
}

.failure-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--auralis-text-subtle);
  font-size: 9px;
}

.failure-toolbar button {
  border: 0;
  color: var(--auralis-text-muted);
  background: transparent;
  font-size: 9px;
  cursor: pointer;
}

.failure-toolbar button:hover:not(:disabled) {
  color: var(--auralis-text);
}

.failure-list {
  display: grid;
  max-height: 210px;
  gap: 7px;
  overflow: auto;
}

.failure-item {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--auralis-main-bg) 70%, transparent);
  font-size: 9px;
}

.failure-path {
  overflow: hidden;
  color: var(--auralis-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
}

.failure-item strong {
  font-weight: 500;
}

.failure-item small {
  color: var(--auralis-text-faint);
  font-size: 8px;
}

@keyframes settings-enter {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 680px) {
  .library-card-header {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .library-actions {
    grid-column: 1 / -1;
  }

  .library-actions button {
    flex: 1;
  }

  .maintenance-heading {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
