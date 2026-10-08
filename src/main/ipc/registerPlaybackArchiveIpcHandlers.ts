import { ipcChannels } from '@shared/ipc/channels'
import type { IpcResponse } from '@shared/ipc/contracts'
import type { LibraryService } from '@main/services/libraryService'
import type { PlayStatsService } from '@main/services/playStatsService'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

type PlaybackQueries = Pick<
  LibraryService,
  'getRandomTrack' | 'getRandomAlbumTracks' | 'getAlbumTracks'
>

type PlayStatsOperations = Pick<PlayStatsService, 'recordEffectivePlay' | 'resetAll'>

export interface PlaybackArchiveIpcDependencies {
  libraryService: PlaybackQueries
  playStatsService: PlayStatsOperations
  getAudioUrl(trackId: number): Promise<IpcResponse<'playback:get-audio-url'>>
  notifyLibraryChanged(data: {
    reason: 'play-stats-updated' | 'play-stats-reset'
    trackIds: number[]
    filePaths: string[]
  }): void
}

export function registerPlaybackArchiveIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: PlaybackArchiveIpcDependencies,
): void {
  const { libraryService, playStatsService, getAudioUrl, notifyLibraryChanged } = dependencies

  registrar.handle(ipcChannels.playback.getAudioUrl, (_event, payload: { trackId: number }) =>
    getAudioUrl(payload.trackId),
  )
  registrar.handle(
    ipcChannels.playback.getRandomTrack,
    (_event, payload?: { excludeTrackId?: number }) =>
      libraryService.getRandomTrack(payload?.excludeTrackId),
  )
  registrar.handle(
    ipcChannels.playback.getRandomAlbumTracks,
    (_event, payload?: { excludeAlbumKey?: { albumArtist: string; album: string } }) =>
      libraryService.getRandomAlbumTracks(payload?.excludeAlbumKey),
  )
  registrar.handle(
    ipcChannels.playback.getAlbumTracks,
    (_event, payload: { albumKey: { albumArtist: string; album: string } }) =>
      libraryService.getAlbumTracks(payload.albumKey),
  )
  registrar.handle(
    ipcChannels.playback.recordEffectivePlay,
    (_event, payload: { trackId: number; sessionId: string; playedAtIso: string }) => {
      const result = playStatsService.recordEffectivePlay(payload)
      if (result.ok && result.recorded) {
        notifyLibraryChanged({
          reason: 'play-stats-updated',
          trackIds: [payload.trackId],
          filePaths: [],
        })
      }
      return result
    },
  )

  registrar.handle(ipcChannels.archive.resetPlayStats, () => {
    const result = playStatsService.resetAll()
    notifyLibraryChanged({
      reason: 'play-stats-reset',
      trackIds: [],
      filePaths: [],
    })
    return result
  })
}
