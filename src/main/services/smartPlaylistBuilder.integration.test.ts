import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { SmartPlaylistService } from './smartPlaylistService'
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
          tracks.push(track(6, 'Pop;Rock', 'A;B'))
          service.clearTrackListCache()
          expect(service.getDetail(1)?.tracks.map((track) => track.id)).toContain(6)
        })
      }
    }
  }
})
