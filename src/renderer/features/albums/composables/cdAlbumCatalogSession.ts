import { auralis } from '@renderer/shared/ipc/client'
import { createCdAlbumCatalogSession } from '../utils/cdAlbumCatalogSession'

export const cdAlbumCatalogSession = createCdAlbumCatalogSession(auralis.library)
