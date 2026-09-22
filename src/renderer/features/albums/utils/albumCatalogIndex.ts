import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '../types'
import { groupAlbums, moreAlbumsByArtist, selectAlbumTracks } from './albumGrouping'
import { albumIdentityKey } from './albumIdentity'

/** Catalog arrays are immutable snapshots: replace the array when metadata changes. */
const indexes = new WeakMap<TrackListItem[], ReturnType<typeof createIndex>>()

function createIndex(tracks: TrackListItem[]) {
  const albums = groupAlbums(tracks)
  const byIdentity = new Map(albums.map((album) => [album.key, album]))
  const byArtist = new Map<string, AlbumSummary[]>()
  const sortedTracks = new Map<string, TrackListItem[]>()
  const relatedAlbums = new Map<string, AlbumSummary[]>()
  for (const album of albums) {
    const siblings = byArtist.get(album.albumArtist)
    if (siblings) siblings.push(album)
    else byArtist.set(album.albumArtist, [album])
  }

  return {
    albums,
    selectTracks(artist: string, title: string): TrackListItem[] {
      const key = albumIdentityKey(artist, title)
      let selected = sortedTracks.get(key)
      if (!selected) {
        selected = selectAlbumTracks(byIdentity.get(key)?.tracks ?? [], artist, title)
        sortedTracks.set(key, selected)
      }
      return selected
    },
    moreAlbums(artist: string, title: string): AlbumSummary[] {
      const key = albumIdentityKey(artist, title)
      let related = relatedAlbums.get(key)
      if (!related) {
        related = moreAlbumsByArtist(byArtist.get(artist) ?? [], artist, title)
        relatedAlbums.set(key, related)
        // Bound copies of large same-artist galleries during long browsing sessions.
        if (relatedAlbums.size > 16) {
          const oldest = relatedAlbums.keys().next().value
          if (oldest !== undefined) relatedAlbums.delete(oldest)
        }
      }
      return related
    },
  }
}

export function getAlbumCatalogIndex(tracks: TrackListItem[]) {
  let index = indexes.get(tracks)
  if (!index) {
    index = createIndex(tracks)
    indexes.set(tracks, index)
  }
  return index
}
