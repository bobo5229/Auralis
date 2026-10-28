import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { i18n } from '@renderer/i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { useSystemMediaIntegration } from './useSystemMediaIntegration'
import type { PlaybackTrack } from '../types'

const playback = {
  state: reactive({
    currentTrack: {
      id: 1,
      title: null,
      artist: '原文艺术家',
      album: '原文专辑',
      albumArtist: null,
      durationSeconds: 120,
      artworkCacheKey: null,
    } as PlaybackTrack | null,
    isPlaying: true,
    currentTime: 42,
    duration: 120,
  }),
  play: vi.fn(),
  pause: vi.fn(),
  playPrevious: vi.fn(),
  playNext: vi.fn(),
  togglePlayPause: vi.fn(),
  seekTo: vi.fn(),
}
vi.mock('./usePlayback', () => ({ usePlayback: () => playback }))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    systemMedia: { updateThumbarState: vi.fn(), onCommand: vi.fn(() => () => undefined) },
  },
}))

afterEach(() => {
  i18n.global.locale.value = 'zh-Hans'
  vi.unstubAllGlobals()
})

describe('system media UI locale', () => {
  it('refreshes a missing title without changing playback or translating real metadata', async () => {
    const mediaSession = {
      metadata: null as MediaMetadata | null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
      setPositionState: vi.fn(),
    }
    vi.stubGlobal('navigator', { mediaSession })
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(init: MediaMetadataInit) {
          Object.assign(this, init)
        }
      },
    )
    const scope = effectScope()
    try {
      scope.run(useSystemMediaIntegration)
      await nextTick()
      expect(mediaSession.metadata?.title).toBe('未知歌曲')
      i18n.global.locale.value = 'en'
      await nextTick()
      expect(mediaSession.metadata?.title).toBe('Unknown track')
      expect(mediaSession.metadata?.artist).toBe('原文艺术家')
      expect(mediaSession.metadata?.album).toBe('原文专辑')
      expect(playback.state.currentTime).toBe(42)
      expect(playback.state.isPlaying).toBe(true)
      expect(playback.play).not.toHaveBeenCalled()
      expect(playback.pause).not.toHaveBeenCalled()
      expect(playback.seekTo).not.toHaveBeenCalled()
      expect(auralis.systemMedia.updateThumbarState).toHaveBeenCalledTimes(1)

      playback.state.currentTrack!.title = '原文歌曲'
      await nextTick()
      const realMetadata = mediaSession.metadata
      i18n.global.locale.value = 'zh-Hans'
      await nextTick()
      expect(mediaSession.metadata).toBe(realMetadata)
      expect(mediaSession.metadata?.title).toBe('原文歌曲')
    } finally {
      scope.stop()
    }
  })
})
