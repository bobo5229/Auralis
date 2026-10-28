import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import type { PlaybackState } from '../types'
import { useFullscreenPlaybackControls } from './useFullscreenPlaybackControls'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./usePlaybackMetadataDisplay', () => ({
  usePlaybackMetadataDisplay: () => ({
    songText: (value: string) => value,
    playbackSubtitle: () => 'Artist - Album',
  }),
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const scopes: ReturnType<typeof effectScope>[] = []
function fixture() {
  const state = reactive<PlaybackState>({
    queue: [],
    currentIndex: 0,
    currentTrack: null,
    currentTrackId: null,
    selectedTrackId: null,
    playbackMode: 'sequential',
    isPlaying: false,
    isMuted: false,
    currentTime: 21,
    duration: 180,
    volume: 0.8,
    error: null,
  })
  const seekTo = vi.fn(),
    seekByRatio = vi.fn(),
    setVolume = vi.fn(),
    setPlaybackMode = vi.fn((mode: PlaybackState['playbackMode']) => {
      state.playbackMode = mode
    })
  const scope = effectScope()
  scopes.push(scope)
  const isOpen = ref(true)
  const session = scope.run(() =>
    useFullscreenPlaybackControls({
      isOpen,
      playback: { state, seekTo, seekByRatio, setVolume, setPlaybackMode },
    }),
  )!
  return { session, state, isOpen, seekTo, seekByRatio, setVolume, setPlaybackMode }
}
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})
describe('useFullscreenPlaybackControls', () => {
  it.each(['track', 'close', 'unseekable'] as const)(
    'cancels a drag on %s and accepts a fresh pointer afterwards',
    async (change) => {
      const f = fixture()
      f.state.currentTrackId = 1
      const captures = new Set<number>()
      const target = {
        getBoundingClientRect: () => ({ left: 0, width: 100 }),
        setPointerCapture: vi.fn((id: number) => captures.add(id)),
        hasPointerCapture: (id: number) => captures.has(id),
        releasePointerCapture: vi.fn((id: number) => captures.delete(id)),
      }
      const pointer = (clientX: number, pointerId: number) =>
        ({
          currentTarget: target,
          clientX,
          pointerId,
          button: 0,
          preventDefault: vi.fn(),
        }) as unknown as PointerEvent
      f.session.handleProgressPointerDown(pointer(25, 7))
      expect(f.session.progressRatio.value).toBe(0.25)
      if (change === 'track') f.state.currentTrackId = 2
      if (change === 'close') f.isOpen.value = false
      if (change === 'unseekable') f.state.duration = 0
      // Cancellation must be synchronous: the old pointer can end before the next paint.
      f.session.handleProgressPointerUp(pointer(75, 7))
      expect(f.seekByRatio).not.toHaveBeenCalled()
      expect(captures.size).toBe(0)
      f.isOpen.value = true
      f.state.duration = 180
      await nextTick()
      f.session.handleProgressPointerDown(pointer(80, 8))
      f.session.handleProgressPointerUp(pointer(90, 8))
      expect(f.seekByRatio).toHaveBeenCalledExactlyOnceWith(0.9)
    },
  )

  it('keeps metadata, progress and clock presentation in sync with the shared player', async () => {
    const f = fixture()
    expect(f.session.title.value).toBe('player.unknownTrack')
    expect(f.session.currentTimeLabel.value).toBe('0:21')
    expect(f.session.remainingTimeLabel.value).toBe('-2:39')
    expect(f.session.progressValueNow.value).toBe(12)
    f.session.imgError.value = true
    f.state.currentTrackId = 7
    f.state.currentTrack = {
      id: 7,
      title: 'Track',
      artist: null,
      album: null,
      albumArtist: null,
      durationSeconds: 180,
      artworkCacheKey: null,
    }
    await nextTick()
    expect(f.session.imgError.value).toBe(false)
    expect(f.session.title.value).toBe('Track')
    expect(f.session.subtitle.value).toBe('Artist - Album')
    f.state.currentTime = NaN
    f.state.duration = 0
    expect(f.session.currentTimeLabel.value).toBe('0:00')
    expect(f.session.remainingTimeLabel.value).toBe('-0:00')
  })
  it('cycles repeat through explicit player operations and preserves other modes', () => {
    const f = fixture()
    for (const mode of ['repeat-all', 'repeat-one', 'sequential'] as const) {
      f.session.handleRepeatClick()
      expect(f.setPlaybackMode).toHaveBeenLastCalledWith(mode)
    }
    f.state.playbackMode = 'shuffle'
    f.session.handleRepeatClick()
    expect(f.setPlaybackMode).toHaveBeenLastCalledWith('repeat-all')
    expect(f.session.repeatButtonLabel.value).toBe('fullscreen.repeatEnableOne')
    f.session.handleVolumeInput({ target: { value: '0.25' } } as unknown as Event)
    expect(f.setVolume).toHaveBeenCalledWith(0.25)
    f.state.isMuted = true
    expect(f.session.volumeIconClass.value).toBe('i-lucide-volume-x')
  })
  it('keeps five-second and Shift ten-second keyboard seeks', () => {
    const f = fixture()
    const key = (key: string, shiftKey = false) =>
      ({
        key,
        shiftKey,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }) as unknown as KeyboardEvent
    f.session.handleProgressKeydown(key('ArrowRight'))
    expect(f.seekTo).toHaveBeenLastCalledWith(26)
    f.session.handleProgressKeydown(key('ArrowLeft', true))
    expect(f.seekTo).toHaveBeenLastCalledWith(11)
  })
})
