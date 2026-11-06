import type { TrackListItem } from '@shared/types/libraryScan'

// One presentation array per immutable catalog, shared by all collection surfaces.
const presentationTracks = new WeakMap<readonly TrackListItem[], TrackListItem[]>()
export function getLibraryPresentationTracks(tracks: readonly TrackListItem[]): TrackListItem[] {
  let result = presentationTracks.get(tracks)
  if (!result) {
    result = [...tracks]
    Object.freeze(result)
    presentationTracks.set(tracks, result)
  }
  return result
}
