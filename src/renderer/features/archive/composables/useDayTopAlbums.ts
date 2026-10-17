import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { DailyTopAlbum } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useDayTopAlbums(
  date: MaybeRefOrGetter<string | null>,
  archive: Pick<AuralisApi['archive'], 'getDayTopAlbums'>,
  library: Pick<AuralisApi['library'], 'onChanged'>,
) {
  const albums = shallowRef<DailyTopAlbum[]>([])
  const isLoading = ref(false)
  const hasError = ref(false)
  let revision = 0
  let disposed = false

  async function refresh(): Promise<void> {
    if (disposed) return
    const target = toValue(date)
    const requestRevision = ++revision
    if (!target) {
      albums.value = []
      isLoading.value = false
      hasError.value = false
      return
    }
    isLoading.value = true
    hasError.value = false
    try {
      const result = await archive.getDayTopAlbums(target)
      if (!disposed && revision === requestRevision) albums.value = result
    } catch (cause) {
      if (!disposed && revision === requestRevision) {
        hasError.value = true
        rendererDiagnostics.warn({
          scope: 'archive.day-albums',
          message: 'Could not load daily top albums',
          cause,
        })
      }
    } finally {
      if (!disposed && revision === requestRevision) isLoading.value = false
    }
  }

  const unsubscribe = library.onChanged((event) => {
    if (disposed || (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset'))
      return
    if (event.reason === 'play-stats-reset') albums.value = []
    void refresh()
  })
  onScopeDispose(() => {
    disposed = true
    revision++
    unsubscribe()
  })
  watch(
    () => toValue(date),
    () => {
      albums.value = []
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )

  return { albums, isLoading, hasError, refresh }
}
