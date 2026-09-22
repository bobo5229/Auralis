import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import { invalidateAlbumDetailSnapshot } from '../albumDetailSnapshot'

/** Keep the cached page fresh without rebuilding its grid during route transitions. */
export function useAlbumCatalog(
  library: Pick<AuralisApi['library'], 'getTracks' | 'onChanged'>,
  canRefresh: Readonly<Ref<boolean>>,
  reportError: (error: unknown) => void,
) {
  const tracks = shallowRef<TrackListItem[]>([])
  const isLoading = ref(true)
  const error = shallowRef<unknown>(null)
  let disposed = false
  let running = false
  let dirty = true
  let revision = 0
  let loaded = false

  async function flush(): Promise<void> {
    if (disposed || running || !dirty || !canRefresh.value) return
    running = true
    dirty = false
    let failed = false
    const requestRevision = revision
    error.value = null
    if (!loaded) isLoading.value = true
    try {
      const result = await library.getTracks()
      if (disposed) return
      if (!canRefresh.value || revision !== requestRevision) {
        dirty = true
        return
      }
      tracks.value = result
      loaded = true
    } catch (cause) {
      if (!disposed && revision === requestRevision) {
        failed = true
        dirty = true
        if (!loaded) error.value = cause
        reportError(cause)
      }
    } finally {
      running = false
      if (!disposed) {
        isLoading.value = !loaded && dirty && !failed
        // Events arriving during a request collapse into one latest refresh.
        if (dirty && canRefresh.value && !failed) void flush()
      }
    }
  }

  function refresh(): void {
    revision += 1
    dirty = true
    void flush()
  }

  const unsubscribe = library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
      // Visible cards do not show play counts. A cached page must still catch up
      // before its next visit is used to seed another detail snapshot.
      if (!canRefresh.value) {
        revision += 1
        dirty = true
      }
      return
    }
    invalidateAlbumDetailSnapshot()
    refresh()
  })
  watch(
    canRefresh,
    (allowed) => {
      if (allowed) void flush()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    disposed = true
    unsubscribe()
  })

  return { tracks, isLoading, error, refresh }
}
