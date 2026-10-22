import { computed, shallowRef, watch, type Ref } from 'vue'
import type { PlaybackTrack } from '../types'
import { getAlbumIdentity } from '../core/playbackTransitionPlanner'
import { useArtworkPalette, type UseArtworkPaletteOptions } from './useArtworkPalette'
import { resolveFullscreenSolidColor } from '../utils/fullscreenSolidColor'

/** Pin one cover per album for this overlay's lifetime, including fullscreen re-entry. */
export function useFullscreenSolidBackground(
  track: Readonly<Ref<PlaybackTrack | null>>,
  options: UseArtworkPaletteOptions = {},
) {
  const albumCovers = new Map<string, string>()
  const artworkKey = shallowRef<string | null>(null)
  watch(
    () => {
      const current = track.value
      return current ? [getAlbumIdentity(current), current.artworkCacheKey, current.id] : null
    },
    () => {
      const current = track.value
      if (!current) {
        artworkKey.value = null
        return
      }
      const identity =
        getAlbumIdentity(current) ?? `artwork:${current.artworkCacheKey ?? `track:${current.id}`}`
      let cover = albumCovers.get(identity)
      if (!cover && current.artworkCacheKey) {
        cover = current.artworkCacheKey
        albumCovers.set(identity, cover)
        if (albumCovers.size > 100) albumCovers.delete(albumCovers.keys().next().value!)
      }
      artworkKey.value = cover ?? null
    },
    { immediate: true },
  )
  const { palette } = useArtworkPalette(artworkKey, {
    ...options,
    retainPreviousWhileLoading: true,
  })
  return computed(() =>
    resolveFullscreenSolidColor(
      palette.value.quality !== 'fallback' ? (palette.value.dominant ?? null) : null,
    ),
  )
}
