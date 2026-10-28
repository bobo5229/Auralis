import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { DailyPlayCount, DailyTopTrack } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

/** Follows the selected date while the daily track list is mounted. */
export function useDayTopTracks(
  date: MaybeRefOrGetter<string>,
  archive: Pick<AuralisApi['archive'], 'getDayTopTracks'>,
  library: Pick<AuralisApi['library'], 'onChanged'>,
  daySummary: MaybeRefOrGetter<DailyPlayCount | undefined>,
) {
  const tracks = shallowRef<DailyTopTrack[]>([])
  const loading = ref(false)
  const failed = ref(false)
  let revision = 0
  let disposed = false

  function clear() {
    revision++
    tracks.value = []
    loading.value = false
    failed.value = false
  }
  async function refresh() {
    if (disposed) return
    const request = ++revision
    loading.value = true
    failed.value = false
    try {
      const result = await archive.getDayTopTracks(toValue(date))
      if (!disposed && request === revision) tracks.value = result
    } catch (cause) {
      if (!disposed && request === revision) {
        failed.value = true
        rendererDiagnostics.warn({
          scope: 'archive.day',
          message: 'Could not load daily top tracks',
          cause,
        })
      }
    } finally {
      if (!disposed && request === revision) loading.value = false
    }
  }
  const unsubscribe = library.onChanged((event) => {
    if (disposed) return
    if (event.reason === 'play-stats-reset') clear()
    else if (event.reason === 'metadata-refresh' || event.reason === 'file-change') void refresh()
  })
  watch(() => toValue(date), clear, { flush: 'sync' })
  watch(
    [
      () => toValue(date),
      () => {
        const summary = toValue(daySummary)
        return summary?.date === toValue(date)
          ? `${summary.playCount}:${summary.durationSeconds}`
          : null
      },
    ],
    () => {
      void refresh()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    disposed = true
    clear()
    unsubscribe()
  })
  return { tracks, loading, failed, refresh }
}
