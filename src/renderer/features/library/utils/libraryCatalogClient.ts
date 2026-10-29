import { auralis } from '@renderer/shared/ipc/client'
import { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'

// One execution owner per renderer, independent of consumer callback identity/lifetime.
export const libraryCatalogClient = new SharedLibraryCatalogLoad(
  (request) => auralis.library.getTrackPage(request),
  auralis.library,
)
if (import.meta.hot) import.meta.hot.dispose(() => libraryCatalogClient.dispose())
