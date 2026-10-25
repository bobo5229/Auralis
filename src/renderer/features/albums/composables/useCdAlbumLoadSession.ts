import { ref, shallowRef } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import type { createCdAlbumCatalogSession } from '../utils/cdAlbumCatalogSession'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'

interface Options {
  catalogSession: Pick<ReturnType<typeof createCdAlbumCatalogSession>, 'load'>
  onAlbums: (albums: CdAlbumInfo[]) => Promise<void>
  isDisposed: () => boolean
}

/** Publishes complete catalogs and serializes refreshes through the consumer acknowledgement. */
export function useCdAlbumLoadSession(options: Options) {
  const albumInfo = shallowRef<CdAlbumInfo[]>([])
  const loading = ref(true)
  const failed = ref(false)
  const count = ref(0)
  let inFlight = false
  let refreshPending = false

  async function loadAlbums(): Promise<boolean> {
    if (inFlight) {
      refreshPending = true
      return false
    }
    inFlight = true
    failed.value = false
    if (!count.value) loading.value = true
    try {
      do {
        refreshPending = false
        const catalogAlbums = await options.catalogSession.load()
        if (options.isDisposed()) return false
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
        await options.onAlbums(albums)
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
    return !options.isDisposed()
  }

  return { albumInfo, loading, failed, count, loadAlbums }
}
