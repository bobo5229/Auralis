import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { groupAlbums } from './albumGrouping'
import { indexedAlbums } from './indexedAlbums'
import { buildCdAlbumIndex } from './cdAlbumIndex'
import { buildArtistAnchors } from '@shared/utils/artistIndex'

describe('index presentation of shared album identities', () => {
  it('exposes each fallback artist while retaining the original album identity', () => {
    const tracks = [
      { id: 1, albumArtist: ' ', artist: 'Adele', album: 'Album' },
      { id: 2, albumArtist: ' ', artist: '周杰伦', album: 'Album' },
    ] as TrackListItem[]
    const canonical = groupAlbums(tracks)
    expect(canonical).toHaveLength(1)
    const albums = indexedAlbums(canonical)
    expect(albums.map((album) => album.indexArtist)).toEqual(['Adele', '周杰伦'])
    expect(albums.map((album) => album.albumArtist)).toEqual([' ', ' '])
    expect(albums.map((album) => album.tracks[0].id)).toEqual([1, 2])
    const anchors = buildArtistAnchors(albums, (album) => album.indexArtist)
    expect(anchors.find((anchor) => anchor.letter === 'A')?.rowIndex).toBe(0)
    expect(anchors.find((anchor) => anchor.letter === 'Z')?.rowIndex).toBe(1)
    const cd = buildCdAlbumIndex(albums, 3)
    expect(cd.anchors.find((anchor) => anchor.letter === 'Z')?.rowIndex).not.toBeNull()
  })
})
