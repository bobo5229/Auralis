import { ipcChannels } from '@shared/ipc/channels'
import type { LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import type { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import type { MetadataWatchService } from '@main/features/metadata/metadataWatchService'
import type { LibraryService } from '@main/services/libraryService'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

type LibraryQueries = Pick<LibraryService, 'getStats' | 'getTracks' | 'getTrackPage' | 'getLyrics'>

type LibraryScanCommands = Pick<
  LibraryScanService,
  'selectRoot' | 'getRoots' | 'startScan' | 'cancelScan' | 'getScanStatus'
>

export interface LibraryIpcDependencies {
  libraryService: LibraryQueries
  libraryScanService: LibraryScanCommands
  metadataWatchService: Pick<MetadataWatchService, 'syncRoots'>
}

export function registerLibraryIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: LibraryIpcDependencies,
): void {
  const { libraryService, libraryScanService, metadataWatchService } = dependencies

  registrar.handle(ipcChannels.library.getStats, () => libraryService.getStats())

  registrar.handle(ipcChannels.library.selectRoot, async () => {
    const result = await libraryScanService.selectRoot()
    metadataWatchService.syncRoots()
    return result
  })

  registrar.handle(ipcChannels.library.getRoots, () => libraryScanService.getRoots())

  registrar.handle(ipcChannels.library.startScan, (_event, payload: { rootId: number }) =>
    libraryScanService.startScan(payload.rootId),
  )

  registrar.handle(ipcChannels.library.cancelScan, (_event, payload: { jobId: number }) =>
    libraryScanService.cancelScan(payload.jobId),
  )

  registrar.handle(ipcChannels.library.getScanStatus, (_event, payload?: { jobId?: number }) =>
    libraryScanService.getScanStatus(payload?.jobId),
  )

  registrar.handle(ipcChannels.library.getTracks, () => libraryService.getTracks())

  registrar.handle(ipcChannels.library.getTrackPage, (_event, payload: LibraryTrackPageRequest) =>
    libraryService.getTrackPage(payload),
  )

  registrar.handle(ipcChannels.lyrics.getByTrackId, (_event, payload: { trackId: number }) =>
    libraryService.getLyrics(payload.trackId),
  )
}
