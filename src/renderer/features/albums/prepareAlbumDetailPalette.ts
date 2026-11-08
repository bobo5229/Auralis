import { ref } from 'vue'
import type { NavigationGuard, RouteLocationNormalized } from 'vue-router'
import { getArtworkPalette, peekArtworkPalette } from '@renderer/shared/artwork/useArtworkPalette'
import { albumIdentityKey } from '@shared/utils/albumIdentity'
import { getAlbumColorPreference } from './albumColorPreferences'
import {
  readAlbumDetailSnapshot,
  writeAlbumDetailSnapshot,
  type AlbumDetailSnapshot,
} from './albumDetailSnapshot'

const TIMEOUT_MS = 1000
const prepared = new WeakMap<object, { fallback: boolean; snapshot?: AlbumDetailSnapshot }>()
export const albumEntryFallback = ref(false)

export async function prepareAlbumDetailPalette(
  artist: string,
  title: string,
): Promise<{ fallback: boolean; snapshot?: AlbumDetailSnapshot }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = async () => {
    let snapshot = readAlbumDetailSnapshot(artist, title)
    let fetched = false
    if (!snapshot || !snapshot.tracks.length) {
      const { auralis } = await import('@renderer/shared/ipc/client')
      const result = await auralis.library.getAlbumDetail({
        albumArtist: artist,
        albumTitle: title,
      })
      const summary = (album: (typeof result.moreAlbums)[number]) => ({
        ...album,
        key: albumIdentityKey(album.albumArtist, album.title),
        tracks: [],
      })
      snapshot = {
        albumArtist: artist,
        albumTitle: title,
        artworkCacheKey:
          result.tracks.find((track) => track.artworkCacheKey)?.artworkCacheKey ?? null,
        releaseDate: result.tracks.find((track) => track.releaseDate)?.releaseDate ?? null,
        tracks: result.tracks,
        moreAlbums: result.moreAlbums.map(summary),
        genreAlbums: result.genreAlbums.map(summary),
        catalogTracks: null,
      }
      fetched = true
    }
    const anchors = snapshot.tracks.map(({ id, createdAt }) => ({ id, createdAt }))
    if (getAlbumColorPreference(anchors))
      return { fallback: false, snapshot: fetched ? snapshot : undefined }
    if (!snapshot.artworkCacheKey)
      return { fallback: true, snapshot: fetched ? snapshot : undefined }
    const palette =
      peekArtworkPalette(snapshot.artworkCacheKey) ??
      (await getArtworkPalette(snapshot.artworkCacheKey))
    return { fallback: palette.quality === 'fallback', snapshot: fetched ? snapshot : undefined }
  }
  try {
    return await Promise.race([
      work().catch(() => ({ fallback: true })),
      new Promise<{ fallback: boolean }>((resolve) => {
        timer = setTimeout(() => resolve({ fallback: true }), TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const prepareAlbumDetailNavigation: NavigationGuard = async (to, from) => {
  if (from.name !== 'albums' || to.name !== 'album-detail') return
  if (typeof to.query.artist !== 'string' || typeof to.query.title !== 'string') return
  prepared.set(to, await prepareAlbumDetailPalette(to.query.artist, to.query.title))
}

export function commitAlbumDetailPreparation(to: RouteLocationNormalized, failure?: unknown): void {
  if (failure) return
  const result = prepared.get(to)
  albumEntryFallback.value = result?.fallback ?? false
  if (result?.snapshot) writeAlbumDetailSnapshot(result.snapshot)
}
