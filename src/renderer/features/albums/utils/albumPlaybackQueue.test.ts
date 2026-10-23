import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { buildAlbumPlaybackQueue } from './albumPlaybackQueue'

const track = (id: number, album: string, trackNo: number, discNo = 1) =>
  ({
    id,
    album,
    albumArtist: 'Artist',
    artist: 'Artist',
    title: `Track ${id}`,
    trackNo,
    discNo,
  }) as TrackListItem

describe('album playback queue', () => {
  const tracks = [
    track(1, 'Before', 1),
    track(2, 'Current', 2),
    track(3, 'After', 2, 2),
    track(4, 'Current', 1),
    track(5, 'After', 2),
    track(6, 'After', 1),
  ]
  it('preserves catalog album order and sorts every album by disc and track', () => {
    const original = structuredClone(tracks)
    expect(
      buildAlbumPlaybackQueue(tracks, 'Artist', 'Current', 'sequential').map((t) => t.id),
    ).toEqual([4, 2, 6, 5, 3])
    expect(tracks).toEqual(original)
    expect(
      buildAlbumPlaybackQueue(tracks, 'Artist', 'After', 'sequential').map((t) => t.id),
    ).toEqual([6, 5, 3])
  })
  it.each(['repeat-one', 'repeat-all', 'shuffle', 'album-shuffle'] as const)(
    'limits %s to the ordered current album',
    (mode) => {
      expect(buildAlbumPlaybackQueue(tracks, 'Artist', 'Current', mode).map((t) => t.id)).toEqual([
        4, 2,
      ])
    },
  )
  it('uses the effective album identity and handles an absent album', () => {
    const unknown = { ...track(9, '', 1), albumArtist: null, artist: null }
    expect(
      buildAlbumPlaybackQueue([unknown], 'Unknown Artist', 'Unknown Album', 'sequential'),
    ).toEqual([unknown])
    expect(buildAlbumPlaybackQueue(tracks, 'Other Artist', 'Current', 'sequential')).toEqual([])
  })
})
