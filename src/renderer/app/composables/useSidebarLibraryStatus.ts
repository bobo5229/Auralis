import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { LibraryScanProgress } from '@shared/types/libraryScan'
import { useLibraryScanStart } from '@renderer/features/library/composables/useLibraryScanStart'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

type LibraryStatusApi = Pick<
  AuralisApi['library'],
  'getRoots' | 'getScanStatus' | 'onScanProgress' | 'onChanged' | 'startScan'
>
type ScanSummary = Pick<
  LibraryScanProgress,
  'jobId' | 'status' | 'totalFiles' | 'scannedFiles' | 'failedFiles'
>

/** Shell status follows scans started anywhere, without polling or owning the scan job. */
export function useSidebarLibraryStatus(api: LibraryStatusApi) {
  const hasRoots = ref(false)
  const loaded = ref(false)
  const readFailed = ref(false)
  const startFailed = ref(false)
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
      const [roots, nextScan] = await Promise.all([api.getRoots(), api.getScanStatus()])
      if (disposed || request !== requestRevision) return
      hasRoots.value = roots.length > 0
      loaded.value = true
      readFailed.value = false
      if (progress === progressRevision) {
        applyScan(nextScan)
        startFailed.value = false
      }
    } catch (cause) {
      if (disposed || request !== requestRevision) return
      loaded.value = true
      readFailed.value = true
      rendererDiagnostics.error({
        scope: 'sidebar.status',
        message: 'Could not read library status',
        cause,
      })
    }
  }

  const starter = useLibraryScanStart({
    getLibraryRoots: async () => {
      const roots = await api.getRoots()
      if (!disposed) {
        hasRoots.value = roots.length > 0
        loaded.value = true
        readFailed.value = false
      }
      return roots
    },
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
    startFailed.value = false
    try {
      await starter.refreshLibrary()
    } catch (cause) {
      if (disposed) return
      startFailed.value = true
      rendererDiagnostics.error({
        scope: 'sidebar.status',
        message: 'Could not start library scan',
        cause,
      })
    }
  }

  const status = computed(() => {
    if (scan.value?.status === 'scanning')
      return scan.value.totalFiles > 0 ? 'progress' : 'scanning'
    if (starter.isStartingLibraryRefresh.value) return 'starting'
    if (startFailed.value) return 'failed'
    if (readFailed.value) return 'readFailed'
    if (!loaded.value) return 'loading'
    if (!hasRoots.value) return 'notConfigured'
    if (!scan.value || scan.value.status === 'idle') return 'waiting'
    if (scan.value.status === 'completed') return scan.value.failedFiles > 0 ? 'warnings' : 'ready'
    return scan.value.status
  })
  const tone = computed(() => {
    if (status.value === 'ready') return 'success'
    if (status.value === 'warnings' || status.value === 'canceled') return 'warning'
    if (status.value === 'failed' || status.value === 'readFailed') return 'error'
    return 'neutral'
  })
  const counts = computed(() => ({
    scanned: scan.value?.scannedFiles ?? 0,
    total: scan.value?.totalFiles ?? 0,
  }))

  onMounted(() => {
    unsubscribeProgress = api.onScanProgress((progress) => {
      if (disposed || (scan.value && progress.jobId < scan.value.jobId)) return
      ++progressRevision
      applyScan(progress)
      startFailed.value = false
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

  return { status, tone, counts, isRefreshing, refreshLibrary, reload }
}
