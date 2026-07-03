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
const unsubscribe = ref<(() => void) | null>(null)

// Metadata refresh state
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
  if (totalFiles.value === 0) {
    return 0
  }

  return Math.min(100, Math.round((scannedFiles.value / totalFiles.value) * 100))
})
const statusLabel = computed(() => {
  if (currentProgress.value?.message) {
    return currentProgress.value.message
  }

  if (!scanStatus.value) {
    return 'Not scanned'
  }

  return scanStatus.value.status
})

const refreshProgressPercent = computed(() => {
  if (!refreshStatus.value || refreshStatus.value.totalTracks === 0) {
    return 0
  }

  return Math.min(
    100,
    Math.round((refreshStatus.value.processedTracks / refreshStatus.value.totalTracks) * 100),
  )
})

const refreshStatusLabel = computed(() => {
  if (!refreshStatus.value) {
    return ''
  }

  if (refreshStatus.value.status === 'completed') {
    return `Completed - ${refreshStatus.value.processedTracks} updated, ${refreshStatus.value.failedTracks} failed`
  }

  return `Refreshing... ${refreshStatus.value.processedTracks} / ${refreshStatus.value.totalTracks}`
})

async function loadLibraryState(): Promise<void> {
  const [nextRoots, nextScanStatus, nextFailures] = await Promise.all([
    auralis.library.getRoots(),
    auralis.library.getScanStatus(),
    auralis.metadata.listRefreshFailures(),
  ])

  if (!isMounted.value) {
    return
  }

  roots.value = nextRoots
  scanStatus.value = nextScanStatus
  refreshFailures.value = nextFailures
}

async function clearRefreshFailures(): Promise<void> {
  if (isClearingRefreshFailures.value) return

  isClearingRefreshFailures.value = true
  refreshErrorMessage.value = null
  try {
    await auralis.metadata.clearRefreshFailures()
    refreshFailures.value = []
  } catch (error) {
    refreshErrorMessage.value =
      error instanceof Error ? error.message : 'Unable to clear refresh failure logs'
  } finally {
    isClearingRefreshFailures.value = false
  }
}

async function chooseFolder(): Promise<void> {
  isLoading.value = true

  try {
    const result = await auralis.library.selectRoot()

    if (!result.canceled && result.root) {
      roots.value = [result.root]
      scanStatus.value = await auralis.library.getScanStatus()
    }
  } finally {
    isLoading.value = false
  }
}

async function startScan(): Promise<void> {
  if (!activeRoot.value) {
    return
  }

  isLoading.value = true

  try {
    const result = await auralis.library.startScan(activeRoot.value.id)
    scanStatus.value = await auralis.library.getScanStatus(result.jobId)
    currentProgress.value = null
  } finally {
    isLoading.value = false
  }
}

async function cancelScan(): Promise<void> {
  if (!scanStatus.value) {
    return
  }

  await auralis.library.cancelScan(scanStatus.value.jobId)
  scanStatus.value = await auralis.library.getScanStatus(scanStatus.value.jobId)
}

async function refreshMissingMetadata(): Promise<void> {
  if (isRefreshing.value) {
    return
  }

  isRefreshing.value = true
  refreshStatus.value = null
  refreshErrorMessage.value = null

  try {
    const result = await auralis.metadata.refreshMissing()

    if (!isMounted.value) {
      return
    }

    refreshJobId.value = result.jobId
  } catch (error) {
    if (!isMounted.value) {
      return
    }

    refreshErrorMessage.value =
      error instanceof Error ? error.message : 'Unable to refresh missing metadata'
    isRefreshing.value = false
  }
}

onMounted(async () => {
  isMounted.value = true

  unsubscribe.value = auralis.library.onScanProgress(async (progress) => {
    if (!scanStatus.value || scanStatus.value.jobId === progress.jobId) {
      currentProgress.value = progress
      const nextScanStatus = await auralis.library.getScanStatus(progress.jobId)

      if (!isMounted.value) {
        return
      }

      scanStatus.value = nextScanStatus
    }

    if (progress.status === 'completed') {
      const nextRoots = await auralis.library.getRoots()

      if (isMounted.value) {
        roots.value = nextRoots
      }
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

      if (isMounted.value) {
        refreshFailures.value = failures
      }
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
  <section
    class="mt-6 rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)]/70 p-5"
  >
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 class="text-base font-semibold">Music Library</h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-[var(--auralis-text-muted)]">
          Choose a local music folder and let Auralis build its private archive in the background.
        </p>
      </div>

      <div class="flex shrink-0 gap-2">
        <button
          class="rounded bg-[var(--auralis-control-active-bg)] px-3 py-2 text-sm font-medium text-[var(--auralis-text)] shadow-sm transition hover:bg-[var(--auralis-control-hover-bg)] disabled:opacity-45"
          type="button"
          :disabled="isLoading || isScanning"
          @click="chooseFolder"
        >
          Choose Folder
        </button>
        <button
          v-if="!isScanning"
          class="rounded bg-[var(--auralis-control-primary-bg)] px-3 py-2 text-sm font-medium text-[var(--auralis-control-primary-text)] transition opacity-92 hover:opacity-100 disabled:opacity-45"
          type="button"
          :disabled="isLoading || !activeRoot"
          @click="startScan"
        >
          {{ scanStatus ? 'Rescan' : 'Scan Library' }}
        </button>
        <button
          v-else
          class="rounded bg-brass px-3 py-2 text-sm font-medium text-paper transition hover:bg-brass/88"
          type="button"
          @click="cancelScan"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="mt-5 grid gap-3 text-sm">
      <div class="grid gap-1 md:grid-cols-[140px_1fr]">
        <div class="text-[var(--auralis-text-subtle)]">Folder</div>
        <div class="break-all">{{ activeRoot?.path ?? 'No folder selected' }}</div>
      </div>
      <div class="grid gap-1 md:grid-cols-[140px_1fr]">
        <div class="text-[var(--auralis-text-subtle)]">Status</div>
        <div>{{ statusLabel }}</div>
      </div>
      <div class="grid gap-1 md:grid-cols-[140px_1fr]">
        <div class="text-[var(--auralis-text-subtle)]">Last scanned</div>
        <div>{{ activeRoot?.lastScannedAt ?? 'Never' }}</div>
      </div>
    </div>

    <div class="mt-5">
      <div class="h-2 overflow-hidden rounded bg-[var(--auralis-progress-track)]">
        <div
          class="h-full bg-[var(--auralis-progress-fill)] transition-all"
          :style="{ width: `${progressPercent}%` }"
        ></div>
      </div>
      <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--auralis-text-subtle)]">
        <span>{{ scannedFiles }} / {{ totalFiles }} scanned</span>
        <span>{{ failedFiles }} failed</span>
        <span>{{ progressPercent }}%</span>
      </div>
    </div>

    <div class="mt-6 border-t border-[var(--auralis-border-subtle)] pt-5">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-medium">Metadata Refresh</h3>
          <p class="mt-1 text-xs text-[var(--auralis-text-muted)]">
            Re-parse audio files to fill in missing title, artist, album, lyrics, and artwork.
          </p>
        </div>
        <button
          class="rounded bg-[var(--auralis-control-active-bg)] px-3 py-2 text-sm font-medium text-[var(--auralis-text)] shadow-sm transition hover:bg-[var(--auralis-control-hover-bg)] disabled:opacity-45"
          type="button"
          :disabled="isRefreshing || isScanning"
          @click="refreshMissingMetadata"
        >
          {{ isRefreshing ? 'Refreshing...' : 'Refresh Missing Metadata' }}
        </button>
      </div>

      <div v-if="refreshStatus" class="mt-3">
        <div class="h-1.5 overflow-hidden rounded bg-[var(--auralis-progress-track)]">
          <div
            class="h-full bg-[var(--auralis-progress-fill)] transition-all"
            :style="{ width: `${refreshProgressPercent}%` }"
          ></div>
        </div>
        <div class="mt-1.5 text-xs text-[var(--auralis-text-subtle)]">
          {{ refreshStatusLabel }}
        </div>
      </div>

      <div v-if="refreshErrorMessage" class="mt-3 text-xs text-[var(--auralis-text-muted)]">
        {{ refreshErrorMessage }}
      </div>

      <div v-if="refreshFailures.length > 0" class="mt-5">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-xs font-medium text-[var(--auralis-text-muted)]">
            Recent refresh failures
          </div>
          <button
            type="button"
            class="text-xs text-[var(--auralis-text-muted)] transition hover:text-[var(--auralis-text)] disabled:cursor-default disabled:opacity-50"
            :disabled="isClearingRefreshFailures"
            @click="clearRefreshFailures"
          >
            {{ isClearingRefreshFailures ? '清除中…' : '清除日志' }}
          </button>
        </div>
        <div class="grid max-h-52 gap-2 overflow-auto text-xs">
          <div
            v-for="failure in refreshFailures"
            :key="failure.id"
            class="rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-main-bg)]/70 p-2"
          >
            <div class="truncate text-[var(--auralis-text-muted)]">
              {{ failure.filePath ?? `Track ${failure.trackId ?? 'unknown'}` }}
            </div>
            <div class="mt-1 text-[var(--auralis-text)]">{{ failure.reason }}</div>
            <div class="mt-1 text-[var(--auralis-text-faint)]">
              Job {{ failure.jobId }} - {{ failure.createdAt }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
