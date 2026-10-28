import { computed, onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import type { LibraryRoot, LibraryScanProgress, LibraryScanStatus } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { librarySettingsError } from '../utils/librarySettingsError'

export function useLibraryScanSettings() {
  const roots = ref<LibraryRoot[]>([])
  const scanStatus = ref<LibraryScanStatus | null>(null)
  const currentProgress = ref<LibraryScanProgress | null>(null)
  const isLoading = ref(false)
  const operationError = ref<string | null>(null)
  let active = false
  let unsubscribe: (() => void) | undefined
  let scanStatusRevision = 0
  const activeRoot = computed(() => readonly(roots).value[0] ?? null)
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
  async function refreshScanStatus(jobId?: number): Promise<void> {
    const revision = ++scanStatusRevision
    const nextStatus = await auralis.library.getScanStatus(jobId)
    if (!active || revision !== scanStatusRevision) return
    scanStatus.value = nextStatus
    if (currentProgress.value?.jobId !== nextStatus?.jobId) currentProgress.value = null
  }
  async function chooseFolder(): Promise<void> {
    isLoading.value = true
    operationError.value = null

    try {
      const result = await auralis.library.selectRoot()

      if (!result.canceled && result.root) {
        roots.value = [result.root]
        currentProgress.value = null
        await refreshScanStatus()
      }
    } catch (error) {
      operationError.value = librarySettingsError(error, 'settings.library.errors.selectFolder')
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
      currentProgress.value = null
      await refreshScanStatus(result.jobId)
    } catch (error) {
      operationError.value = librarySettingsError(error, 'settings.library.errors.startScan')
    } finally {
      isLoading.value = false
    }
  }

  async function cancelScan(): Promise<void> {
    if (!scanStatus.value) return

    operationError.value = null
    try {
      await auralis.library.cancelScan(scanStatus.value.jobId)
      await refreshScanStatus(scanStatus.value.jobId)
    } catch (error) {
      operationError.value = librarySettingsError(error, 'settings.library.errors.cancelScan')
    }
  }
  function readRoots() {
    return auralis.library.getRoots()
  }
  function publishRoots(value: LibraryRoot[]) {
    if (active) roots.value = value
  }
  function reportLoadError(error: unknown) {
    if (active)
      operationError.value = librarySettingsError(error, 'settings.library.errors.loadState')
  }
  onMounted(() => {
    active = true
    unsubscribe = auralis.library.onScanProgress(async (progress) => {
      if (scanStatus.value && progress.jobId < scanStatus.value.jobId) return
      try {
        currentProgress.value = progress
        if (scanStatus.value?.jobId === progress.jobId) {
          scanStatus.value = { ...scanStatus.value, ...progress }
        }
        await refreshScanStatus(progress.jobId)

        if (progress.status === 'completed') {
          const nextRoots = await auralis.library.getRoots()
          if (active && scanStatus.value?.jobId === progress.jobId) roots.value = nextRoots
        }
      } catch (error) {
        if (active) {
          operationError.value = librarySettingsError(error, 'settings.library.errors.loadState')
        }
      }
    })
  })
  onBeforeUnmount(() => {
    active = false
    unsubscribe?.()
  })
  return {
    scanStatus: readonly(scanStatus),
    isLoading: readonly(isLoading),
    operationError: readonly(operationError),
    activeRoot,
    isScanning,
    totalFiles,
    scannedFiles,
    failedFiles,
    progressPercent,
    readRoots,
    publishRoots,
    reportLoadError,
    refreshScanStatus,
    chooseFolder,
    startScan,
    cancelScan,
  }
}
