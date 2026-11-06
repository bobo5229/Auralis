import type { TrackListItem } from '@shared/types/libraryScan'
import { sortLibraryTracks } from './libraryTrackSort'

const MAX_CACHED_ORDER = 100_000
type SortKey = Pick<TrackListItem, 'albumArtist' | 'artist' | 'releaseDate' | 'discNo' | 'trackNo'>
const fields = ['albumArtist', 'artist', 'releaseDate', 'discNo', 'trackNo'] as const

/** Cache only IDs and ordering fields; statistics and display values always come from fresh rows. */
export class LibraryTrackOrderCache {
  private keys = new Map<number, SortKey>()
  private ids: number[] = []

  constructor(private readonly sort: typeof sortLibraryTracks = sortLibraryTracks) {}

  order(tracks: TrackListItem[]): TrackListItem[] {
    if (tracks.length > MAX_CACHED_ORDER) {
      this.keys.clear()
      this.ids = []
      return this.sort(tracks)
    }
    const canReuse =
      tracks.length === this.ids.length &&
      tracks.every((track) => {
        const previous = this.keys.get(track.id)
        return previous && fields.every((field) => track[field] === previous[field])
      })
    if (canReuse) {
      const rows = new Map(tracks.map((track) => [track.id, track]))
      return this.ids.map((id) => rows.get(id)!)
    }
    const ordered = this.sort(tracks)
    this.ids = ordered.map((track) => track.id)
    this.keys = new Map(
      ordered.map((track) => [
        track.id,
        {
          albumArtist: track.albumArtist,
          artist: track.artist,
          releaseDate: track.releaseDate,
          discNo: track.discNo,
          trackNo: track.trackNo,
        },
      ]),
    )
    return ordered
  }
}
