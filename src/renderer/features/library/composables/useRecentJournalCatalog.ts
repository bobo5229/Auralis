import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SharedLibraryCatalogLoad } from '@renderer/shared/catalog/sharedLibraryCatalogLoad'
import { getLibraryPresentationTracks } from '@renderer/shared/catalog/libraryPresentationTracks'

/** Page lifecycle and feedback; the shared client owns IPC pagination and cache invalidation. */
export function useRecentJournalCatalog(
  active: Readonly<Ref<boolean>>,
  library: Pick<AuralisApi['library'], 'onChanged' | 'onScanProgress'>,
  client: Pick<SharedLibraryCatalogLoad, 'load' | 'isSnapshotCurrent'>,
  reportError: (cause: unknown) => void,
) {
  const tracks = shallowRef<TrackListItem[]>([])
  const loaded = ref(false)
  const isLoading = ref(false)
  const error = shallowRef<unknown>(null)
  let disposed = false
  let dirty = true
  let running = false
  let revision = 0
  let forceFresh = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function flush(): Promise<void> {
    if (disposed || running || !active.value || !dirty) return
    clearTimeout(timer)
    timer = undefined
    running = true
    dirty = false
    isLoading.value = true
    const captured = revision
    const current = () => !disposed && active.value && captured === revision
    const freshness = forceFresh ? 'fresh' : 'current'
    forceFresh = false
    try {
      const snapshot = await client.load(current, freshness)
      if (!current() || !client.isSnapshotCurrent(snapshot)) {
        dirty = true
        return
      }
      tracks.value = getLibraryPresentationTracks(snapshot.tracks)
      loaded.value = true
      error.value = null
    } catch (cause) {
      if (current()) {
        error.value = cause
        reportError(cause)
      }
    } finally {
      running = false
      if (!disposed) {
        isLoading.value = false
        if (dirty && active.value) schedule()
      }
    }
  }
  function schedule(): void {
    // A fixed coalescing window also makes progress during a long import.
    if (!disposed && active.value && !timer)
      timer = setTimeout(() => {
        timer = undefined
        void flush()
      }, 180)
  }
  function changed(): void {
    revision += 1
    dirty = true
    schedule()
  }
  function refresh(): void {
    forceFresh = true
    revision += 1
    dirty = true
    error.value = null
    void flush()
  }
  const stopChanged = library.onChanged((event) => {
    if (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset') changed()
  })
  const stopScan = library.onScanProgress((event) => {
    if (event.status === 'completed') changed()
  })
  watch(
    active,
    (allowed) => {
      revision += 1
      if (allowed) {
        dirty = true
        void flush()
      } else {
        clearTimeout(timer)
        timer = undefined
      }
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    clearTimeout(timer)
    stopChanged()
    stopScan()
  })
  return { tracks, loaded, isLoading, error, refresh }
}
