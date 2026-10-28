import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { AnnualSummary } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useAnnualSummary(
  year: MaybeRefOrGetter<number>,
  archive: Pick<AuralisApi['archive'], 'getAnnualSummary'>,
  library: Pick<AuralisApi['library'], 'onChanged'>,
) {
  const summary = shallowRef<AnnualSummary | null>(null)
  const loading = ref(true)
  const failed = ref(false)
  let revision = 0
  let disposed = false
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  async function refresh() {
    if (disposed) return
    clearTimeout(refreshTimer)
    const request = ++revision
    loading.value = true
    failed.value = false
    try {
      const result = await archive.getAnnualSummary(toValue(year))
      if (!disposed && request === revision) summary.value = result
    } catch (cause) {
      if (!disposed && request === revision) {
        failed.value = true
        rendererDiagnostics.warn({
          scope: 'archive.annual-summary',
          message: 'Could not load the annual summary',
          cause,
        })
      }
    } finally {
      if (!disposed && request === revision) loading.value = false
    }
  }
  const unsubscribe = library.onChanged((event) => {
    if (disposed) return
    // Invalidate outstanding reads immediately, including during the refresh debounce.
    revision++
    clearTimeout(refreshTimer)
    if (event.reason === 'play-stats-reset') {
      summary.value = null
      void refresh()
    } else refreshTimer = setTimeout(() => void refresh(), 250)
  })
  watch(
    () => toValue(year),
    () => {
      summary.value = null
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    revision++
    clearTimeout(refreshTimer)
    unsubscribe()
  })
  return { summary, loading, failed, refresh }
}
