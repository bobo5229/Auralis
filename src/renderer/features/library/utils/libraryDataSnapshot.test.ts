import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import {
  createAllSongsLibrarySnapshot,
  createPlaylistLibrarySnapshot,
  createSmartPlaylistLibrarySnapshot,
} from './libraryDataSnapshot'

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-13T00:00:00.000Z',
  }
}

describe('library data snapshots', () => {
  it('commits a fixed all-songs identity with the provided tracks and view mode', () => {
    const tracks = [createTrack(1), createTrack(2)]
    expect(createAllSongsLibrarySnapshot(tracks, 'cover')).toEqual({
      identity: { kind: 'library' },
      tracks,
      viewMode: 'cover',
    })
  })

  it('keeps playlist identity, tracks, and view mode on the same detail snapshot', () => {
    const tracks = [createTrack(9)]
    const detail: PlaylistDetail = {
      playlist: {
        id: 4,
        name: '通勤选辑',
        viewMode: 'flat',
        sortOrder: 0,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
      },
      tracks,
    }

    expect(createPlaylistLibrarySnapshot(detail)).toEqual({
      identity: {
        kind: 'playlist',
        id: 4,
        name: '通勤选辑',
        membership: 'manual',
      },
      tracks,
      viewMode: 'flat',
    })
  })

  it('keeps smart-playlist identity, tracks, and view mode on the same detail snapshot', () => {
    const tracks = [createTrack(3)]
    const detail: SmartPlaylistDetail = {
      playlist: {
        id: 4,
        name: 'High Energy',
        rule: { conditions: [] },
        viewMode: 'cover',
        sortOrder: 1,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
      },
      tracks,
    }

    expect(createSmartPlaylistLibrarySnapshot(detail)).toEqual({
      identity: {
        kind: 'smart-playlist',
        id: 4,
        name: 'High Energy',
        membership: 'rule-based',
      },
      tracks,
      viewMode: 'cover',
    })
  })
})
