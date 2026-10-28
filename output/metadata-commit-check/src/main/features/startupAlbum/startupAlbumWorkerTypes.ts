import type { StartupAlbumHistory } from '@shared/types/startupAlbum'
import type { RandomAlbumTracksResult } from '@shared/types/playback'

export interface StartupAlbumWorkerInput {
  databasePath: string
  history: StartupAlbumHistory
}

export type StartupAlbumWorkerMessage =
  | { type: 'result'; album: RandomAlbumTracksResult | null }
  | { type: 'error'; reason: string }
