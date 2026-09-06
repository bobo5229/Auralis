import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import type { AmdlLogEvent, AmdlTaskProgress } from '@shared/types/amdl'
import type { AuralisApi } from '@shared/ipc/api'

export const MAX_LOG_LINES = 500

function getDefaultClient(): AuralisApi {
  if (typeof window !== 'undefined' && 'auralis' in window) {
    return (window as unknown as { auralis: AuralisApi }).auralis
  }
  return undefined as unknown as AuralisApi
}

export interface UseAmdlDownloadOptions {
  client?: AuralisApi
  maxLogs?: number
}

export function useAmdlDownload(options: UseAmdlDownloadOptions = {}) {
  const client = options.client ?? getDefaultClient()
  const maxLogs = options.maxLogs ?? MAX_LOG_LINES

  const currentTaskId = ref<string | null>(null)
  const currentTask = ref<AmdlTaskProgress | null>(null)
  const logs = ref<AmdlLogEvent[]>([])
  const isStarting = ref(false)
  const startError = ref<string | null>(null)

  const isRunning = computed(() => {
    const state = currentTask.value?.state
    return state === 'starting' || state === 'running'
  })

  // Append log keeping within maxLogs ring buffer
  function appendLog(log: AmdlLogEvent): void {
    if (log.taskId !== currentTaskId.value) {
      return
    }
    if (logs.value.length >= maxLogs) {
      logs.value = [...logs.value.slice(logs.value.length - maxLogs + 1), log]
    } else {
      logs.value.push(log)
    }
  }

  // Handle incoming progress updates
  function handleProgress(progress: AmdlTaskProgress): void {
    // If we haven't assigned currentTaskId yet or if it matches
    if (!currentTaskId.value) {
      currentTaskId.value = progress.taskId
      currentTask.value = progress
      return
    }

    if (progress.taskId === currentTaskId.value) {
      currentTask.value = progress
    }
  }

  // Subscribe to download events
  const unsubProgress = client.download.onProgress((progress) => {
    handleProgress(progress)
  })

  const unsubLog = client.download.onLog((log) => {
    appendLog(log)
  })

  function cleanup(): void {
    unsubProgress()
    unsubLog()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      cleanup()
    })
  }

  async function refreshStatus(): Promise<void> {
    if (!currentTaskId.value) return
    try {
      const status = await client.download.getStatus(currentTaskId.value)
      if (status && status.taskId === currentTaskId.value) {
        currentTask.value = status
      }
    } catch {
      // Ignore network / transient errors on poll
    }
  }

  async function startDownload(rawUrl: string): Promise<boolean> {
    if (isRunning.value || isStarting.value) {
      return false
    }

    const trimmed = rawUrl.trim()
    if (!trimmed) {
      startError.value = 'URL is required'
      return false
    }

    isStarting.value = true
    startError.value = null

    try {
      const result = await client.download.start(trimmed)
      if (!result.ok || !result.taskId) {
        startError.value = result.error ?? 'Failed to start download'
        return false
      }

      currentTaskId.value = result.taskId
      currentTask.value = null
      logs.value = []

      // Fetch initial status immediately to avoid race with initial progress
      try {
        const initialStatus = await client.download.getStatus(result.taskId)
        if (initialStatus) {
          currentTask.value = initialStatus
        }
      } catch {
        // Fall back to event updates
      }

      return true
    } catch (error) {
      startError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isStarting.value = false
    }
  }

  async function cancelDownload(): Promise<boolean> {
    if (!currentTaskId.value) {
      return false
    }

    try {
      const result = await client.download.cancel(currentTaskId.value)
      if (!result.ok && result.error) {
        startError.value = result.error
      }
      return result.ok
    } catch (error) {
      startError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  return {
    currentTaskId,
    currentTask,
    logs,
    isStarting,
    isRunning,
    startError,
    startDownload,
    cancelDownload,
    refreshStatus,
    cleanup,
  }
}

export type UseAmdlDownloadReturn = ReturnType<typeof useAmdlDownload>
