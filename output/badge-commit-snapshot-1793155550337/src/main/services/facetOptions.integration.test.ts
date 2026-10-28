import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylistRuleCondition } from '@shared/types/smartPlaylist'
import { SmartPlaylistService } from './smartPlaylistService'
import {
  buildFacetOptions,
  matchesFacet,
  type RuleFacetKind,
} from '../../renderer/features/facets/utils/facetOptions'

function track(
  id: number,
  genre: string | null,
  albumArtist: string | null,
  artist: string | null = null,
): TrackListItem {
  return { id, genre, albumArtist, artist } as TrackListItem
}
const tracks = [
  track(1, 'Rock; ROCK', 'Band; BAND'),
  track(2, ' rock ', 'band'),
  track(3, 'Pop; Rock', null, 'BAND'),
  track(4, 'R&B/Soul', 'AC/DC'),
  track(5, null, null),
  track(6, '   ', '   ', 'Fallback is not used for whitespace'),
  track(7, 'unknown', 'unknown'),
]
function playlistIds(conditions: SmartPlaylistRuleCondition[]): number[] {
  const service = new SmartPlaylistService(
    {
      getById: () => ({ id: 1, name: 'Facet', rule: { conditions } }),
    } as unknown as ConstructorParameters<typeof SmartPlaylistService>[0],
    { getAll: () => tracks, getChangeToken: () => '0' } as unknown as ConstructorParameters<
      typeof SmartPlaylistService
    >[1],
  )
  return service.getDetail(1)!.tracks.map((track) => track.id)
}

describe('facet preview and smart playlist membership', () => {
  it.each<RuleFacetKind>(['genre', 'albumArtist'])(
    'keeps %s option counts and filters equal to playlist membership',
    (kind) => {
      const options = buildFacetOptions(tracks, kind, 'Unknown')
      for (const option of options) {
        const preview = tracks
          .filter((track) => matchesFacet(track, kind, option.key))
          .map((track) => track.id)
        expect(option.trackCount).toBe(preview.length)
        expect(preview).toEqual(playlistIds([{ field: kind, value: option.value }]))
      }
      expect(
        options.find((option) => option.key === (kind === 'genre' ? 'value:rock' : 'value:band')),
      ).toMatchObject({ label: kind === 'genre' ? 'Rock' : 'Band', trackCount: 3 })
      expect(options.find((option) => option.key === 'unknown')?.trackCount).toBe(2)
      expect(options.find((option) => option.key === 'value:unknown')?.trackCount).toBe(1)
      expect(
        options.some((option) => option.value === (kind === 'genre' ? 'R&B/Soul' : 'AC/DC')),
      ).toBe(true)
    },
  )

  it('keeps cascading genre and album-artist selections equal to the combined rule', () => {
    for (const genre of buildFacetOptions(tracks, 'genre', 'Unknown')) {
      const filtered = tracks.filter((track) => matchesFacet(track, 'genre', genre.key))
      for (const artist of buildFacetOptions(filtered, 'albumArtist', 'Unknown')) {
        const ids = filtered
          .filter((track) => matchesFacet(track, 'albumArtist', artist.key))
          .map((track) => track.id)
        expect(artist.trackCount).toBe(ids.length)
        expect(ids).toEqual(
          playlistIds([
            { field: 'genre', value: genre.value },
            { field: 'albumArtist', value: artist.value },
          ]),
        )
      }
    }
  })
})
