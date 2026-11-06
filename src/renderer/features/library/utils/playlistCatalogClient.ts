import type { TrackListItem } from '@shared/types/libraryScan'
import type { Playlist, PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylist, SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import type { PlaylistMembership } from '@shared/types/playlistMembership'
import type { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'

interface ResolvedCatalog {
  byId: Map<number, TrackListItem>
  scopes: Map<string, TrackListItem[]>
}

/** Reuses immutable metadata; membership is re-read on every visit and keeps server ordering. */
export class PlaylistCatalogClient {
  private readonly catalogs = new WeakMap<readonly TrackListItem[], ResolvedCatalog>()

  constructor(
    private readonly catalog: SharedLibraryCatalogLoad,
    private readonly memberships: {
      playlist(id: number): Promise<PlaylistMembership<Playlist> | null>
      smart(id: number): Promise<PlaylistMembership<SmartPlaylist> | null>
    },
  ) {}

  getPlaylistDetail(id: number): Promise<PlaylistDetail | null> {
    return this.resolve(`playlist:${id}`, () => this.memberships.playlist(id))
  }

  getSmartPlaylistDetail(id: number): Promise<SmartPlaylistDetail | null> {
    return this.resolve(`smart:${id}`, () => this.memberships.smart(id))
  }

  private async resolve<T extends Playlist | SmartPlaylist>(
    key: string,
    read: () => Promise<PlaylistMembership<T> | null>,
  ): Promise<{ playlist: T; tracks: TrackListItem[] } | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const membership = await read()
      if (!membership) return null
      this.catalog.invalidateForLibraryRevision(membership.libraryRevision)
      const snapshot = await this.catalog.load(() => true, 'current', membership.libraryRevision)
      // Never combine membership with metadata from a different database generation.
      if (
        snapshot.libraryRevision !== membership.libraryRevision ||
        !this.catalog.isSnapshotCurrent(snapshot)
      )
        continue

      let index = this.catalogs.get(snapshot.tracks)
      if (!index) {
        index = {
          byId: new Map(snapshot.tracks.map((track) => [track.id, track])),
          scopes: new Map(),
        }
        this.catalogs.set(snapshot.tracks, index)
      }
      let tracks = index.scopes.get(key)
      if (
        !tracks ||
        tracks.length !== membership.trackIds.length ||
        tracks.some((track, i) => track.id !== membership.trackIds[i])
      ) {
        tracks = membership.trackIds.map((id) => {
          const track = index.byId.get(id)
          if (!track) throw new Error('Playlist member is missing from its library snapshot')
          return track
        })
        Object.freeze(tracks)
      }
      index.scopes.delete(key)
      index.scopes.set(key, tracks)
      // Bound retained membership arrays while keeping track objects shared.
      if (index.scopes.size > 8) index.scopes.delete(index.scopes.keys().next().value!)
      return { playlist: membership.playlist, tracks }
    }
    throw new Error('Library changed while loading playlist membership')
  }
}
