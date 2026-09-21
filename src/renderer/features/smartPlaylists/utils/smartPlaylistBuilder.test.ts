import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  buildPlaylistRule,
  evaluateBuilder,
  indexBuilderTracks,
  newBuilderState,
} from './smartPlaylistBuilder'

function track(id: number, genre: string | null, artist: string | null): TrackListItem {
  return { id, genre, artist, albumArtist: 'Different album artist' } as TrackListItem
}
const tracks = [
  track(1, 'Pop; Rock', 'A; B'),
  track(2, 'pop', 'A'),
  track(3, 'Rock', 'C'),
  track(4, 'R&B/Soul', 'AC/DC'),
  track(5, null, null),
]
describe('smart playlist builder', () => {
  it('normalizes values, deduplicates track counts and preserves slash compounds', () => {
    const options = indexBuilderTracks([...tracks, track(6, ' POP; pop ', 'a，B')])
    expect(options.genre.find((option) => option.value === 'pop')?.ids.size).toBe(3)
    expect(options.genre.some((option) => option.value === 'r&b/soul')).toBe(true)
    expect(options.artist.some((option) => option.value === 'ac/dc')).toBe(true)
    expect(options.artist.some((option) => option.value === 'different album artist')).toBe(false)
  })
  it('distinguishes group intersection from cross-group intersection', () => {
    const state = newBuilderState()
    state.fields = ['genre', 'artist']
    state.groups.genre = { relation: 'and', values: ['pop', 'r&b/soul'] }
    state.groups.artist.values = ['c']
    let result = evaluateBuilder(state, indexBuilderTracks(tracks))
    expect(result.groups[0].ids.size).toBe(0)
    expect(result.ids.size).toBe(0)
    state.relation = 'or'
    expect([...evaluateBuilder(state, indexBuilderTracks(tracks)).ids]).toEqual([3])
    state.relation = 'and'
    state.groups.genre.values = ['pop']
    result = evaluateBuilder(state, indexBuilderTracks(tracks))
    expect(result.groups.every((group) => group.ids.size > 0)).toBe(true)
    expect(result.ids.size).toBe(0)
  })
  it('blocks incomplete rules and handles values removed from the catalog', () => {
    const state = newBuilderState()
    expect(() => buildPlaylistRule(state)).toThrow()
    state.fields = ['genre']
    expect(evaluateBuilder(state, indexBuilderTracks(tracks)).complete).toBe(false)
    expect(() => buildPlaylistRule(state)).toThrow()
    state.groups.genre.values = ['missing']
    expect(evaluateBuilder(state, indexBuilderTracks(tracks)).ids.size).toBe(0)
  })
})
