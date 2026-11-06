import { auralis } from '@renderer/shared/ipc/client'
import { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'
import { PlaylistCatalogClient } from './playlistCatalogClient'

// One execution owner per renderer, independent of consumer callback identity/lifetime.
export const libraryCatalogClient = new SharedLibraryCatalogLoad(
  (request) => auralis.library.getTrackPage(request),
  auralis.library,
)
export const playlistCatalogClient = new PlaylistCatalogClient(libraryCatalogClient, {
  playlist: (id) => auralis.playlists.getMembership(id),
  smart: (id) => auralis.smartPlaylists.getMembership(id),
})
if (import.meta.hot) import.meta.hot.dispose(() => libraryCatalogClient.dispose())
