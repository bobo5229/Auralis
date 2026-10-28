import type { TrackListItem } from '@shared/types/libraryScan'

export interface LibraryDerivedGroup {
  tracks: readonly TrackListItem[]
}

export interface LibraryDerivedIndex {
  readonly trackIndexById: ReadonlyMap<number, number>
  readonly trackById: ReadonlyMap<number, TrackListItem>
  readonly albumGroupIndexByTrackId: ReadonlyMap<number, number>
  readonly albumGroupStartOffsets: readonly number[]
}

/**
 * Build the renderer-only lookup snapshot for the current track and album-group arrays.
 * The group-size callback is supplied by the page so offsets share the virtualizer's
 * geometry source instead of duplicating its height formula here.
 */
export function createLibraryDerivedIndex<TGroup extends LibraryDerivedGroup>(
  tracks: readonly TrackListItem[],
  albumGroups: readonly TGroup[],
  getAlbumGroupSize: (group: TGroup) => number,
): LibraryDerivedIndex {
  const trackIndexById = new Map<number, number>()
  const trackById = new Map<number, TrackListItem>()

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]
    if (!trackIndexById.has(track.id)) {
      trackIndexById.set(track.id, index)
      trackById.set(track.id, track)
    }
  }

  const albumGroupIndexByTrackId = new Map<number, number>()
  const albumGroupStartOffsets: number[] = []
  let groupOffset = 0

  for (let groupIndex = 0; groupIndex < albumGroups.length; groupIndex += 1) {
    const group = albumGroups[groupIndex]
    albumGroupStartOffsets.push(groupOffset)

    for (const track of group.tracks) {
      if (!albumGroupIndexByTrackId.has(track.id)) {
        albumGroupIndexByTrackId.set(track.id, groupIndex)
      }
    }

    groupOffset += getAlbumGroupSize(group)
  }

  return {
    trackIndexById,
    trackById,
    albumGroupIndexByTrackId,
    albumGroupStartOffsets: Object.freeze(albumGroupStartOffsets),
  }
}
