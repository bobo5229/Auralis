import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'
import { registerAppIpcHandlers, type AppIpcDependencies } from './registerAppIpcHandlers'
import {
  registerDatabaseIpcHandlers,
  type DatabaseIpcDependencies,
} from './registerDatabaseIpcHandlers'
import {
  registerLibraryIpcHandlers,
  type LibraryIpcDependencies,
} from './registerLibraryIpcHandlers'
import {
  registerMetadataIpcHandlers,
  type MetadataIpcDependencies,
} from './registerMetadataIpcHandlers'
import {
  registerPlaybackArchiveIpcHandlers,
  type PlaybackArchiveIpcDependencies,
} from './registerPlaybackArchiveIpcHandlers'
import {
  registerPlaylistIpcHandlers,
  type PlaylistIpcDependencies,
} from './registerPlaylistIpcHandlers'
import { registerWindowIpcHandlers, type WindowIpcDependencies } from './registerWindowIpcHandlers'

export interface DomainIpcDependencies {
  app: AppIpcDependencies
  database: DatabaseIpcDependencies
  library: LibraryIpcDependencies
  playlists: PlaylistIpcDependencies
  playbackArchive: PlaybackArchiveIpcDependencies
  metadata: MetadataIpcDependencies
  window: WindowIpcDependencies
}

export function registerDomainIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: DomainIpcDependencies,
): void {
  registerAppIpcHandlers(registrar, dependencies.app)
  registerDatabaseIpcHandlers(registrar, dependencies.database)
  registerLibraryIpcHandlers(registrar, dependencies.library)
  registerPlaylistIpcHandlers(registrar, dependencies.playlists)
  registerPlaybackArchiveIpcHandlers(registrar, dependencies.playbackArchive)
  registerMetadataIpcHandlers(registrar, dependencies.metadata)
  registerWindowIpcHandlers(registrar, dependencies.window)
}
