import { createArtistIndex, resolveIndexArtist } from '@shared/utils/artistIndex'
import type { AlbumSummary } from '../types'

/** Presentation groups retain the original album identity for detail and playback. */
export function indexedAlbums(albums: readonly AlbumSummary[]): AlbumSummary[] {
  const result: AlbumSummary[] = []
  for (const album of albums) {
    if (album.albumArtist.trim() || album.tracks.length === 0) {
      result.push(album)
      continue
    }
    const groups = new Map<string, typeof album.tracks>()
    for (const track of album.tracks) {
      const name = resolveIndexArtist(track.albumArtist, track.artist) || 'Unknown Artist'
      const group = groups.get(name)
      if (group) group.push(track)
      else groups.set(name, [track])
    }
    for (const [name, tracks] of groups) {
      result.push({ ...album, key: `${album.key}\u0000index:${name}`, indexArtist: name, tracks })
    }
  }
  const index = createArtistIndex()
  return result.sort((a, b) =>
    index.compare(a.indexArtist ?? a.albumArtist, b.indexArtist ?? b.albumArtist),
  )
}
