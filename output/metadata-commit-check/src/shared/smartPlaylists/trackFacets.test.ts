import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  getRawTrackValue,
  getTrackFacetKey,
  getTrackFacetLabels,
  getTrackFacetMatchValues,
  matchesTrackFacetKey,
} from './trackFacets'

function track(partial: Partial<TrackListItem>): TrackListItem {
  return partial as TrackListItem
}

describe('trackFacets', () => {
  it('splits and normalizes match values on "; " only', () => {
    const item = track({ genre: 'Rock; POP', artist: 'R&B/Soul', albumArtist: null })
    expect(getTrackFacetMatchValues(item, 'genre')).toEqual(['rock', 'pop'])
    // Slash compounds stay atomic.
    expect(getTrackFacetMatchValues(item, 'artist')).toEqual(['r&b/soul'])
    // Whitespace-only and null fields mean an empty facet.
    expect(getTrackFacetMatchValues(item, 'albumArtist')).toEqual([])
  })

  it('applies the album-artist→artist fallback only for the fallback field', () => {
    const item = track({ genre: 'Jazz', artist: 'Solo Artist', albumArtist: null })
    expect(getRawTrackValue(item, 'albumArtist')).toBeNull()
    expect(getRawTrackValue(item, 'albumArtistOrArtist')).toBe('Solo Artist')
    expect(getTrackFacetMatchValues(item, 'albumArtistOrArtist')).toEqual(['solo artist'])
  })

  it('keeps first-seen label casing and reports empty facets as unknown', () => {
    const item = track({ genre: 'Rock; ROCK', artist: null, albumArtist: '   ' })
    expect(getTrackFacetLabels(item, 'genre')).toEqual(['Rock'])
    expect(getTrackFacetLabels(item, 'albumArtist')).toEqual([null])
    expect(getTrackFacetKey('Rock')).toBe('value:rock')
    expect(getTrackFacetKey(null)).toBe('unknown')
  })

  it('matches keys against normalized facet values', () => {
    const item = track({ genre: 'Rock; Pop', artist: null, albumArtist: 'Band' })
    expect(matchesTrackFacetKey(item, 'genre', 'value:rock')).toBe(true)
    expect(matchesTrackFacetKey(item, 'genre', 'value:pop')).toBe(true)
    expect(matchesTrackFacetKey(item, 'genre', 'value:jazz')).toBe(false)
    expect(matchesTrackFacetKey(track({ genre: '   ' }), 'genre', 'unknown')).toBe(true)
    expect(matchesTrackFacetKey(item, 'albumArtist', 'unknown')).toBe(false)
  })
})
