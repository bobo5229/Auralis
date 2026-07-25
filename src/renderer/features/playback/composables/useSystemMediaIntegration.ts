import { onScopeDispose, watch } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { usePlayback } from './usePlayback'

let isInitialized = false

/** Chromium MediaImage 仅允许 http/https/data/blob，不能用 auralis-artwork:// */
const MEDIA_SESSION_ARTWORK_SCHEMES = /^(https?:|data:|blob:)/i

interface ResolvedMediaArtwork {
  src: string
  /** true 表示本函数 createObjectURL，调用方负责 revoke */
  owned: boolean
  type?: string
}

/**
 * 将应用内封面协议转为 Media Session 可用的 http/https/data/blob URL。
 * 失败时返回 null（元数据仍可无封面写入）。
 */
async function resolveMediaSessionArtworkSrc(
  source: string | null,
): Promise<ResolvedMediaArtwork | null> {
  if (!source) return null
  if (MEDIA_SESSION_ARTWORK_SCHEMES.test(source)) {
    return { src: source, owned: false }
  }

  try {
    const response = await fetch(source)
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size === 0) return null
    return {
      src: URL.createObjectURL(blob),
      owned: true,
      type: blob.type || 'image/jpeg',
    }
  } catch {
    // 回退：Image + canvas（避免个别环境下自定义协议 fetch 失败）
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.decoding = 'async'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('artwork image load failed'))
        img.src = source
      })

      const width = image.naturalWidth || 512
      const height = image.naturalHeight || 512
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(image, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      })
      if (!blob) return null
      return {
        src: URL.createObjectURL(blob),
        owned: true,
        type: blob.type || 'image/jpeg',
      }
    } catch {
      return null
    }
  }
}

export function useSystemMediaIntegration(): void {
  if (isInitialized) return
  isInitialized = true

  const playback = usePlayback()
  const mediaSession = 'mediaSession' in navigator ? navigator.mediaSession : null
  const registeredActions: MediaSessionAction[] = []

  let metadataGeneration = 0
  let activeArtworkBlobUrl: string | null = null

  const revokeActiveArtworkBlob = (): void => {
    if (!activeArtworkBlobUrl) return
    URL.revokeObjectURL(activeArtworkBlobUrl)
    activeArtworkBlobUrl = null
  }

  const applyMetadata = (init: MediaMetadataInit): void => {
    if (!mediaSession) return
    try {
      mediaSession.metadata = new MediaMetadata(init)
    } catch {
      try {
        mediaSession.metadata = new MediaMetadata({
          title: init.title,
          artist: init.artist,
          album: init.album,
        })
      } catch {
        mediaSession.metadata = null
      }
    }
  }

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

      const generation = ++metadataGeneration

      if (trackId === null) {
        revokeActiveArtworkBlob()
        mediaSession.metadata = null
        return
      }

      const base: MediaMetadataInit = {
        title: title?.trim() || '未知标题',
        artist: artist?.trim() || '',
        album: album?.trim() || '',
      }

      // 先写无封面元数据，避免等待封面时控制信息空白；封面异步补上
      applyMetadata(base)

      const artworkUrl = getArtworkUrl(artworkCacheKey)
      void (async () => {
        const resolved = await resolveMediaSessionArtworkSrc(artworkUrl)
        if (generation !== metadataGeneration) {
          if (resolved?.owned) URL.revokeObjectURL(resolved.src)
          return
        }

        revokeActiveArtworkBlob()
        if (resolved?.owned) {
          activeArtworkBlobUrl = resolved.src
        }

        applyMetadata({
          ...base,
          ...(resolved
            ? {
                artwork: [
                  {
                    src: resolved.src,
                    sizes: '512x512',
                    type: resolved.type,
                  },
                ],
              }
            : {}),
        })
      })()
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
    metadataGeneration += 1
    stopMetadataWatch()
    stopPlaybackStateWatch()
    stopPositionWatch()
    unsubscribeThumbarCommands()
    revokeActiveArtworkBlob()
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
