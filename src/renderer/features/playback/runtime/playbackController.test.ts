import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackTrack } from '../types'
import { createPlaybackController } from './playbackController'
import type { PlaybackDependencies } from './playbackDependencies'

describe('playbackController unit tests with injected dependencies', () => {
  let deps: PlaybackDependencies
  let storageMap: Map<string, string>

  beforeEach(() => {
    storageMap = new Map()
    deps = {
      getAudioUrl: vi.fn(async (trackId: number) => ({ url: `audio://${trackId}` })),
      getRandomTrack: vi.fn(async () => null),
      getAlbumTracks: vi.fn(async () => null),
      getRandomAlbumTracks: vi.fn(async () => null),
      onLibraryChanged: vi.fn(() => () => undefined),
      recordEffectivePlay: vi.fn(async () => ({ ok: true, recorded: false })),
      storage: {
        getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storageMap.set(key, value)
        }),
      },
      diagnostics: {
        warn: vi.fn(),
        error: vi.fn(),
      },
      createAudioRuntime: vi.fn(() => ({
        start: vi.fn(async () => undefined),
        resume: vi.fn(async () => undefined),
        pause: vi.fn(),
        seek: vi.fn(async () => undefined),
        setVolume: vi.fn(),
        scheduleNext: vi.fn(async () => false),
        cancelScheduledNext: vi.fn(),
        clear: vi.fn(),
        getSnapshot: vi.fn(() => ({
          kind: 'idle' as const,
          trackId: null,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          hasCurrentData: false,
        })),
        dispose: vi.fn(),
      })),
    }
  })

  it('initializes with default volume and gapless settings from storage', () => {
    storageMap.set('auralis-volume', '0.6')
    storageMap.set('auralis-gapless-playback-enabled', 'true')
    const controller = createPlaybackController(deps)

    expect(controller.api.state.volume).toBe(0.6)
    expect(controller.api.gaplessPlaybackEnabled.value).toBe(true)
    expect(controller.api.state.queue).toEqual([])
    expect(controller.api.state.currentIndex).toBe(-1)
  })

  it('updates volume, persists to storage, and supports mute toggle', () => {
    const controller = createPlaybackController(deps)
    controller.api.setVolume(0.4)

    expect(controller.api.state.volume).toBe(0.4)
    expect(deps.storage.setItem).toHaveBeenCalledWith('auralis-volume', '0.4')

    controller.api.toggleMute()
    expect(controller.api.state.isMuted).toBe(true)

    controller.api.toggleMute()
    expect(controller.api.state.isMuted).toBe(false)
    expect(controller.api.state.volume).toBe(0.4)
  })

  it('supports selecting tracks and setting playback modes', () => {
    const controller = createPlaybackController(deps)
    controller.api.selectTrack(42)
    expect(controller.api.state.selectedTrackId).toBe(42)

    controller.api.setPlaybackMode('shuffle')
    expect(controller.api.state.playbackMode).toBe('shuffle')
  })

  it('allows safe multiple dispose calls (idempotence)', () => {
    const controller = createPlaybackController(deps)
    expect(() => {
      controller.dispose()
      controller.dispose()
    }).not.toThrow()
  })

  it('preserves previous shuffle pool in history when switching queues and restoring with playPrevious', async () => {
    const controller = createPlaybackController(deps)
    controller.api.setPlaybackMode('shuffle')

    const track1: PlaybackTrack = {
      id: 1,
      title: 'T1',
      artist: 'A',
      album: 'Alb',
      albumArtist: 'A',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const track2: PlaybackTrack = {
      id: 2,
      title: 'T2',
      artist: 'A',
      album: 'Alb',
      albumArtist: 'A',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const track3: PlaybackTrack = {
      id: 3,
      title: 'T3',
      artist: 'B',
      album: 'AlbB',
      albumArtist: 'B',
      durationSeconds: 120,
      artworkCacheKey: null,
    }

    const oldShufflePool = [track1, track2]
    const newShufflePool = [track3]

    // 1. Play in old queue with oldShufflePool
    await controller.api.playTrackFromQueue([track1, track2], 1, { shufflePool: oldShufflePool })
    expect(controller.api.state.currentTrackId).toBe(1)

    // 2. Switch to new queue with newShufflePool
    await controller.api.playTrackFromQueue([track3], 3, { shufflePool: newShufflePool })
    expect(controller.api.state.currentTrackId).toBe(3)

    // 3. User hits Previous
    await controller.api.playPrevious()

    // 4. Track 1 should be restored with old queue
    expect(controller.api.state.currentTrackId).toBe(1)
    expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2])

    // 5. Next should use the restored old shuffle pool, not the newer pool containing track 3
    await controller.api.playNext()
    expect(controller.api.state.currentTrackId).toBe(2)
  })

  it('provides clearError action to clear error state without external direct mutation', () => {
    const controller = createPlaybackController(deps)
    ;(controller.api.state as { error: string | null }).error = 'Some test error'
    expect(controller.api.state.error).toBe('Some test error')

    controller.api.clearError()
    expect(controller.api.state.error).toBeNull()
  })
})
