import { ipcChannels } from '@shared/ipc/channels'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

/** Wrap synchronous IPC mutation units; asynchronous writers coordinate at their own commit boundary. */
export function createWriteAdmissionRegistrar(
  registrar: IpcHandlerRegistrar,
  admission: DatabaseWriteAdmission,
): IpcHandlerRegistrar {
  const writes = new Set<string>([
    ipcChannels.playback.recordEffectivePlay,
    ipcChannels.playback.recordListeningProgress,
    ipcChannels.archive.resetPlayStats,
    ipcChannels.metadata.refreshTrack,
    ipcChannels.metadata.refreshTracks,
    ipcChannels.metadata.refreshLyricsMissing,
    ipcChannels.metadata.clearRefreshFailures,
    ipcChannels.playlists.create,
    ipcChannels.playlists.rename,
    ipcChannels.playlists.updateViewMode,
    ipcChannels.playlists.delete,
    ipcChannels.playlists.addTracks,
    ipcChannels.playlists.reorderSidebarItems,
    ipcChannels.smartPlaylists.create,
    ipcChannels.smartPlaylists.createFromQuery,
    ipcChannels.smartPlaylists.createRecentAdded,
    ipcChannels.smartPlaylists.updateRecentAddedDays,
    ipcChannels.smartPlaylists.rename,
    ipcChannels.smartPlaylists.updateViewMode,
    ipcChannels.smartPlaylists.delete,
    ipcChannels.smartPlaylists.reorder,
  ])
  return {
    handle(channel, listener) {
      registrar.handle(channel, (event, payload) => {
        if (!writes.has(channel)) return listener(event, payload)
        return admission.runWrite(() => {
          const result = listener(event, payload)
          if (result instanceof Promise) throw new Error('Write IPC must complete synchronously')
          return result
        })
      })
    },
  }
}
