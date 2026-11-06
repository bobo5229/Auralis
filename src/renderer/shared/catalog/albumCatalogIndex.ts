import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { groupAlbums, moreAlbumsByArtist, selectAlbumTracks } from '@shared/utils/albumGrouping'
import { albumIdentityKey } from '@shared/utils/albumIdentity'

/** Catalog arrays are immutable snapshots: replace the array when metadata changes. */
const indexes = new WeakMap<readonly TrackListItem[], ReturnType<typeof createIndex>>()

function createIndex(tracks: readonly TrackListItem[]) {
  const albums = Object.freeze(
    groupAlbums(
      tracks.map((track) => (Object.isFrozen(track) ? track : Object.freeze({ ...track }))),
    ).map((album) => Object.freeze({ ...album, tracks: Object.freeze(album.tracks) })),
  )
  const byIdentity = new Map(albums.map((album) => [album.key, album]))
  const byArtist = new Map<string, AlbumSummary[]>()
  const sortedTracks = new Map<string, readonly Readonly<TrackListItem>[]>()
  const relatedAlbums = new Map<string, readonly Readonly<AlbumSummary>[]>()
  for (const album of albums) {
    const siblings = byArtist.get(album.albumArtist)
    if (siblings) siblings.push(album)
    else byArtist.set(album.albumArtist, [album])
  }

  return Object.freeze({
    albums,
    selectTracks(artist: string, title: string): readonly Readonly<TrackListItem>[] {
      const key = albumIdentityKey(artist, title)
      let selected = sortedTracks.get(key)
      if (!selected) {
        selected = Object.freeze(
          selectAlbumTracks(byIdentity.get(key)?.tracks ?? [], artist, title),
        )
        sortedTracks.set(key, selected)
      }
      return selected
    },
    moreAlbums(artist: string, title: string): readonly Readonly<AlbumSummary>[] {
      const key = albumIdentityKey(artist, title)
      let related = relatedAlbums.get(key)
      if (!related) {
        related = Object.freeze(moreAlbumsByArtist(byArtist.get(artist) ?? [], artist, title))
        relatedAlbums.set(key, related)
        // Bound copies of large same-artist galleries during long browsing sessions.
        if (relatedAlbums.size > 16) {
          const oldest = relatedAlbums.keys().next().value
          if (oldest !== undefined) relatedAlbums.delete(oldest)
        }
      }
      return related
    },
  })
}

export function getAlbumCatalogIndex(tracks: readonly TrackListItem[]) {
  let index = indexes.get(tracks)
  if (!index) {
    index = createIndex(tracks)
    indexes.set(tracks, index)
  }
  return index
}
