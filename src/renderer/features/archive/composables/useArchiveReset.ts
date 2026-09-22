import { onScopeDispose, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useArchiveReset(
  resetPlayStats: () => Promise<void>,
  afterReset: () => Promise<void>,
) {
  const showResetConfirmation = ref(false)
  const isResetting = ref(false)
  const isHoldingReset = ref(false)
  const resetError = ref<string | null>(null)
  const RESET_HOLD_MS = 3000
  let resetHoldTimer: number | null = null
  function openResetConfirmation(): void {
    resetError.value = null
    showResetConfirmation.value = true
  }

  function closeResetConfirmation(): void {
    if (isResetting.value) return
    cancelResetHold()
    showResetConfirmation.value = false
    resetError.value = null
  }

  function startResetHold(): void {
    if (isResetting.value || isHoldingReset.value || resetHoldTimer !== null) return
    isHoldingReset.value = true
    resetHoldTimer = window.setTimeout(() => {
      resetHoldTimer = null
      isHoldingReset.value = false
      void resetAllPlayStats()
    }, RESET_HOLD_MS)
  }

  function cancelResetHold(): void {
    if (resetHoldTimer !== null) {
      window.clearTimeout(resetHoldTimer)
      resetHoldTimer = null
    }
    isHoldingReset.value = false
  }

  function handleResetKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    startResetHold()
  }

  function handleResetKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') cancelResetHold()
  }

  async function resetAllPlayStats(): Promise<void> {
    if (isResetting.value) return
    isResetting.value = true
    resetError.value = null

    try {
      await resetPlayStats()
      showResetConfirmation.value = false
      await afterReset()
    } catch (error) {
      rendererDiagnostics.error({
        scope: 'archive.playback-data',
        message: 'Failed to reset playback data',
        cause: error,
      })
      resetError.value = '无法重置播放数据'
    } finally {
      isResetting.value = false
    }
  }
  onScopeDispose(cancelResetHold)
  return {
    showResetConfirmation,
    isResetting,
    isHoldingReset,
    resetError,
    openResetConfirmation,
    closeResetConfirmation,
    startResetHold,
    cancelResetHold,
    handleResetKeyDown,
    handleResetKeyUp,
  }
}
