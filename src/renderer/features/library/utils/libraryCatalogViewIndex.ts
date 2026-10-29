import { resolveIndexArtist } from '@shared/utils/artistIndex'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import type { LibraryDerivedIndex } from './libraryDerivedIndex'

export interface LibraryCatalogViewIndex extends LibraryDerivedIndex {
  readonly albumGroups: readonly LibraryAlbumGroup[]
}

/**
 * Build every catalog/group lookup that shares the same ordered track snapshot.
 *
 * The previous page implementation first grouped all tracks, then walked all
 * tracks again for id lookups, then walked every group track again for group
 * lookups. This keeps first-occurrence semantics while doing the track work in
 * one pass and the geometry work in one pass over groups.
 */
export function createLibraryCatalogViewIndex(
  tracks: readonly TrackListItem[],
  getAlbumGroupSize: (group: LibraryAlbumGroup) => number,
  splitIndexArtists = false,
): LibraryCatalogViewIndex {
  const albumGroups: LibraryAlbumGroup[] = []
  const albumGroupIndexByKey = new Map<string, number>()
  const trackIndexById = new Map<number, number>()
  const trackById = new Map<number, TrackListItem>()
  const albumGroupIndexByTrackId = new Map<number, number>()

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex]
    if (!trackIndexById.has(track.id)) {
      trackIndexById.set(track.id, trackIndex)
      trackById.set(track.id, track)
    }

    const albumArtist = track.albumArtist || track.artist || ''
    const album = track.album || ''
    const identity = `${albumArtist}\u0000${album}`
    const key =
      splitIndexArtists && track.albumArtist && !track.albumArtist.trim()
        ? `${identity}\u0000index:${resolveIndexArtist(track.albumArtist, track.artist) || 'Unknown Artist'}`
        : identity
    let groupIndex = albumGroupIndexByKey.get(key)

    if (groupIndex === undefined) {
      groupIndex = albumGroups.length
      albumGroupIndexByKey.set(key, groupIndex)
      albumGroups.push({
        key,
        album: track.album,
        albumArtist: track.albumArtist || track.artist,
        releaseDate: track.releaseDate,
        artworkCacheKey: track.artworkCacheKey,
        tracks: [track],
        firstTrackIndex: trackIndex,
      })
    } else {
      const group = albumGroups[groupIndex]
      group.albumArtist ??= track.albumArtist || track.artist
      group.album ??= track.album
      group.releaseDate ??= track.releaseDate
      group.artworkCacheKey ??= track.artworkCacheKey
      group.tracks.push(track)
    }

    if (!albumGroupIndexByTrackId.has(track.id)) {
      albumGroupIndexByTrackId.set(track.id, groupIndex)
    }
  }

  const albumGroupStartOffsets: number[] = []
  let groupOffset = 0
  for (const group of albumGroups) {
    albumGroupStartOffsets.push(groupOffset)
    groupOffset += getAlbumGroupSize(group)
  }

  return {
    albumGroups,
    trackIndexById,
    trackById,
    albumGroupIndexByTrackId,
    albumGroupStartOffsets: Object.freeze(albumGroupStartOffsets),
  }
}

const catalogStructures = new WeakMap<
  readonly TrackListItem[],
  Map<boolean, LibraryCatalogViewIndex>
>()

/** Reuse immutable snapshot lookups; each surface still derives its own layout offsets. */
export function getLibraryCatalogViewIndex(
  tracks: readonly TrackListItem[],
  getAlbumGroupSize: (group: LibraryAlbumGroup) => number,
  splitIndexArtists = false,
): LibraryCatalogViewIndex {
  let variants = catalogStructures.get(tracks)
  if (!variants) {
    variants = new Map()
    catalogStructures.set(tracks, variants)
  }
  let structure = variants.get(splitIndexArtists)
  if (!structure) {
    structure = createLibraryCatalogViewIndex(tracks, () => 0, splitIndexArtists)
    variants.set(splitIndexArtists, structure)
  }
  let offset = 0
  const albumGroupStartOffsets = structure.albumGroups.map((group) => {
    const start = offset
    offset += getAlbumGroupSize(group)
    return start
  })
  return { ...structure, albumGroupStartOffsets }
}
