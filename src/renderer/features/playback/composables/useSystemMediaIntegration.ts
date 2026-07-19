import { onScopeDispose, watch } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { usePlayback } from './usePlayback'

let isInitialized = false

export function useSystemMediaIntegration(): void {
  if (isInitialized) return
  isInitialized = true

  const playback = usePlayback()
  const mediaSession = 'mediaSession' in navigator ? navigator.mediaSession : null
  const registeredActions: MediaSessionAction[] = []

  const registerAction = (action: MediaSessionAction, handler: MediaSessionActionHandler): void => {
    if (!mediaSession) return

    try {
      mediaSession.setActionHandler(action, handler)
      registeredActions.push(action)
    } catch {
      // Chromium/OS combinations may expose Media Session without every action.
    }
  }

  registerAction('play', () => void playback.play())
  registerAction('pause', () => playback.pause())
  registerAction('previoustrack', () => void playback.playPrevious())
  registerAction('nexttrack', () => void playback.playNext())
  registerAction('seekto', (details) => {
    if (typeof details.seekTime === 'number') playback.seekTo(details.seekTime)
  })
  registerAction('seekbackward', (details) => {
    playback.seekTo(playback.state.currentTime - (details.seekOffset ?? 10))
  })
  registerAction('seekforward', (details) => {
    playback.seekTo(playback.state.currentTime + (details.seekOffset ?? 10))
  })

  const stopMetadataWatch = watch(
    () => {
      const track = playback.state.currentTrack
      return [
        track?.id ?? null,
        track?.title ?? null,
        track?.artist ?? null,
        track?.album ?? null,
        track?.artworkCacheKey ?? null,
      ] as const
    },
    ([trackId, title, artist, album, artworkCacheKey]) => {
      if (!mediaSession) return

      if (trackId === null) {
        mediaSession.metadata = null
        return
      }

      const artworkUrl = getArtworkUrl(artworkCacheKey)
      const metadata: MediaMetadataInit = {
        title: title?.trim() || '未知标题',
        artist: artist?.trim() || '',
        album: album?.trim() || '',
        ...(artworkUrl ? { artwork: [{ src: artworkUrl }] } : {}),
      }

      try {
        mediaSession.metadata = new MediaMetadata(metadata)
      } catch {
        // Keep transport controls available even if this Chromium build rejects a custom artwork URL.
        try {
          mediaSession.metadata = new MediaMetadata({
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
          })
        } catch {
          mediaSession.metadata = null
        }
      }
    },
    { immediate: true },
  )

  const stopPlaybackStateWatch = watch(
    () => [playback.state.currentTrack !== null, playback.state.isPlaying] as const,
    ([hasTrack, isPlaying]) => {
      auralis.systemMedia.updateThumbarState({ hasTrack, isPlaying })

      if (!mediaSession) return
      try {
        mediaSession.playbackState = hasTrack ? (isPlaying ? 'playing' : 'paused') : 'none'
      } catch {
        // Media Session may be present but unavailable on the current platform.
      }
    },
    { immediate: true },
  )

  const stopPositionWatch = watch(
    () => [playback.state.duration, playback.state.currentTime] as const,
    ([duration, currentTime]) => {
      if (!mediaSession?.setPositionState) return

      try {
        if (!Number.isFinite(duration) || duration <= 0) {
          mediaSession.setPositionState()
          return
        }

        const position = Number.isFinite(currentTime)
          ? Math.min(duration, Math.max(0, currentTime))
          : 0
        mediaSession.setPositionState({ duration, position, playbackRate: 1 })
      } catch {
        // Ignore transient invalid duration/position values while a new track loads.
      }
    },
    { immediate: true },
  )

  const unsubscribeThumbarCommands = auralis.systemMedia.onCommand((command) => {
    switch (command) {
      case 'previous':
        void playback.playPrevious()
        break
      case 'toggle-play-pause':
        void playback.togglePlayPause()
        break
      case 'next':
        void playback.playNext()
        break
    }
  })

  onScopeDispose(() => {
    stopMetadataWatch()
    stopPlaybackStateWatch()
    stopPositionWatch()
    unsubscribeThumbarCommands()
    auralis.systemMedia.updateThumbarState({ hasTrack: false, isPlaying: false })

    if (mediaSession) {
      for (const action of registeredActions) {
        try {
          mediaSession.setActionHandler(action, null)
        } catch {
          // The platform may stop accepting actions during renderer teardown.
        }
      }
      mediaSession.metadata = null
      mediaSession.playbackState = 'none'
    }

    isInitialized = false
  })
}
