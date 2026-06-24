<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LibraryRoot, LibraryScanProgress, LibraryScanStatus } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'

const roots = ref<LibraryRoot[]>([])
const scanStatus = ref<LibraryScanStatus | null>(null)
const currentProgress = ref<LibraryScanProgress | null>(null)
const isLoading = ref(false)
const unsubscribe = ref<(() => void) | null>(null)

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

async function loadLibraryState(): Promise<void> {
  roots.value = await auralis.library.getRoots()
  scanStatus.value = await auralis.library.getScanStatus()
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

onMounted(async () => {
  unsubscribe.value = auralis.library.onScanProgress(async (progress) => {
    if (!scanStatus.value || scanStatus.value.jobId === progress.jobId) {
      currentProgress.value = progress
      scanStatus.value = await auralis.library.getScanStatus(progress.jobId)
    }

    if (progress.status === 'completed') {
      roots.value = await auralis.library.getRoots()
    }
  })

  await loadLibraryState()
})

onBeforeUnmount(() => {
  unsubscribe.value?.()
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
  </section>
</template>
