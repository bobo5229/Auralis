import { nextTick, ref, shallowRef, type Ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import type { createCdAlbumCatalogSession } from '../utils/cdAlbumCatalogSession'
import type { createCdStage } from '../utils/cdStageController'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'

interface Options {
  catalogSession: Pick<ReturnType<typeof createCdAlbumCatalogSession>, 'load'>
  claimStartupEntry: () => Promise<{ firstEntry: boolean }>
  getController: () => Pick<ReturnType<typeof createCdStage>, 'setAlbums' | 'setFocused'> | null
  requestedAlbumKey: string | null
  fromIndexViewSwitch: boolean
  stageRef: Ref<HTMLElement | null>
  isDisposed: () => boolean
}

/** Publishes only complete album catalogs and preserves the startup-entry handshake. */
export function useCdAlbumLoadSession(options: Options) {
  const albumInfo = shallowRef<CdAlbumInfo[]>([])
  const loading = ref(true)
  const failed = ref(false)
  const count = ref(0)
  const repeatEntry = ref(false)
  let entryInitialized = false
  let inFlight = false
  let refreshPending = false

  async function loadAlbums(): Promise<void> {
    if (inFlight) {
      refreshPending = true
      return
    }
    inFlight = true
    failed.value = false
    if (!count.value) loading.value = true
    try {
      do {
        refreshPending = false
        const catalogAlbums = await options.catalogSession.load()
        if (options.isDisposed()) return
        // Only publish a complete catalog; keep the songs page's album and track order.
        const albums = catalogAlbums.map((album) => ({
          key: album.key,
          artworkUrl: getArtworkUrl(album.artworkCacheKey),
          artworkCacheKey: album.artworkCacheKey,
          title: album.title,
          artist: album.albumArtist,
          releaseDate: album.releaseDate?.trim() || null,
          trackCount: album.tracks.length,
          copyright:
            album.tracks.find((track) => track.copyright?.trim())?.copyright?.trim() || null,
          tracks: album.tracks,
        }))
        albumInfo.value = albums
        count.value = albums.length
        const initialEntry = !entryInitialized && albums.length > 0
        let firstRuntimeEntry = false
        if (initialEntry) {
          const entry = await options.claimStartupEntry()
          if (options.isDisposed()) return
          firstRuntimeEntry = entry.firstEntry
          repeatEntry.value = !firstRuntimeEntry
          entryInitialized = true
        }
        const targetKey =
          initialEntry && albums.some((album) => album.key === options.requestedAlbumKey)
            ? options.requestedAlbumKey
            : null
        options
          .getController()
          ?.setAlbums(
            albums,
            firstRuntimeEntry && !targetKey && !options.fromIndexViewSwitch,
            targetKey ?? undefined,
          )
        if (targetKey) options.getController()?.setFocused(true, 'fade')
      } while (refreshPending && !options.isDisposed())
    } catch (error) {
      if (!options.isDisposed()) {
        failed.value = true
        rendererDiagnostics.error({
          scope: 'albums.cd',
          message: 'Failed to load CD albums',
          cause: error,
        })
      }
    } finally {
      inFlight = false
      if (!options.isDisposed()) loading.value = false
    }
    await nextTick()
    if (!options.isDisposed() && document.activeElement === document.body) {
      options.stageRef.value?.focus({ preventScroll: true })
    }
  }

  return { albumInfo, loading, failed, count, repeatEntry, loadAlbums }
}
