import { ipcChannels } from '@shared/ipc/channels'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

type MetadataOperations = Pick<
  MetadataRefreshService,
  | 'refreshTrack'
  | 'refreshTracks'
  | 'refreshMissingMetadata'
  | 'refreshLyricsForMissing'
  | 'getJobStatus'
  | 'listFailures'
  | 'clearFailures'
  | 'getTrackMetadata'
  | 'updateTrackMetadata'
>

export interface MetadataIpcDependencies {
  metadataRefreshService: MetadataOperations
}

export function registerMetadataIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: MetadataIpcDependencies,
): void {
  const { metadataRefreshService } = dependencies

  registrar.handle(ipcChannels.metadata.refreshTrack, (_event, payload: { trackId: number }) =>
    metadataRefreshService.refreshTrack(payload.trackId),
  )
  registrar.handle(ipcChannels.metadata.refreshTracks, (_event, payload: { trackIds: number[] }) =>
    metadataRefreshService.refreshTracks(payload.trackIds),
  )
  registrar.handle(ipcChannels.metadata.refreshMissing, (_event, payload?: { limit?: number }) =>
    metadataRefreshService.refreshMissingMetadata(payload?.limit),
  )
  registrar.handle(
    ipcChannels.metadata.refreshLyricsMissing,
    (_event, payload?: { limit?: number }) =>
      metadataRefreshService.refreshLyricsForMissing(payload?.limit),
  )
  registrar.handle(ipcChannels.metadata.getRefreshStatus, (_event, payload: { jobId: number }) =>
    metadataRefreshService.getJobStatus(payload.jobId),
  )
  registrar.handle(
    ipcChannels.metadata.listRefreshFailures,
    (_event, payload?: { limit?: number }) => metadataRefreshService.listFailures(payload?.limit),
  )
  registrar.handle(ipcChannels.metadata.clearRefreshFailures, () =>
    metadataRefreshService.clearFailures(),
  )
  registrar.handle(ipcChannels.metadata.getTrackMetadata, (_event, payload: { trackId: number }) =>
    metadataRefreshService.getTrackMetadata(payload.trackId),
  )
  registrar.handle(
    ipcChannels.metadata.updateTrackMetadata,
    (_event, payload: EditableTrackMetadata) => metadataRefreshService.updateTrackMetadata(payload),
  )
}
