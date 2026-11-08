import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { LibraryScanProgress } from '@shared/types/libraryScan'
import { useLibraryScanStart } from '@renderer/features/library/composables/useLibraryScanStart'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

type LibraryStatusApi = Pick<
  AuralisApi['library'],
  'getRoots' | 'getScanStatus' | 'onScanProgress' | 'onChanged' | 'startScan'
>
type ScanSummary = Pick<LibraryScanProgress, 'jobId' | 'status'>

/** Keeps the refresh action in sync with scans started anywhere, without polling. */
export function useSidebarLibraryStatus(api: LibraryStatusApi) {
  const scan = shallowRef<ScanSummary | null>(null)
  let disposed = false
  let requestRevision = 0
  let progressRevision = 0
  let unsubscribeProgress: (() => void) | undefined
  let unsubscribeChanged: (() => void) | undefined

  function applyScan(next: ScanSummary | null): void {
    const current = scan.value
    if (current && next) {
      if (next.jobId < current.jobId) return
      // A queued scanning message must not reopen a job that already finished.
      if (
        next.jobId === current.jobId &&
        ['completed', 'canceled', 'failed'].includes(current.status) &&
        next.status === 'scanning'
      )
        return
    }
    scan.value = next
  }

  async function reload(): Promise<void> {
    if (disposed) return
    const request = ++requestRevision
    const progress = progressRevision
    try {
      const nextScan = await api.getScanStatus()
      if (disposed || request !== requestRevision) return
      if (progress === progressRevision) {
        applyScan(nextScan)
      }
    } catch (cause) {
      if (disposed || request !== requestRevision) return
      rendererDiagnostics.error({
        scope: 'sidebar.status',
        message: 'Could not read library status',
        cause,
      })
    }
  }

  const starter = useLibraryScanStart({
    getLibraryRoots: () => api.getRoots(),
    startLibraryScan: async (rootId) => {
      if (disposed || scan.value?.status === 'scanning') return
      const result = await api.startScan(rootId)
      await reload()
      return result
    },
  })
  const isRefreshing = computed(
    () => starter.isStartingLibraryRefresh.value || scan.value?.status === 'scanning',
  )

  async function refreshLibrary(): Promise<void> {
    if (disposed || isRefreshing.value) return
    ++requestRevision
    try {
      await starter.refreshLibrary()
    } catch (cause) {
      if (disposed) return
      rendererDiagnostics.error({
        scope: 'sidebar.status',
        message: 'Could not start library scan',
        cause,
      })
    }
  }

  onMounted(() => {
    unsubscribeProgress = api.onScanProgress((progress) => {
      if (disposed || (scan.value && progress.jobId < scan.value.jobId)) return
      ++progressRevision
      applyScan(progress)
    })
    unsubscribeChanged = api.onChanged((event) => {
      if (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset')
        void reload()
    })
    void reload()
  })
  onBeforeUnmount(() => {
    disposed = true
    ++requestRevision
    unsubscribeProgress?.()
    unsubscribeChanged?.()
  })

  return { isRefreshing, refreshLibrary, reload }
}
