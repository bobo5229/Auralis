import type { TrackListItem } from '@shared/types/libraryScan'
import { normalizeSearchText } from './normalizeSearchText'
import type { LibrarySearchRecord } from './librarySearchScan'

/** Build one normalized record for each track, preserving the source order. */
export function createLibrarySearchIndex(
  tracks: readonly TrackListItem[],
): readonly LibrarySearchRecord[] {
  return Object.freeze(
    tracks.map((track) =>
      Object.freeze({
        title: normalizeSearchText(track.title),
        artist: normalizeSearchText(track.artist),
        albumArtist: normalizeSearchText(track.albumArtist),
        album: normalizeSearchText(track.album),
      }),
    ),
  )
}
