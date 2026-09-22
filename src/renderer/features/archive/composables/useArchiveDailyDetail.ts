import { nextTick, onScopeDispose, ref } from 'vue'
import type { DailyListeningDetail } from '@shared/types/archive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { ArchiveDailyDetailDialogModel } from '../utils/archiveDailyDetailState'
import type { CalendarDay } from './useArchiveCalendar'

export function useArchiveDailyDetail(
  getDailyListeningDetail: (date: string) => Promise<DailyListeningDetail>,
) {
  const dailyDetail = ref<DailyListeningDetail | null>(null)
  const isDetailLoading = ref(false)
  const detailError = ref<string | null>(null)
  let detailRequestId = 0
  let detailDialogId = 0
  const detailDialog = ref<ArchiveDailyDetailDialogModel | null>(null)
  let closeTimer: number | null = null

  function cancelCloseTimer(): void {
    if (closeTimer === null) return
    window.clearTimeout(closeTimer)
    closeTimer = null
  }
  async function openDailyDetail(
    event: MouseEvent | KeyboardEvent,
    day: CalendarDay,
  ): Promise<void> {
    if (day.isFuture) return

    cancelCloseTimer()

    // Increment request ID so any in-flight request for a previous day is discarded
    const requestId = ++detailRequestId
    // Bump dialog instance counter so any close timer from a previous instance
    // (even for the same date) won't clear this newly opened dialog
    ++detailDialogId
    const dateKey = day.date

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    dailyDetail.value = null
    detailError.value = null
    isDetailLoading.value = true
    detailDialog.value = {
      date: dateKey,
      label: day.label,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      expanded: false,
    }

    await nextTick()
    if (detailDialog.value?.date === dateKey) {
      detailDialog.value.expanded = true
    }

    try {
      const detail = await getDailyListeningDetail(dateKey)
      // Discard stale responses and only apply the latest request.
      if (requestId !== detailRequestId) return
      if (detailDialog.value?.date !== dateKey) return
      dailyDetail.value = detail
    } catch (error) {
      if (requestId !== detailRequestId) return
      if (detailDialog.value?.date !== dateKey) return
      rendererDiagnostics.error({
        scope: 'archive.daily-detail',
        message: 'Failed to load daily listening detail',
        context: { dateKey },
        cause: error,
      })
      detailError.value = '无法读取当日播放记录'
    } finally {
      if (requestId === detailRequestId) {
        isDetailLoading.value = false
      }
    }
  }
  function closeDailyDetail(): void {
    if (!detailDialog.value) return
    cancelCloseTimer()
    const closeToken = detailDialogId
    detailDialog.value.expanded = false
    closeTimer = window.setTimeout(() => {
      closeTimer = null
      // Guard: only null if the dialog instance has not been replaced.
      // Using an instance counter avoids the same-date race: closing day X
      // and reopening day X within the 240ms animation window would pass a
      // date-based guard but must not clear the new instance.
      if (detailDialogId === closeToken) {
        detailDialog.value = null
        dailyDetail.value = null
        detailError.value = null
      }
    }, 240)
  }
  function clearDailyDetail(): void {
    ++detailRequestId
    ++detailDialogId
    cancelCloseTimer()
    detailDialog.value = null
    dailyDetail.value = null
    detailError.value = null
    isDetailLoading.value = false
  }
  onScopeDispose(clearDailyDetail)
  return {
    dailyDetail,
    isDetailLoading,
    detailError,
    detailDialog,
    openDailyDetail,
    closeDailyDetail,
    clearDailyDetail,
  }
}
