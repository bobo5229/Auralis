import type { Playlist } from './playlist'
import type { SmartPlaylist } from './smartPlaylist'

/** Ordered available members, bound to the same library revision as their metadata. */
export interface PlaylistMembership<TPlaylist = Playlist | SmartPlaylist> {
  playlist: TPlaylist
  trackIds: number[]
  libraryRevision: string
}
