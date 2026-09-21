import { afterEach, describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'

import {
  invalidateAlbumDetailSnapshot,
  readAlbumDetailSnapshot,
  snapshotHasCatalog,
  writeAlbumDetailSnapshot,
} from './albumDetailSnapshot'
import type { AlbumSummary } from './types'

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: '2020-01-01',
    copyright: null,
    durationSeconds: 180,
    artworkCacheKey: 'cover',
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function createSnapshot(patch: Partial<Parameters<typeof writeAlbumDetailSnapshot>[0]> = {}) {
  const tracks = [createTrack(1)]
  const album: AlbumSummary = {
    key: 'Artist\u0000Other',
    title: 'Other',
    albumArtist: 'Artist',
    releaseDate: '2019-01-01',
    artworkCacheKey: null,
    tracks: [createTrack(2)],
  }

  return {
    albumArtist: 'Artist',
    albumTitle: 'Album',
    artworkCacheKey: 'cover',
    releaseDate: '2020-01-01',
    tracks,
    moreAlbums: [album],
    catalogTracks: [...tracks, ...album.tracks],
    ...patch,
  }
}

afterEach(() => {
  invalidateAlbumDetailSnapshot()
})

describe('albumDetailSnapshot', () => {
  it('returns a written snapshot only when the album identity matches', () => {
    writeAlbumDetailSnapshot(createSnapshot())

    expect(readAlbumDetailSnapshot('Artist', 'Album')?.artworkCacheKey).toBe('cover')
    expect(readAlbumDetailSnapshot('Artist', 'Other')).toBeNull()
  })

  it('clears stored data on invalidate and reports catalog presence', () => {
    const withCatalog = createSnapshot()
    writeAlbumDetailSnapshot(withCatalog)
    expect(snapshotHasCatalog(readAlbumDetailSnapshot('Artist', 'Album'))).toBe(true)

    writeAlbumDetailSnapshot(createSnapshot({ catalogTracks: null }))
    expect(snapshotHasCatalog(readAlbumDetailSnapshot('Artist', 'Album'))).toBe(false)

    invalidateAlbumDetailSnapshot()
    expect(readAlbumDetailSnapshot('Artist', 'Album')).toBeNull()
  })
})
