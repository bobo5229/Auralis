import { auralis } from '@renderer/shared/ipc/client'
import { libraryCatalogClient } from '@renderer/shared/catalog/libraryCatalogClient'
import { PlaylistCatalogClient } from './playlistCatalogClient'
export { libraryCatalogClient } from '@renderer/shared/catalog/libraryCatalogClient'
export const playlistCatalogClient = new PlaylistCatalogClient(libraryCatalogClient, {
  playlist: (id) => auralis.playlists.getMembership(id),
  smart: (id) => auralis.smartPlaylists.getMembership(id),
})
