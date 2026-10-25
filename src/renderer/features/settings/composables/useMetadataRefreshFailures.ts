import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import type { MetadataRefreshFailure } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { librarySettingsError } from '../utils/librarySettingsError'

export function useMetadataRefreshFailures() {
  const refreshFailures = ref<MetadataRefreshFailure[]>([])
  const refreshErrorMessage = ref<string | null>(null)
  const isClearingRefreshFailures = ref(false)
  const showRefreshFailures = ref(false)
  let active = false
  let unsubscribe: (() => void) | undefined
  async function clearRefreshFailures(): Promise<void> {
    if (isClearingRefreshFailures.value) return

    isClearingRefreshFailures.value = true
    refreshErrorMessage.value = null
    try {
      await auralis.metadata.clearRefreshFailures()
      refreshFailures.value = []
      showRefreshFailures.value = false
    } catch (error) {
      refreshErrorMessage.value = librarySettingsError(
        error,
        'settings.library.errors.clearFailures',
      )
    } finally {
      isClearingRefreshFailures.value = false
    }
  }
  function readFailures() {
    return auralis.metadata.listRefreshFailures()
  }
  function publishFailures(value: MetadataRefreshFailure[]) {
    if (active) refreshFailures.value = value
  }
  function toggleFailures() {
    showRefreshFailures.value = !showRefreshFailures.value
  }
  onMounted(() => {
    active = true
    unsubscribe = auralis.metadata.onRefreshProgress(async (progress) => {
      if (progress.status === 'completed' || progress.status === 'failed') {
        try {
          const failures = await auralis.metadata.listRefreshFailures()
          if (active) refreshFailures.value = failures
        } catch (error) {
          if (active) {
            refreshErrorMessage.value = librarySettingsError(
              error,
              'settings.library.errors.loadState',
            )
          }
        }
      }
    })
  })
  onBeforeUnmount(() => {
    active = false
    unsubscribe?.()
  })
  return {
    refreshFailures: readonly(refreshFailures),
    refreshErrorMessage: readonly(refreshErrorMessage),
    isClearingRefreshFailures: readonly(isClearingRefreshFailures),
    showRefreshFailures: readonly(showRefreshFailures),
    readFailures,
    publishFailures,
    clearRefreshFailures,
    toggleFailures,
  }
}
