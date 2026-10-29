import { affectsArchiveYear } from '../utils/affectsArchiveYear'
import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useAnnualPlayCounts(
  year: MaybeRefOrGetter<number>,
  archive: Pick<AuralisApi['archive'], 'getAnnualPlayCounts'>,
  library: Pick<AuralisApi['library'], 'onChanged'>,
) {
  const days = shallowRef<DailyPlayCount[]>([])
  const isLoading = ref(true)
  const hasError = ref(false)
  const settledYear = ref<number | null>(null)
  let revision = 0
  let disposed = false

  async function refresh(): Promise<void> {
    if (disposed) return
    const requestRevision = ++revision
    const targetYear = toValue(year)
    isLoading.value = true
    hasError.value = false
    try {
      const result = await archive.getAnnualPlayCounts(targetYear)
      if (!disposed && revision === requestRevision) {
        const unchanged =
          result.length === days.value.length &&
          result.every((day, index) => {
            const previous = days.value[index]
            return (
              day.date === previous.date &&
              day.playCount === previous.playCount &&
              day.durationSeconds === previous.durationSeconds
            )
          })
        if (!unchanged) days.value = result
      }
    } catch (cause) {
      if (!disposed && revision === requestRevision) {
        hasError.value = true
        rendererDiagnostics.warn({
          scope: 'archive.play-counts',
          message: 'Could not load annual listening counts',
          cause,
        })
      }
    } finally {
      if (!disposed && revision === requestRevision) {
        isLoading.value = false
        settledYear.value = targetYear
      }
    }
  }

  const unsubscribe = library.onChanged((event) => {
    if (!affectsArchiveYear(event, toValue(year))) return
    if (disposed || (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset'))
      return
    if (event.reason === 'play-stats-reset') days.value = []
    void refresh()
  })
  onScopeDispose(() => {
    disposed = true
    revision++
    unsubscribe()
  })
  watch(
    () => toValue(year),
    () => {
      settledYear.value = null
      days.value = []
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )

  return { days, isLoading, hasError, settledYear }
}
