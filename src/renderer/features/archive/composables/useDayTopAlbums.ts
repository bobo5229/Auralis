import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { DailyPlayCount, DailyTopAlbum } from '@shared/types/listeningArchive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export function useDayTopAlbums(
  date: MaybeRefOrGetter<string | null>,
  archive: Pick<AuralisApi['archive'], 'getDayTopAlbums'>,
  library: Pick<AuralisApi['library'], 'onChanged'>,
  daySummary: MaybeRefOrGetter<DailyPlayCount | undefined>,
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
      if (!disposed && revision === requestRevision) {
        const unchanged =
          result.length === albums.value.length &&
          result.every((album, index) => {
            const previous = albums.value[index]
            return (
              album.album === previous.album &&
              album.albumArtist === previous.albumArtist &&
              album.artworkCacheKey === previous.artworkCacheKey &&
              album.playCount === previous.playCount &&
              album.durationSeconds === previous.durationSeconds &&
              album.trackCount === previous.trackCount
            )
          })
        if (!unchanged) albums.value = result
      }
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
    if (disposed || event.reason !== 'play-stats-reset') return
    // Reset is authoritative; discard cached data and any outstanding old read
    // immediately. The annual summary drives the next relevant daily read.
    revision++
    albums.value = []
    isLoading.value = false
    hasError.value = false
  })
  onScopeDispose(() => {
    disposed = true
    revision++
    unsubscribe()
  })
  watch(
    () => toValue(date),
    () => {
      revision++
      albums.value = []
      hasError.value = false
      isLoading.value = !!toValue(date)
    },
    { flush: 'sync' },
  )
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
    // Coalesce the new annual data and automatic pin change in one Vue flush.
    { immediate: true },
  )

  return { albums, isLoading, hasError, refresh }
}
