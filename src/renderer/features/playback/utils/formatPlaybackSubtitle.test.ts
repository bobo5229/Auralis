import { describe, expect, it } from 'vitest'
import type { PlaybackTrack } from '../types'
import { formatPlaybackSubtitle } from './formatPlaybackSubtitle'
import { formatGenre } from '../../library/utils/formatGenre'

describe('playback multi-value display', () => {
  it.each([
    ['A; B', 'A & B'],
    ['A; B; C', 'A, B & C'],
    ['AC/DC; Tyler, The Creator', 'AC/DC & Tyler, The Creator'],
    ['A;B', 'A;B'],
    ['A；B', 'A；B'],
    ['R&B/Soul; Hip-Hop/Rap', 'R&B/Soul & Hip-Hop/Rap'],
  ])('uses canonical parsing for %s', (value, display) => {
    expect(formatGenre(value)).toBe(display)
    expect(
      formatPlaybackSubtitle({ artist: value, albumArtist: null, album: 'Album' } as PlaybackTrack),
    ).toBe(`${display} - Album`)
    expect(
      formatPlaybackSubtitle({
        artist: 'Other',
        albumArtist: value,
        album: 'Album',
      } as PlaybackTrack),
    ).toBe(`${display} - Album`)
  })
})
