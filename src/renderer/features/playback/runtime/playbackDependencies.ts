import type { PlaybackTrack } from '../types'
import type { AlbumShuffleContext } from '../core/playbackQueueState'
import {
  createPlaybackAudioRuntime,
  type PlaybackAudioCallbacks,
  type PlaybackAudioRuntime,
} from '../audio/playbackAudioRuntime'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export interface PlaybackStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PlaybackDiagnosticsLogger {
  warn(event: { scope: string; message: string; cause?: unknown }): void
  error(event: {
    scope: string
    message: string
    context?: Record<string, unknown>
    cause?: unknown
  }): void
}

export interface PlaybackDependencies {
  getAudioUrl(trackId: number): Promise<{ url: string } | null | undefined>
  getRandomTrack(excludeTrackId?: number): Promise<PlaybackTrack | null | undefined>
  getAlbumTracks(albumKey: {
    albumArtist: string
    album: string
  }): Promise<AlbumShuffleContext | null | undefined>
  getRandomAlbumTracks(excludeAlbumKey?: {
    albumArtist: string
    album: string
  }): Promise<AlbumShuffleContext | null | undefined>
  onLibraryChanged(
    callback: (event: { reason: string; trackIds: number[]; filePaths: string[] }) => void,
  ): () => void
  recordEffectivePlay(payload: {
    trackId: number
    sessionId: string
    playedAtIso: string
  }): Promise<{ ok: boolean }>
  storage: PlaybackStorage
  diagnostics: PlaybackDiagnosticsLogger
  createAudioRuntime?: (callbacks: PlaybackAudioCallbacks) => PlaybackAudioRuntime
}

export function createBrowserPlaybackDependencies(): PlaybackDependencies {
  return {
    getAudioUrl: (trackId) => auralis.playback.getAudioUrl(trackId),
    getRandomTrack: (excludeTrackId) =>
      auralis.playback.getRandomTrack(excludeTrackId) as Promise<PlaybackTrack | null | undefined>,
    getAlbumTracks: (albumKey) =>
      auralis.playback.getAlbumTracks(albumKey) as Promise<AlbumShuffleContext | null | undefined>,
    getRandomAlbumTracks: (excludeAlbumKey) =>
      auralis.playback.getRandomAlbumTracks(excludeAlbumKey) as Promise<
        AlbumShuffleContext | null | undefined
      >,
    onLibraryChanged: (callback) => auralis.library.onChanged(callback),
    recordEffectivePlay: (payload) => auralis.playback.recordEffectivePlay(payload),
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    diagnostics: {
      warn: (event) => rendererDiagnostics.warn(event),
      error: (event) => rendererDiagnostics.error(event),
    },
    createAudioRuntime: (callbacks) => createPlaybackAudioRuntime(callbacks),
  }
}
