import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { SmartPlaylistService } from './smartPlaylistService'
import { ipcChannels } from '@shared/ipc/channels'
import { parseDomainIpcPayload } from '../ipc/ipcPayloadValidation'
import {
  buildPlaylistRule,
  evaluateBuilder,
  indexBuilderTracks,
  newBuilderState,
  type BuilderRelation,
} from '../../renderer/features/smartPlaylists/utils/smartPlaylistBuilder'

function track(id: number, genre: string | null, artist: string | null): TrackListItem {
  return { id, genre, artist, albumArtist: 'Different album artist' } as TrackListItem
}

describe('smart playlist builder and service integration', () => {
  it.each([63, 64])('accepts %i values per group through IPC with equivalent preview', (count) => {
    const tracks = Array.from({ length: count }, (_, index) =>
      track(index + 1, `Genre ${index}`, `Artist ${index}`),
    )
    const state = newBuilderState()
    state.fields = ['genre', 'artist']
    const options = indexBuilderTracks(tracks)
    for (const field of state.fields)
      state.groups[field].values = options[field].map((o) => o.value)
    const rule = buildPlaylistRule(state)
    expect(() =>
      parseDomainIpcPayload(ipcChannels.smartPlaylists.create, [{ name: 'Boundary', rule }]),
    ).not.toThrow()
    const service = new SmartPlaylistService(
      { getById: () => ({ id: 1, name: 'Boundary', rule }) } as unknown as ConstructorParameters<
        typeof SmartPlaylistService
      >[0],
      { getAll: () => tracks, getChangeToken: () => '0' } as unknown as ConstructorParameters<
        typeof SmartPlaylistService
      >[1],
    )
    const preview = evaluateBuilder(state, options)
    expect(preview.complete).toBe(true)
    expect(preview.ids.size).toBe(count)
    expect([...preview.ids]).toEqual(service.getDetail(1)?.tracks.map((track) => track.id))
  })

  it('blocks 65 values before submission and restores creation after removing one', () => {
    const tracks = Array.from({ length: 65 }, (_, index) => track(index + 1, `Genre ${index}`, 'A'))
    const options = indexBuilderTracks(tracks)
    const state = newBuilderState()
    state.fields = ['genre']
    state.groups.genre.values = options.genre.map((option) => option.value)
    expect(evaluateBuilder(state, options)).toMatchObject({ complete: false, withinLimits: false })
    expect(() => buildPlaylistRule(state)).toThrow(/64/)
    // Keep the main-process boundary effective even if a caller bypasses the builder.
    expect(() =>
      parseDomainIpcPayload(ipcChannels.smartPlaylists.create, [
        {
          name: 'Too many',
          rule: {
            expression: {
              type: 'or',
              operands: state.groups.genre.values.map((value) => ({
                type: 'predicate',
                field: 'genre',
                operator: 'has',
                value,
              })),
            },
          },
        },
      ]),
    ).toThrow()
    state.groups.genre.values.pop()
    expect(evaluateBuilder(state, options).complete).toBe(true)
    expect(() =>
      parseDomainIpcPayload(ipcChannels.smartPlaylists.create, [
        {
          name: 'Valid again',
          rule: buildPlaylistRule(state),
        },
      ]),
    ).not.toThrow()
  })

  for (const outer of ['and', 'or'] as BuilderRelation[]) {
    for (const genre of ['and', 'or'] as BuilderRelation[]) {
      for (const artist of ['and', 'or'] as BuilderRelation[]) {
        it(`keeps preview and persisted rule equivalent: ${outer}/${genre}/${artist}`, () => {
          const tracks = [
            track(1, 'Pop; Rock', 'A; B'),
            track(2, 'pop', 'A'),
            track(3, 'Rock', 'C'),
            track(4, 'R&B/Soul', 'AC/DC'),
            track(5, null, null),
          ]
          const state = newBuilderState()
          state.fields = ['genre', 'artist']
          state.relation = outer
          state.groups.genre = { relation: genre, values: ['pop', 'rock'] }
          state.groups.artist = { relation: artist, values: ['a', 'b'] }
          const rule = buildPlaylistRule(state)
          const playlist = { id: 1, name: 'Test', rule } as SmartPlaylist
          const service = new SmartPlaylistService(
            { getById: () => playlist } as unknown as ConstructorParameters<
              typeof SmartPlaylistService
            >[0],
            { getAll: () => tracks, getChangeToken: () => '0' } as unknown as ConstructorParameters<
              typeof SmartPlaylistService
            >[1],
          )
          const preview = evaluateBuilder(state, indexBuilderTracks(tracks))
          expect([...preview.ids].sort()).toEqual(
            service
              .getDetail(1)
              ?.tracks.map((track) => track.id)
              .sort(),
          )
          tracks.push(track(6, 'Pop; Rock', 'A; B'))
          service.clearTrackListCache()
          expect(service.getDetail(1)?.tracks.map((track) => track.id)).toContain(6)
        })
      }
    }
  }
})
